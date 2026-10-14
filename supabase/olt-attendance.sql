-- =============================================================
-- Official attendance, read from OLT
--
-- OLT (olt.iimcal.ac.in) is where the institute's own attendance record is
-- shown to students. It has no API and won't answer a browser on another
-- origin, so the olt-attendance Edge Function signs in as the student and
-- reads the page. These are the two tables it writes.
--
-- Tester-only for now (prototype-gate.sql must have been run first). The gate
-- is in the policy, not just the UI: a student without the flag can't read a
-- row even with a hand-built request.
--
--   psql "$DATABASE_URL" -f supabase/olt-attendance.sql
-- ============================================================

-- What OLT said, as it printed it. The columns are OLT's own headings rather
-- than names chosen here, for the same reason prices stay as printed strings:
-- the page is the record, and a column we mislabel is worse than one we show
-- verbatim. Only the Edge Function writes; a student only reads their own.
create table if not exists public.olt_attendance (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  term           text,
  terms          jsonb not null default '[]'::jsonb,  -- every term OLT offered
  columns        jsonb not null default '[]'::jsonb,
  rows           jsonb not null default '[]'::jsonb,
  fetched_at     timestamptz,
  -- Separate from fetched_at so a failed attempt neither erases the last good
  -- copy nor hides that the latest try went wrong.
  attempted_at   timestamptz,
  last_error     text,
  password_saved boolean not null default false
);

-- Session by session, per course, from OLT's "Datewise Attendance" section:
-- { "<course as the term table names it>": { sessions: [{ no, date, time,
-- mark }], attended, total, agrees } | { error } }. Added after the table
-- first shipped, hence an alter rather than a column above; safe to re-run.
alter table public.olt_attendance
  add column if not exists datewise jsonb not null default '{}'::jsonb;

alter table public.olt_attendance enable row level security;

drop policy if exists "own olt attendance" on public.olt_attendance;
create policy "own olt attendance" on public.olt_attendance
  for select using (auth.uid() = user_id and public.is_tester());

-- A saved OLT password, only for a student who ticked "save my password".
--
-- `sealed` is AES-GCM ciphertext made inside the Edge Function with
-- OLT_PASSWORD_KEY, a function secret that never enters the database. So a
-- leaked dump, a backup, or a stray select in the SQL editor yields nothing
-- usable without the function's secrets as well. The row's user id is bound
-- into the encryption, so a ciphertext copied onto another row won't decrypt.
--
-- RLS on with no policies at all: not even the owner can read it back. The
-- only reader is the function, through the service role.
create table if not exists public.olt_credentials (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  sealed   text not null,
  saved_at timestamptz not null default now()
);

alter table public.olt_credentials enable row level security;
revoke all on public.olt_credentials from anon, authenticated;

-- The API keeps its own list of each table's columns and doesn't always
-- notice one added after it started. Without this, the datewise column above
-- failed every write with "Could not find the 'datewise' column … in the
-- schema cache" until the list caught up.
notify pgrst, 'reload schema';

-- ============================================================
-- Optional: refresh everyone with a saved password once a night.
-- Off by default — every run is one sign-in per saved account on an institute
-- system. 21:30 UTC is 03:00 IST. Replace the placeholders before running.
-- ============================================================
-- select cron.schedule(
--   'iimpresent-olt-attendance',
--   '30 21 * * *',
--   $$
--   select net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/olt-attendance',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--     body    := '{"action":"nightly"}'::jsonb,
--     timeout_milliseconds := 120000
--   );
--   $$
-- );
