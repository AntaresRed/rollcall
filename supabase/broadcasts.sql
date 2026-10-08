-- ============================================================
-- One-off announcements: a push to one cohort at a set time.
--
-- The message lives in this table, not in the request that sends it. The
-- send-broadcasts function takes no input at all — it delivers whatever rows
-- are due and unclaimed — so it can run without JWT verification, the same as
-- send-class-alerts, and anyone who finds its URL can at most make a scheduled
-- message go out a few minutes early. They cannot choose the words or the
-- audience. A function that took the text in its body would need a secret in
-- every cron job and every test call instead.
--
-- Safe to run twice.
-- ============================================================

create table if not exists public.broadcasts (
  id          bigint generated always as identity primary key,
  title       text not null,
  body        text not null,
  -- Exactly one audience. A null cohort must never mean "everybody", so
  -- everybody is its own explicit flag and the check below refuses a row that
  -- names no audience rather than reading it as unfiltered. only_user is for
  -- sending yourself a test first.
  all_users   boolean not null default false,
  cohort_year int,
  only_user   uuid references auth.users(id) on delete cascade,
  send_at     timestamptz not null,
  -- Past this it is not sent at all, and it is also the push TTL: a phone
  -- that is off all morning doesn't get "all the best" in the evening.
  expires_at  timestamptz not null,
  -- Written before any push goes out; it is what stops two overlapping cron
  -- runs sending the same message twice.
  claimed_at  timestamptz,
  finished_at timestamptz,
  devices     int,
  sent        int,
  pruned      int,
  failed      int,
  note        text,
  created_at  timestamptz not null default now(),
  constraint broadcasts_one_audience check (num_nonnulls(cohort_year, only_user) + all_users::int = 1),
  constraint broadcasts_expiry_after_send check (expires_at > send_at)
);

create index if not exists broadcasts_due_idx
  on public.broadcasts (send_at) where claimed_at is null;

-- RLS on with no policies: only the service role (the Edge Function, the SQL
-- editor) can read or write it. Students never see the queue.
alter table public.broadcasts enable row level security;
