-- =============================================================
-- Official attendance, read from OLT
--
-- OLT (olt.iimcal.ac.in) is where the institute's own attendance record is
-- shown to students. It has no API and won't answer a browser on another
-- origin, so the olt-attendance Edge Function signs in as the student and
-- reads the page. This is the table it writes.
--
-- No password is stored here, or anywhere on the server. The student's phone
-- remembers it, in its own password manager, if they let it.
--
-- Tester-only for now (prototype-gate.sql must have been run first). The gate
-- is in the policy, not just the UI: a student without the flag can't read a
-- row even with a hand-built request.
--
-- Safe to re-run.
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
  last_error     text
);

-- Session by session, per course, from OLT's "Datewise Attendance" section:
-- { "<course as the term table names it>": { sessions: [{ no, date, time,
-- mark }], attended, total, agrees } | { error } }. Added after the table
-- first shipped, hence an alter rather than a column above.
alter table public.olt_attendance
  add column if not exists datewise jsonb not null default '{}'::jsonb;

alter table public.olt_attendance enable row level security;

drop policy if exists "own olt attendance" on public.olt_attendance;
create policy "own olt attendance" on public.olt_attendance
  for select using (auth.uid() = user_id and public.is_tester());

-- ---------- retired: passwords saved on the server ----------
-- An earlier version could keep a student's OLT password here, encrypted, at
-- their choice. It was dropped (2026-10-16) so that nobody — the project's
-- owner included — holds students' passwords; the phone's own password
-- manager does the remembering instead. These remove what it left behind,
-- every saved password with it, and do nothing on a database that never had
-- them. Also unset the old key:
--   supabase secrets unset OLT_PASSWORD_KEY --project-ref <ref>
drop table if exists public.olt_credentials;
alter table public.olt_attendance drop column if exists password_saved;

-- The API keeps its own list of each table's columns and doesn't always
-- notice a change made after it started. Without this, the datewise column
-- above failed every write with "Could not find the 'datewise' column … in
-- the schema cache" until the list caught up.
notify pgrst, 'reload schema';
