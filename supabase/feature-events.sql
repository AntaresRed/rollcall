-- ============================================================
-- Feature usage counts
--
-- Most of the app never talks to the server: the menus, the directories and
-- the ordering flow are bundled JSON and links out to WhatsApp and UPI apps.
-- So nothing in the database says whether anybody uses them. This table is
-- that record — one row per tap worth counting, holding what was tapped, the
-- batch it came from and when, and nothing that says who.
--
-- Uses, not users: with no identity on the row, a hundred taps from one
-- student and one each from a hundred look the same. That is the price of
-- not keeping a per-person log of classmates' activity, and it was chosen.
--
-- Read it from the SQL editor, as the project owner. Students can add rows
-- and can never read any back, their own included.
--
--   psql "$DATABASE_URL" -f supabase/feature-events.sql
-- ============================================================

create table if not exists public.feature_events (
  id          bigint generated always as identity primary key,
  -- A closed list, so a stray or hostile client cannot fill the table with
  -- names nobody will ever query. Adding an event means adding it here.
  event       text not null check (event in (
                'open', 'menu', 'order', 'pay', 'original_menu',
                'leave_mail', 'calendar_export')),
  -- Which one: the screen opened, the shop ordered from. An open format
  -- rather than a list, because a new shop or screen should not need a
  -- migration; the shape still keeps free text, and so anything personal,
  -- out of it.
  detail      text check (detail ~ '^[a-z0-9:_-]{1,48}$'),
  -- Stamped by the trigger below, never sent by the client. Null means the
  -- year couldn't be read from the address — unknown, not "every cohort".
  cohort_year int,
  created_at  timestamptz not null default now()
);

create index if not exists feature_events_when_idx
  on public.feature_events (created_at);

-- ---------- what the client may not decide ----------

create or replace function public.stamp_feature_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A client-supplied time would let one account backdate or bunch its taps;
  -- the server's clock is the only one that counts.
  new.created_at := now();
  select cohort_year into new.cohort_year
    from public.profiles where id = auth.uid();
  -- Unlike a reschedule report, a missing cohort is no reason to refuse: the
  -- tap still happened, and it is counted under "unknown".
  return new;
end $$;

drop trigger if exists feature_events_stamp on public.feature_events;
create trigger feature_events_stamp
  before insert on public.feature_events
  for each row execute function public.stamp_feature_event();

-- ---------- access ----------

alter table public.feature_events enable row level security;

-- Insert only, and only signed in. There is deliberately no select, update or
-- delete policy: with RLS on, their absence is what makes the table write-only
-- from the app.
drop policy if exists "log feature events" on public.feature_events;
create policy "log feature events" on public.feature_events
  for insert to authenticated with check (true);

-- Belt and braces under the policy: Supabase grants every role everything on
-- a new public table, and RLS is the only thing standing between that and a
-- readable table. Take the grants away too, so disabling RLS by mistake would
-- not hand the table to anyone.
revoke all on public.feature_events from anon, authenticated;
grant insert on public.feature_events to authenticated;

comment on table public.feature_events is
  'One row per counted tap in the app: event, detail, cohort, time. No user ids. Write-only from the app; read from the SQL editor.';

-- ============================================================
-- What gets counted (src/lib/track.js is called from each):
--
--   open             app (a cold start), a tab (today, timetable, utils,
--                    profile), or a sub-screen tapped open (calendar,
--                    reschedule, attendance, breakdown, contacts, faculty,
--                    por, students, mess, export, leave, admin,
--                    order-history). Returning by a back arrow isn't counted.
--   menu             day | night | tuck — which mess view was shown
--   order            night:<canteen> | tuck:<shop> — handed to WhatsApp;
--                    whether it was then sent, nobody can tell
--   pay              <shop>:app | <shop>:qr | <shop>:copy — the UPI button,
--                    the QR shown, the UPI id copied; not a completed payment
--   original_menu    night:<canteen> | tuck:<shop> — the photographs opened
--   leave_mail       send | save-pdf
--   calendar_export  (no detail)
--
-- Attendance marks and reschedules are not here: their own tables already
-- count them (attendance.marked_at, session_overrides.created_at).
--
-- Queries to paste into the SQL editor:
--
--   -- Uses per feature this week, by cohort
--   select event, detail, cohort_year, count(*) as uses
--     from public.feature_events
--    where created_at > now() - interval '7 days'
--    group by 1, 2, 3 order by uses desc;
--
--   -- One feature, day by day
--   select date_trunc('day', created_at at time zone 'Asia/Kolkata') as day,
--          count(*) as uses
--     from public.feature_events
--    where event = 'order'
--    group by 1 order by 1;
--
--   -- When orders come in, by hour of the day
--   select extract(hour from created_at at time zone 'Asia/Kolkata') as hour,
--          count(*) as orders
--     from public.feature_events
--    where event = 'order'
--    group by 1 order by 1;
-- ============================================================
