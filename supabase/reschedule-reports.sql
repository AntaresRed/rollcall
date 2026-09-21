-- ============================================================
-- Section reschedule reports
--
-- A reschedule is a fact about a class, but `session_overrides` stores it as a
-- fact about one student: the row is keyed to a user_id, so when four people in
-- a section record that Marketing Research moved to Saturday evening, the other
-- fifty-six still have it on Tuesday morning, still get alerted for it, and
-- still mark attendance against a slot nothing happened in.
--
-- This table is the same knowledge, stripped of the person: cohort, subject,
-- section, the slot it left and the slot it went to. Enough people saying the
-- same thing makes it worth showing to the rest of the section — as a
-- suggestion they tap to accept, never as a change applied to their timetable.
--
--   psql "$DATABASE_URL" -f supabase/reschedule-reports.sql
-- ============================================================

create table if not exists public.reschedule_reports (
  reporter_id    uuid not null references auth.users(id) on delete cascade,
  -- Stamped from the reporter's profile by the trigger below, never sent by
  -- the client: a report is only meaningful to the batch it came from, and a
  -- forged year would put one cohort's classes on another's screens.
  cohort_year    int  not null,
  subject        text not null,
  section        text not null default '',
  -- Where the timetable puts the session. Together with the cohort these are
  -- what make one student's report comparable with another's — class ids are
  -- per-student and cannot be.
  original_date  date not null,
  original_start time not null,
  -- Only moves with a date are reported. "Rescheduled, date not decided" is a
  -- real state (see session_overrides) but a poor thing to propose to someone
  -- else: accepting it takes a class off their timetable and silences its
  -- alert, which is a lot to do on the strength of other people's uncertainty.
  new_date       date not null,
  new_start      time not null,
  created_at     timestamptz not null default now(),
  -- One report per student per session: a vote, not a tally. Re-reporting the
  -- same session replaces the earlier answer rather than counting twice.
  primary key (reporter_id, subject, section, original_date, original_start)
);

create index if not exists reschedule_reports_lookup_idx
  on public.reschedule_reports (cohort_year, subject, section, original_date);

-- ---------- who the reporter is ----------

create or replace function public.stamp_reschedule_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.reporter_id := auth.uid();
  select cohort_year into new.cohort_year
    from public.profiles where id = auth.uid();

  -- No cohort means the year couldn't be read from the address. Treating that
  -- as "any cohort" is exactly the mistake the app avoids everywhere else, so
  -- the report is refused instead. The client reports on a best-effort basis
  -- and ignores the failure, so the student's own reschedule still saves.
  if new.cohort_year is null then
    raise exception 'no cohort for this account';
  end if;

  return new;
end $$;

drop trigger if exists reschedule_reports_stamp on public.reschedule_reports;
create trigger reschedule_reports_stamp
  before insert or update on public.reschedule_reports
  for each row execute function public.stamp_reschedule_report();

-- ---------- access ----------

alter table public.reschedule_reports enable row level security;

-- Students touch their own report and nothing else. Everything anyone else
-- sees comes from the aggregate view below.
drop policy if exists "own reschedule reports" on public.reschedule_reports;
create policy "own reschedule reports" on public.reschedule_reports
  for all using (auth.uid() = reporter_id) with check (auth.uid() = reporter_id);

-- ---------- what the section can see ----------

-- The threshold lives here rather than in the app. Below it the group is never
-- assembled at all, so no query can reveal that one named person moved a class
-- — and there is one number to change, not two to keep in step.
create or replace view public.reschedule_consensus as
  select cohort_year, subject, section,
         original_date, original_start, new_date, new_start,
         count(*)::int as reports
    from public.reschedule_reports
   group by cohort_year, subject, section,
            original_date, original_start, new_date, new_start
  having count(*) >= 2;

-- Deliberately the opposite of attendance_summary, which is security_invoker
-- so that a student sees only their own rows. The whole purpose here is to
-- read across students, so this view runs as its owner — and it is safe to
-- because it emits no user ids and no group smaller than the threshold.
alter view public.reschedule_consensus set (security_invoker = false);

revoke all on public.reschedule_consensus from anon;
grant select on public.reschedule_consensus to authenticated;

comment on view public.reschedule_consensus is
  'Reschedules reported by at least two students of a cohort, with no reporter identities. Suggestions only; nothing is applied from this.';
