-- ============================================================
-- Retire the "Cancelled" attendance status.
--
-- The button that set it has been removed from the app: classes here are
-- rescheduled rather than called off, so it offered a wrong answer more often
-- than a right one. This turns the rows it already wrote back into "Did not
-- mark", so those sessions are open for the student to record the truth.
--
-- "Did not mark" is not a status. It is the ABSENCE of an attendance row, so
-- this deletes rather than updates. STEP 2 copies every row to a backup table
-- first, and STEP 3 puts them back if that turns out to be a mistake.
--
-- What changes for a student, and what does not:
--
--   attendance percentage   unchanged  — cancelled was already outside the
--                                        denominator, and so is unmarked
--   skips left              unchanged  — neither status ever cost a skip
--   "Did not mark" count    goes UP    — the session is open again
--   tab badge               goes UP    — it will ask them to mark it
--
-- So the only real effect is that these sessions become to-dos again. Nobody's
-- attendance figure moves.
--
-- The backup table is created with RLS on and no policy, so it is invisible
-- to the app and to every student. Only the SQL editor can read it.
--
-- Run STEP 1 and read it. Run STEP 2 when it looks right.
-- ============================================================


-- ---------- STEP 1: who used it, and on what (changes nothing) ----------
select u.email,
       a.subject,
       a.class_date,
       a.start_time,
       a.marked_at
  from public.attendance a
  join auth.users u on u.id = a.user_id
 where a.status = 'cancelled'
 order by u.email, a.class_date, a.start_time;

-- The same thing as a tally, if the list above is long:
--
--   select u.email, count(*) as rows
--     from public.attendance a
--     join auth.users u on u.id = a.user_id
--    where a.status = 'cancelled'
--    group by u.email
--    order by rows desc;


-- ---------- STEP 2: back them up, then remove them ----------
-- Both statements together. The backup is taken first so STEP 3 can undo this.

create table if not exists public.attendance_cancelled_backup
  (like public.attendance including all);

-- This holds other students' attendance rows, and anything in `public` is
-- reachable through the API. `like ... including all` copies constraints and
-- indexes but NOT row-level security, so the table would arrive unprotected.
--
-- RLS on with no policy at all is exactly right here: it denies every normal
-- role outright, while the SQL editor still reads and writes it, because the
-- table owner bypasses RLS. Nothing in the app should ever see this table.
--
-- Enabled here rather than left to the editor's "Run and enable RLS" prompt,
-- so running this file gives the same result however it is run.
alter table public.attendance_cancelled_backup enable row level security;
revoke all on public.attendance_cancelled_backup from anon, authenticated;

insert into public.attendance_cancelled_backup
select * from public.attendance where status = 'cancelled'
on conflict do nothing;

delete from public.attendance where status = 'cancelled';

-- Confirm: this must return 0.
select count(*) as still_cancelled
  from public.attendance where status = 'cancelled';

-- And this says how many are held in the backup.
select count(*) as backed_up from public.attendance_cancelled_backup;


-- ---------- STEP 3: undo, only if STEP 2 was a mistake ----------
-- Puts every backed-up row back exactly as it was. Safe to run twice: a row
-- the student has since re-marked is left alone rather than overwritten,
-- because the unique key (user_id, subject, class_date, start_time) collides.
--
--   insert into public.attendance
--   select * from public.attendance_cancelled_backup
--   on conflict (user_id, subject, class_date, start_time) do nothing;


-- ---------- STEP 4: months later, once you are sure ----------
-- The backup table serves no purpose after that. Dropping it is the last step
-- and there is no rush.
--
--   drop table public.attendance_cancelled_backup;
