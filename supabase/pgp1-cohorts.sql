-- ============================================================
-- Two years at once: scope terms and catalogues by cohort.
--
-- Until now the app served one batch, so there was one current term and one
-- published catalogue. With first years as well there are two of each, running
-- on different dates with different exam weeks.
--
-- The thing that identifies a student is their GRADUATING YEAR, which is
-- already in their address: anuja2027@ graduates in 2027. That is worth
-- storing because, unlike "PGP1" or "PGP2", it never changes — a person does
-- not stop being the class of 2027. What moves each August is which term is
-- published for that cohort, so nobody has to be promoted and no annual script
-- has to be remembered.
--
--   2027  ->  Term V   (this year's second years)
--   2028  ->  Term II  (this year's first years)
--   2029  ->  next year's intake, when you publish for them
--
-- Safe to run on its own, and safe to run twice. It changes nothing an
-- existing client can see: there is still exactly one current term until a
-- second cohort's catalogue is published, so the old app keeps working while
-- the new one rolls out.
--
-- Run this BEFORE deploying the cohort-aware app, and publish the PGP1
-- catalogue only AFTER that deploy. An old client asks for the current term
-- without naming a cohort, so a second one existing too early could hand a
-- second year the first years' dates.
-- ============================================================


-- ---------- 1. reading the cohort out of an address ----------
-- The four digits immediately before the @, so a name containing digits
-- (r2d22028@) still resolves to 2028 rather than 2. POSIX classes, not \d.
create or replace function public.cohort_of(p_email text)
returns int
language sql
immutable
as $$
  select substring(lower(coalesce(p_email, '')) from '(20[0-9]{2})@')::int;
$$;

comment on function public.cohort_of(text) is
  'Graduating year from an institute address, or null if it carries none.';


-- ---------- 2. the columns ----------
alter table public.profiles   add column if not exists cohort_year int;
alter table public.terms      add column if not exists cohort_year int;
alter table public.catalogues add column if not exists cohort_year int;

-- Deliberately nullable with NO default. handle_new_user() inserts only the
-- id, so a default would silently stamp every future first year with this
-- year's cohort. Null means "not worked out yet", which the app can act on.
comment on column public.profiles.cohort_year is
  'Graduating year, derived from the address at sign-up. Never needs bumping.';


-- ---------- 3. backfill ----------
-- Every current user is a second year graduating 2027; derive it anyway rather
-- than assuming, so an address that does not parse shows up as null instead of
-- being quietly mislabelled.
update public.profiles p
   set cohort_year = public.cohort_of(u.email)
  from auth.users u
 where u.id = p.id
   and p.cohort_year is distinct from public.cohort_of(u.email);

-- Anyone predating the profile trigger has no row at all.
insert into public.profiles (id, cohort_year)
select u.id, public.cohort_of(u.email) from auth.users u
on conflict (id) do nothing;

-- Everything published so far belongs to the current second years.
update public.terms      set cohort_year = 2027 where cohort_year is null;
update public.catalogues set cohort_year = 2027 where cohort_year is null;


-- ---------- 4. stamp the cohort on new accounts ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, cohort_year)
  values (new.id, public.cohort_of(new.email))
  on conflict (id) do nothing;
  return new;
end $$;


-- ---------- 5. one live row PER COHORT, not one overall ----------
-- The old index allowed a single published catalogue anywhere, which would now
-- mean publishing for first years unpublishes the second years'.
drop index if exists public.catalogues_one_published;
create unique index if not exists catalogues_one_published_per_cohort
  on public.catalogues (cohort_year) where is_published;

-- terms had no such index — nothing stopped two rows claiming is_current, and
-- the app simply took the first. Now that two are legitimate, say which two.
--
-- Checked first: because nothing ever enforced this, the table may already
-- hold two current rows for one cohort, and creating the index would fail
-- halfway through this file with a duplicate-key error that says nothing about
-- what to do. Better to say it plainly and leave the database untouched.
do $$
declare dupe text;
begin
  select string_agg(format('cohort %s has %s current terms', cohort_year, n), '; ')
    into dupe
    from (select cohort_year, count(*) as n from public.terms
           where is_current group by cohort_year having count(*) > 1) x;
  if dupe is not null then
    raise exception
      'Cannot scope terms by cohort yet: %. Decide which one is live and set '
      'is_current = false on the other, then run this file again.', dupe;
  end if;
end $$;

create unique index if not exists terms_one_current_per_cohort
  on public.terms (cohort_year) where is_current;

create index if not exists profiles_cohort_idx on public.profiles (cohort_year);


-- ---------- 6. publishing must stay inside one cohort ----------
-- Two changes to publish_catalogue, both of which would otherwise corrupt the
-- other year's schedule:
--
--   * it demoted EVERY other current term, so publishing for first years would
--     leave second years with no current term at all
--   * it took each class's room from the course-level `venue`, which is right
--     for electives but empty for PGP1, where the room follows the section and
--     lives on the meeting. Publishing would have blanked every first year's
--     room.
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
  cohort     int;
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

  -- The payload names its own cohort; the row's column is the fallback for a
  -- catalogue uploaded before this migration.
  cohort := coalesce((cat.payload ->> 'cohort_year')::int, cat.cohort_year);
  if cohort is null then
    raise exception
      'That catalogue does not say which cohort it is for. Rebuild it, or set '
      'catalogues.cohort_year on this row before publishing.';
  end if;
  update public.catalogues set cohort_year = cohort where id = p_id;

  -- ----- the term itself -----
  -- Matched on label AND cohort: two years can run a term with the same label
  -- in different years, and one must never edit the other's dates.
  select * into term
    from public.terms
   where label = coalesce(cat.payload ->> 'term', cat.label)
     and cohort_year is not distinct from cohort;

  if term.id is null then
    insert into public.terms (label, term_start, pre_mid_end, post_mid_start,
                              term_end, is_current, cohort_year)
    values (
      coalesce(cat.payload ->> 'term', cat.label),
      (cal ->> 'term_start')::date,
      (cal ->> 'pre_mid_end')::date,
      (cal ->> 'post_mid_start')::date,
      (cal ->> 'term_end')::date,
      true,
      cohort
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

  -- Only this cohort's other terms step down.
  update public.terms
     set is_current = false
   where id <> term.id
     and is_current
     and cohort_year is not distinct from cohort;

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
  -- Unchanged in spirit: matched on (course_code, section, day_of_week,
  -- start_time), no row created, none deleted, `muted` never touched. The room
  -- now prefers the meeting's own, falling back to the course-level venue.
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
      coalesce(nullif(m ->> 'room', ''), nullif(c ->> 'venue', '')) as room
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
     -- Only this cohort's students. A course code is not guaranteed unique
     -- across two curricula, and one year's catalogue must never rewrite the
     -- other year's saved rows.
     and exists (
       select 1 from public.profiles p
        where p.id = cl.user_id and p.cohort_year is not distinct from cohort
     )
     and (cl.term_phase    is distinct from mt.term_phase
       or cl.credits       is distinct from mt.credits
       or cl.total_classes is distinct from mt.total_classes
       or cl.min_pct       is distinct from mt.min_pct
       or cl.room          is distinct from mt.room
       or cl.end_time      is distinct from coalesce(mt.end_time, cl.end_time));
  get diagnostics rows_fixed = row_count;

  -- ----- flip the flag last -----
  update public.catalogues
     set is_published = false, published_at = null
   where is_published
     and cohort_year is not distinct from cohort
     and id <> p_id;

  update public.catalogues
     set is_published = true, published_at = now()
   where id = p_id;

  return jsonb_build_object(
    'term_id',     term.id,
    'term_label',  term.label,
    'cohort_year', cohort,
    'rows_fixed',  rows_fixed
  );
end $$;

revoke all on function public.publish_catalogue(uuid) from public;
grant execute on function public.publish_catalogue(uuid) to authenticated;


-- ============================================================
-- Check it landed
-- ============================================================

-- 1. Every account has a cohort. A null here is an address with no year in it
--    (a role account, say) — such a user will be told no schedule is published
--    for them rather than shown someone else's.
--    select u.email, p.cohort_year from public.profiles p
--      join auth.users u on u.id = p.id order by p.cohort_year nulls first;

-- 2. One current term per cohort, and one published catalogue per cohort.
--    select cohort_year, label, term_start, term_end from public.terms
--     where is_current order by cohort_year;

-- 3. The derivation itself. Expect 2027, 2028, 2029, null.
--    select public.cohort_of('anuja2027@email.iimcal.ac.in'),
--           public.cohort_of('xyz2028@email.iimcal.ac.in'),
--           public.cohort_of('r2d22029@email.iimcal.ac.in'),
--           public.cohort_of('president@email.iimcal.ac.in');
