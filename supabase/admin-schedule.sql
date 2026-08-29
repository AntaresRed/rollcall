-- ============================================================
-- Super-admin schedule publishing.
--
-- Run this once in the Supabase SQL Editor. Every statement is guarded, so
-- re-running it is safe.
--
-- What it adds:
--   profiles.is_admin      who may publish
--   catalogues             uploaded schedules, one of them live
--   publish_catalogue()    the single atomic act of going live
--
-- The point of the `catalogues` table is that uploading and publishing are
-- different things. An upload is inert: it sits there as a draft and changes
-- nothing for anybody. Publishing is what moves the term dates, the breaks,
-- and everyone's saved class rows.
-- ============================================================


-- ---------- who may publish ----------
-- A flag rather than a hardcoded address, so a second admin is one UPDATE
-- rather than a migration. The client also checks this, but only to decide
-- whether to draw the screen — the policies below are the actual gate.
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- The profile row is created by handle_new_user() on first sign-in, so this
-- only takes effect once the admin has signed in at least once. Re-run it
-- afterwards if it reports 0 rows.
do $$
declare
  n int;
begin
  update public.profiles p
     set is_admin = true
    from auth.users u
   where u.id = p.id
     and lower(u.email) = 'anuja2027@email.iimcal.ac.in';
  get diagnostics n = row_count;
  if n = 0 then
    raise notice 'No profile matched anuja2027@email.iimcal.ac.in — sign in once, then re-run this file.';
  else
    raise notice 'Granted admin to % profile(s).', n;
  end if;
end $$;

-- Reads the caller's own flag. SECURITY DEFINER so it can be used inside the
-- policies on `profiles` itself without recursing through them.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;


-- ---------- uploaded schedules ----------
create table if not exists public.catalogues (
  id            uuid primary key default gen_random_uuid(),
  -- The whole catalogue.json, exactly as scripts/build_catalogue.py emits it.
  payload       jsonb       not null,
  label         text        not null,
  source_name   text,
  note          text,
  uploaded_by   uuid        references auth.users(id) on delete set null,
  uploaded_at   timestamptz not null default now(),
  published_at  timestamptz,
  is_published  boolean     not null default false
);

-- At most one live schedule. A partial unique index says so in the database
-- rather than trusting every future caller to remember.
create unique index if not exists catalogues_one_published
  on public.catalogues (is_published) where is_published;

create index if not exists catalogues_uploaded_idx
  on public.catalogues (uploaded_at desc);

alter table public.catalogues enable row level security;

-- Students read the live one — that is how the app gets its courses without a
-- redeploy. Admins see drafts too.
drop policy if exists "read published catalogue" on public.catalogues;
create policy "read published catalogue" on public.catalogues
  for select using (is_published or public.is_admin());

drop policy if exists "admins manage catalogues" on public.catalogues;
create policy "admins manage catalogues" on public.catalogues
  for all using (public.is_admin()) with check (public.is_admin());

-- A student may read their own profile; nobody may hand themselves the admin
-- flag. The existing "own profile" policy is FOR ALL, which would have let a
-- signed-in user set is_admin on their own row via PostgREST.
drop policy if exists "own profile" on public.profiles;
create policy "own profile read" on public.profiles
  for select using (auth.uid() = id);
create policy "own profile insert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- is_admin may only stay as it is, unless an admin is doing the changing.
    -- Compared against is_admin(), which is SECURITY DEFINER and so reads the
    -- stored value without re-entering these policies — a plain sub-select on
    -- profiles here would be a policy on the table querying the same table.
    and (is_admin = public.is_admin() or public.is_admin())
  );


-- ---------- going live ----------
-- One transaction: the term, its breaks, and every student's saved rows move
-- together or not at all.
create or replace function public.publish_catalogue(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cat        public.catalogues;
  cal        jsonb;
  term       public.terms;
  rows_fixed int := 0;
  brk        jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator can publish a schedule.'
      using errcode = '42501';
  end if;

  select * into cat from public.catalogues where id = p_id;
  if cat.id is null then
    raise exception 'No such catalogue: %', p_id;
  end if;

  cal := cat.payload -> 'calendar';
  if cal is null or cal ->> 'term_start' is null or cal ->> 'term_end' is null then
    raise exception 'That catalogue has no usable calendar block; refusing to publish.';
  end if;

  -- ----- the term itself -----
  -- Matched on label so re-publishing a corrected file for the same term
  -- edits it in place, while a genuinely new term becomes a new row.
  select * into term from public.terms where label = coalesce(cat.payload ->> 'term', cat.label);

  if term.id is null then
    insert into public.terms (label, term_start, pre_mid_end, post_mid_start, term_end, is_current)
    values (
      coalesce(cat.payload ->> 'term', cat.label),
      (cal ->> 'term_start')::date,
      (cal ->> 'pre_mid_end')::date,
      (cal ->> 'post_mid_start')::date,
      (cal ->> 'term_end')::date,
      true
    )
    returning * into term;
  else
    update public.terms
       set term_start     = (cal ->> 'term_start')::date,
           pre_mid_end    = (cal ->> 'pre_mid_end')::date,
           post_mid_start = (cal ->> 'post_mid_start')::date,
           term_end       = (cal ->> 'term_end')::date,
           is_current     = true
     where id = term.id
    returning * into term;
  end if;

  update public.terms set is_current = false where id <> term.id and is_current;

  -- ----- its breaks -----
  delete from public.term_breaks where term_id = term.id;
  for brk in select * from jsonb_array_elements(coalesce(cal -> 'breaks', '[]'::jsonb))
  loop
    insert into public.term_breaks (term_id, label, from_date, to_date, note)
    values (
      term.id,
      coalesce(brk ->> 'label', 'No classes'),
      (brk ->> 'from')::date,
      (brk ->> 'to')::date,
      brk ->> 'note'
    );
  end loop;

  -- ----- bring saved student rows back in line -----
  -- Matched on (course_code, section, day_of_week, start_time), which is what
  -- identifies one meeting of one section. Corrections to phase, venue, credit
  -- rules and end time reach every student who already picked the course.
  --
  -- Deliberately narrow: no row is created and none is deleted. Nobody's
  -- course list changes underneath them, the row id survives so attendance
  -- stays attached, and `muted` — which is the student's own choice, not the
  -- catalogue's — is never touched.
  with meetings as (
    select distinct
      c ->> 'code'                                            as course_code,
      s.key                                                   as section,
      (m ->> 'day')::int                                      as day_of_week,
      (m ->> 'start')::time                                   as start_time,
      (m ->> 'end')::time                                     as end_time,
      coalesce(m ->> 'phase', c ->> 'phase', 'full')           as term_phase,
      coalesce((c ->> 'credits')::numeric, 3.0)               as credits,
      coalesce((c ->> 'total_classes')::int, 20)              as total_classes,
      coalesce((c ->> 'min_pct')::int, 75)                    as min_pct,
      nullif(c ->> 'venue', '')                               as room
    from jsonb_array_elements(cat.payload -> 'courses') c
    cross join lateral jsonb_each(c -> 'sections') s(key, value)
    cross join lateral jsonb_array_elements(s.value) m
  )
  update public.classes cl
     set term_phase    = mt.term_phase,
         credits       = mt.credits,
         total_classes = mt.total_classes,
         min_pct       = mt.min_pct,
         room          = mt.room,
         end_time      = coalesce(mt.end_time, cl.end_time)
    from meetings mt
   where mt.course_code = cl.course_code
     and mt.section     = cl.section
     and mt.day_of_week = cl.day_of_week
     and mt.start_time  = cl.start_time
     and (cl.term_phase    is distinct from mt.term_phase
       or cl.credits       is distinct from mt.credits
       or cl.total_classes is distinct from mt.total_classes
       or cl.min_pct       is distinct from mt.min_pct
       or cl.room          is distinct from mt.room
       or cl.end_time      is distinct from coalesce(mt.end_time, cl.end_time));
  get diagnostics rows_fixed = row_count;

  -- ----- flip the flag last -----
  update public.catalogues set is_published = false, published_at = null
   where is_published and id <> p_id;
  update public.catalogues
     set is_published = true, published_at = now()
   where id = p_id;

  return jsonb_build_object(
    'catalogue_id', p_id,
    'term',         term.label,
    'term_start',   term.term_start,
    'term_end',     term.term_end,
    'breaks',       jsonb_array_length(coalesce(cal -> 'breaks', '[]'::jsonb)),
    'courses',      jsonb_array_length(coalesce(cat.payload -> 'courses', '[]'::jsonb)),
    'rows_realigned', rows_fixed
  );
end $$;

revoke all on function public.publish_catalogue(uuid) from public;
grant execute on function public.publish_catalogue(uuid) to authenticated;


-- ---------- seed the live catalogue from what is already deployed ----------
-- Optional. Until a catalogue is published the app falls back to the copy
-- compiled into the bundle, so nothing breaks by leaving this alone.
--
--   insert into public.catalogues (payload, label, source_name, note, is_published, published_at)
--   values ('<paste src/data/catalogue.json here>'::jsonb,
--           'Term V', 'catalogue.json', 'seeded from the deployed bundle', true, now());
