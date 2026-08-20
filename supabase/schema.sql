-- ============================================================
-- RollCall — schema
-- Run in Supabase → SQL Editor. Safe to re-run.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- term calendar ----------
-- One row per intake. Lets alerts respect (Pre-Mid Term) / (Post-Mid Term)
-- courses, which only run for half the term.
create table if not exists public.terms (
  id            uuid primary key default gen_random_uuid(),
  label         text        not null,
  term_start    date        not null,
  midterm_start date        not null,
  midterm_end   date        not null,
  term_end      date        not null,
  is_current    boolean     not null default false
);

-- ---------- student profile ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  timezone   text        not null default 'Asia/Kolkata',
  lead_mins  int         not null default 10,   -- how early to alert
  term_id    uuid        references public.terms(id),
  created_at timestamptz not null default now()
);

-- ---------- parsed timetable ----------
create table if not exists public.classes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  day_of_week  int  not null check (day_of_week between 1 and 7),  -- 1 = Mon
  start_time   time not null,
  end_time     time not null,
  subject      text not null,
  course_code  text,            -- e.g. 'LSCM' — links back to the term catalogue
  section      text,            -- 'A' / 'B'
  room         text,
  -- 'full' | 'pre_mid' | 'post_mid'
  term_phase   text not null default 'full'
                 check (term_phase in ('full','pre_mid','post_mid')),
  confirmed    boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists classes_user_day_idx
  on public.classes (user_id, day_of_week, start_time);

-- ---------- attendance ----------
create table if not exists public.attendance (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- The class row can disappear when a student swaps courses, so the subject
  -- is denormalised here: attendance history must outlive the timetable.
  class_id   uuid references public.classes(id) on delete set null,
  subject    text not null default '',
  class_date date not null,
  status     text not null check (status in ('present','absent','cancelled')),
  marked_at  timestamptz not null default now(),
  unique (user_id, subject, class_date)
);
create index if not exists attendance_user_idx on public.attendance (user_id, class_date);

-- ---------- web push ----------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  timezone   text not null default 'Asia/Kolkata',
  last_ok_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists push_user_idx on public.push_subscriptions (user_id);

-- ---------- alert dedupe ----------
-- One row per (class, date) once an alert has gone out, so a cron that runs
-- every 5 minutes never double-pings.
create table if not exists public.alert_log (
  -- The class row can disappear when a student swaps courses, so the subject
  -- is denormalised here: attendance history must outlive the timetable.
  class_id   uuid references public.classes(id) on delete set null,
  subject    text not null default '',
  class_date date not null,
  sent_at    timestamptz not null default now(),
  primary key (class_id, class_date)
);

-- ============================================================
-- Row Level Security — every student sees only their own rows
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.classes            enable row level security;
alter table public.attendance         enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.terms              enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own classes" on public.classes;
create policy "own classes" on public.classes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own attendance" on public.attendance;
create policy "own attendance" on public.attendance
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own subscriptions" on public.push_subscriptions;
create policy "own subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read terms" on public.terms;
create policy "read terms" on public.terms for select using (true);

-- alert_log is written only by the service role (edge function); no policy
-- means no anon/authenticated access, which is what we want.
alter table public.alert_log enable row level security;

-- ---------- auto-create a profile on signup ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- attendance summary ----------
create or replace view public.attendance_summary as
select
  a.user_id,
  a.subject,
  count(*) filter (where a.status = 'present')    as present,
  count(*) filter (where a.status <> 'cancelled') as counted,
  round(
    100.0 * count(*) filter (where a.status = 'present')
    / nullif(count(*) filter (where a.status <> 'cancelled'), 0)
  ) as pct
from public.attendance a
group by a.user_id, a.subject;

-- Without this a view runs with its owner's rights and quietly bypasses every
-- RLS policy above, letting any student read everyone else's numbers.
alter view public.attendance_summary set (security_invoker = true);

-- ============================================================
-- Cron: fire the alert sweep every 5 minutes
-- Replace <PROJECT_REF> and <SERVICE_ROLE_KEY> before running.
-- ============================================================
-- select cron.schedule(
--   'rollcall-class-alerts',
--   '*/5 * * * *',
--   $$
--   select net.http_post(
--     url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-class-alerts',
--     headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--     body    := '{}'::jsonb
--   );
--   $$
-- );

-- Seed a term (edit the dates for your intake)
insert into public.terms (label, term_start, midterm_start, midterm_end, term_end, is_current)
select 'Term V', date '2026-06-15', date '2026-07-27', date '2026-08-01', date '2026-09-19', true
where not exists (select 1 from public.terms where is_current);


-- ============================================================
-- Migration for projects created before 2026-08-20.
-- Safe to run on a fresh database too — every statement is guarded.
-- ============================================================
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_name = 'attendance' and column_name = 'subject') then
    alter table public.attendance add column subject text not null default '';
    update public.attendance a
       set subject = c.subject
      from public.classes c
     where c.id = a.class_id and a.subject = '';
  end if;

  -- drop the cascade so swapping courses can't wipe history
  if exists (select 1 from information_schema.table_constraints
             where constraint_name = 'attendance_class_id_fkey'
               and table_name = 'attendance') then
    alter table public.attendance drop constraint attendance_class_id_fkey;
    alter table public.attendance alter column class_id drop not null;
    alter table public.attendance
      add constraint attendance_class_id_fkey
      foreign key (class_id) references public.classes(id) on delete set null;
  end if;

  if exists (select 1 from pg_constraint where conname = 'attendance_class_id_class_date_key') then
    alter table public.attendance drop constraint attendance_class_id_class_date_key;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'attendance_user_id_subject_class_date_key') then
    alter table public.attendance
      add constraint attendance_user_id_subject_class_date_key
      unique (user_id, subject, class_date);
  end if;
end $$;
