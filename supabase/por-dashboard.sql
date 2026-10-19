-- ============================================================
-- POR dashboard
--
-- The menus, contacts and shop details used to reach the app only through a
-- build: a POR sent a workbook, a Python script turned it into JSON, and the
-- JSON shipped with the next deploy. This lets the POR who owns a dataset
-- publish it themselves, from the app, and have students see it the next
-- time they open it.
--
-- What it adds:
--   por_access         which role account may edit which dataset
--   dataset_versions   the last five published versions of each, newest live
--   live_versions()    what students ask first: the newest version number of
--                      each dataset, a few hundred bytes
--   live_datasets()    then only the datasets whose number they don't have
--
-- Publishing goes live at once — there is no approval step, by decision. What
-- makes that survivable is that a publish never overwrites: it is an insert,
-- the table has no update or delete policy, and restoring an older version is
-- just publishing its payload again. A bad edit is one tap from undone, and
-- the history says which account made it. Only the last five versions of
-- each dataset are kept (decided 2026-10-19); older ones are pruned by the
-- database itself, so no client can keep more or remove fewer.
--
-- Run once in the Supabase SQL Editor. Every statement is guarded, so
-- re-running it is safe.
--
--   psql "$DATABASE_URL" -f supabase/por-dashboard.sql
-- ============================================================


-- ---------- who may edit what ----------
-- Keyed by address, not by a profile flag. The PORs sign in with shared role
-- accounts (nhmessrep@, pgprep@ …) that pass from one team to the next, so
-- the address is the stable thing; a profile flag would also need the
-- account to have signed in once before it could be granted.
--
-- Written from the SQL editor only. There is no insert policy, so no account
-- can grant itself a dataset.
create table if not exists public.por_access (
  email  text not null check (email = lower(trim(email)) and email like '%@%'),
  kind   text not null check (kind in (
           'day-mess', 'night-canteen', 'tuck', 'por-contacts',
           'schedule', 'course-list', 'schedule-changes', 'faculty')),
  scope  text not null check (scope ~ '^[a-z0-9-]{1,32}$'),
  primary key (email, kind, scope)
);

alter table public.por_access enable row level security;

-- The caller's address, read from auth.users rather than from the token, so
-- it is the address the domain trigger in schema.sql actually checked.
-- SECURITY DEFINER because authenticated users cannot read auth.users.
create or replace function public.my_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(u.email) from auth.users u where u.id = auth.uid();
$$;

-- An account reads its own grants, which is how the app decides to show it
-- the dashboard instead of the student screens. The admin reads them all,
-- which is how the admin's copy of the dashboard lists every dataset.
drop policy if exists "own access read" on public.por_access;
create policy "own access read" on public.por_access
  for select using (email = public.my_email() or public.is_admin());

create or replace function public.can_edit_dataset(p_kind text, p_scope text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.por_access a
     where a.email = public.my_email()
       and a.kind = p_kind
       and a.scope = p_scope
  );
$$;

-- The owners agreed on 2026-10-18. Datasets the dashboard can't edit yet are
-- granted anyway, so the dashboard can say "coming" rather than show nothing.
insert into public.por_access (email, kind, scope) values
  ('pgprep@email.iimcal.ac.in',     'schedule',         'pgp2'),
  ('pgprep@email.iimcal.ac.in',     'schedule',         'pgp1'),
  ('pgprep@email.iimcal.ac.in',     'course-list',      'all'),
  ('pgprep@email.iimcal.ac.in',     'schedule-changes', 'all'),
  ('pgprep@email.iimcal.ac.in',     'faculty',          'all'),
  ('president@email.iimcal.ac.in',  'por-contacts',     'all'),
  ('nhmessrep@email.iimcal.ac.in',  'day-mess',         'nh'),
  ('nhmessrep@email.iimcal.ac.in',  'night-canteen',    'nh'),
  ('ohmessrep@email.iimcal.ac.in',  'day-mess',         'oh'),
  ('ohmessrep@email.iimcal.ac.in',  'night-canteen',    'oh'),
  ('lvhmessrep@email.iimcal.ac.in', 'day-mess',         'lvh'),
  ('lvhmessrep@email.iimcal.ac.in', 'night-canteen',    'lvh'),
  ('whmessrep@email.iimcal.ac.in',  'day-mess',         'wh'),
  ('whmessrep@email.iimcal.ac.in',  'night-canteen',    'wh'),
  ('ohrep@email.iimcal.ac.in',      'tuck',             'mohanda'),
  ('whrep@email.iimcal.ac.in',      'tuck',             'tagore')
on conflict do nothing;


-- ---------- every published version ----------
create table if not exists public.dataset_versions (
  id               bigint generated always as identity primary key,
  kind             text not null,
  scope            text not null check (scope ~ '^[a-z0-9-]{1,32}$'),
  -- In exactly the shape the bundled JSON has for one item — one hostel's
  -- object from menu.json, say — so the app can swap it in without a
  -- translation layer that could disagree with the build scripts.
  payload          jsonb not null check (octet_length(payload::text) <= 262144),
  -- Set when this version is an older one published again. A marker, not a
  -- foreign key: the version it came from may since have been pruned, and
  -- that must not stop pruning or undo the "restored" label.
  restored_from    bigint,
  -- Stamped by the trigger, never taken from the client.
  created_by       uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at       timestamptz not null default now()
);

create index if not exists dataset_versions_live_idx
  on public.dataset_versions (kind, scope, created_at desc, id desc);

alter table public.dataset_versions enable row level security;

-- The owner sees the history of what they own. Students never read this
-- table: they get the live versions through live_datasets(), without the
-- history or who wrote it.
drop policy if exists "owners read history" on public.dataset_versions;
create policy "owners read history" on public.dataset_versions
  for select using (public.can_edit_dataset(kind, scope));

drop policy if exists "owners publish" on public.dataset_versions;
create policy "owners publish" on public.dataset_versions
  for insert with check (public.can_edit_dataset(kind, scope));

-- No update or delete policy, deliberately: history that its own subject can
-- rewrite is not history. The only deletes are prune_dataset_versions()'s.


-- ---------- what a day mess menu must look like ----------
-- The same rules as validateDayMess() in src/lib/datasets.js. The app checks
-- first so the POR gets a readable message; this is the check that holds when
-- somebody calls the API directly.
create or replace function public.check_day_mess(p jsonb, p_scope text)
returns void
language plpgsql
immutable
as $$
declare
  meals text[] := array['Breakfast', 'Lunch', 'Snacks', 'Dinner'];
  week  text[] := array['Monday', 'Tuesday', 'Wednesday', 'Thursday',
                        'Friday', 'Saturday', 'Sunday'];
  d     jsonb;
  bad   text;
begin
  if jsonb_typeof(p) is distinct from 'object' then
    raise exception 'A day mess menu must be an object.';
  end if;

  select string_agg(k, ', ') into bad
    from jsonb_object_keys(p) k
   where k <> all (array['id', 'name', 'days', 'everyday', 'timings']);
  if bad is not null then
    raise exception 'Unexpected field(s) in the menu: %.', bad;
  end if;

  if p->>'id' is distinct from p_scope then
    raise exception 'This menu says it is for "%", but it is being published for "%".',
      p->>'id', p_scope;
  end if;
  if coalesce(trim(p->>'name'), '') = '' then
    raise exception 'The menu has no hostel name.';
  end if;

  if jsonb_typeof(p->'days') is distinct from 'array' then
    raise exception 'The menu has no week.';
  end if;
  -- Each day exactly once: seven entries whose names, sorted, are the week.
  if (select array_agg(x->>'day' order by x->>'day') from jsonb_array_elements(p->'days') x)
     is distinct from (select array_agg(w order by w) from unnest(week) w) then
    raise exception 'The week must have each day from Monday to Sunday exactly once.';
  end if;

  for d in select * from jsonb_array_elements(p->'days') loop
    if jsonb_typeof(d->'meals') is distinct from 'object' then
      raise exception '% has no meals.', d->>'day';
    end if;
    if exists (select 1 from jsonb_each(d->'meals') e
                where e.key <> all (meals)
                   or jsonb_typeof(e.value) <> 'string'
                   or length(e.value #>> '{}') > 600) then
      raise exception '% has a meal that is not one of the four, or is too long.', d->>'day';
    end if;
  end loop;

  if jsonb_typeof(coalesce(p->'everyday', '{}')) <> 'object'
     or exists (select 1 from jsonb_each(coalesce(p->'everyday', '{}')) e
                 where e.key <> all (meals)
                    or jsonb_typeof(e.value) <> 'string'
                    or length(e.value #>> '{}') > 600) then
    raise exception 'The every-day items must be listed against the four meals.';
  end if;

  if jsonb_typeof(coalesce(p->'timings', '{}')) <> 'object'
     or exists (select 1 from jsonb_each(coalesce(p->'timings', '{}')) e
                 where e.key <> all (meals)
                    or jsonb_typeof(e.value) <> 'string'
                    or length(e.value #>> '{}') > 60) then
    raise exception 'Timings must be given against the four meals, briefly.';
  end if;
end $$;


-- ---------- stamping and checking a publish ----------
create or replace function public.stamp_dataset_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Who and when are the server's to say, so the history can be trusted.
  new.created_by       := auth.uid();
  new.created_by_email := public.my_email();
  new.created_at       := now();

  -- A version that has since been pruned is fine to restore — the payload
  -- comes with the request — but one from another dataset is not.
  if new.restored_from is not null and exists (
    select 1 from public.dataset_versions v
     where v.id = new.restored_from and (v.kind <> new.kind or v.scope <> new.scope)
  ) then
    raise exception 'That version belongs to a different dataset.';
  end if;

  -- A kind is accepted only once the app can read it. A payload for a kind
  -- with no checker would sit live in the table, unvalidated, waiting for the
  -- first version of the app that does read it.
  case new.kind
    when 'day-mess' then perform public.check_day_mess(new.payload, new.scope);
    else raise exception 'The dashboard does not accept "%" yet.', new.kind;
  end case;

  return new;
end $$;

drop trigger if exists dataset_versions_stamp on public.dataset_versions;
create trigger dataset_versions_stamp
  before insert on public.dataset_versions
  for each row execute function public.stamp_dataset_version();


-- ---------- keeping the last five ----------
-- After every publish, everything older than that dataset's five newest goes.
-- Five is KEEP_VERSIONS in src/lib/datasets.js, which the dashboard and its
-- guide quote; change both together. The newest is never pruned, so what
-- students are shown is never what goes.
create or replace function public.prune_dataset_versions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.dataset_versions v
   where v.kind = new.kind
     and v.scope = new.scope
     and v.id not in (
       select k.id from public.dataset_versions k
        where k.kind = new.kind and k.scope = new.scope
        order by k.created_at desc, k.id desc
        limit 5
     );
  return null;
end $$;

drop trigger if exists dataset_versions_prune on public.dataset_versions;
create trigger dataset_versions_prune
  after insert on public.dataset_versions
  for each row execute function public.prune_dataset_versions();


-- ---------- what students read ----------
-- Two steps, so that a phone which already holds the current menus pays a
-- few hundred bytes to learn so, rather than downloading all of them again.
--
-- First the newest version number of each dataset — not the history, not the
-- account that wrote it, not the payload.
create or replace function public.live_versions()
returns table (kind text, scope text, version_id bigint, published_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (v.kind, v.scope)
         v.kind, v.scope, v.id, v.created_at
    from public.dataset_versions v
   where auth.uid() is not null
   order by v.kind, v.scope, v.created_at desc, v.id desc;
$$;

-- Then the newest version of just the datasets asked for, named 'kind:scope'.
-- Asked by name rather than by version number, so a publish landing between
-- the two calls hands back the newer one instead of nothing.
create or replace function public.live_datasets(p_keys text[])
returns table (kind text, scope text, version_id bigint, payload jsonb, published_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select distinct on (v.kind, v.scope)
         v.kind, v.scope, v.id, v.payload, v.created_at
    from public.dataset_versions v
   where auth.uid() is not null
     and v.kind || ':' || v.scope = any (p_keys)
   order by v.kind, v.scope, v.created_at desc, v.id desc;
$$;

revoke all on function public.live_versions() from public, anon;
grant execute on function public.live_versions() to authenticated;
revoke all on function public.live_datasets(text[]) from public, anon;
grant execute on function public.live_datasets(text[]) to authenticated;
