-- ============================================================
-- RollCall — schema
-- Run in Supabase → SQL Editor. Safe to re-run.
--
-- SECTION ORDER MATTERS, and not in the obvious way:
--
--   tables -> migration -> indexes -> RLS -> view -> seed
--
-- On an existing database `create table if not exists` is a no-op, so any
-- column added by a later release exists only after the migration block has
-- run. Anything referencing such a column — an index, a view, a policy —
-- must therefore come after it, not next to its table. Put new indexes in
-- the Indexes section, not beside the CREATE TABLE.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------- term calendar ----------
-- One row per intake. Lets alerts respect (Pre-Mid Term) / (Post-Mid Term)
-- courses, which only run for half the term.
create table if not exists public.terms (
  id             uuid primary key default gen_random_uuid(),
  label          text        not null,
  term_start     date        not null,
  -- The institute publishes two teaching windows with a gap between them,
  -- rather than one midterm date, so both edges are stored explicitly.
  pre_mid_end    date        not null,
  post_mid_start date        not null,
  term_end       date        not null,
  is_current     boolean     not null default false
);

-- ---------- periods with no classes ----------
-- Exam weeks, placement season, Puja vacation. Institute-wide: no course
-- meets, so no alert should fire and nothing lands in Catch up.
create table if not exists public.term_breaks (
  id         uuid primary key default gen_random_uuid(),
  term_id    uuid references public.terms(id) on delete cascade,
  label      text not null,
  from_date  date not null,
  to_date    date not null,
  note       text
);
-- ---------- who may sign in ----------
-- Enforced by a trigger on auth.users below, not in the app. A check that
-- lives only in the frontend is worth nothing: anyone can call the Supabase
-- endpoint directly with their own Google token.
create table if not exists public.allowed_email_domains (
  domain text primary key,
  note   text
);

insert into public.allowed_email_domains (domain, note)
values ('email.iimcal.ac.in', 'IIM Calcutta student accounts')
on conflict (domain) do nothing;

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
  -- Null for a normal weekly course. Set for a course that runs on a fixed
  -- list of dates instead (visiting-faculty blocks), where the row represents
  -- one specific meeting rather than a weekly recurrence.
  session_date date,
  start_time   time not null,
  end_time     time not null,
  subject      text not null,
  course_code  text,            -- e.g. 'LSCM' — links back to the term catalogue
  section      text,            -- 'A' / 'B'
  room         text,
  -- 'full' | 'pre_mid' | 'post_mid'
  term_phase   text not null default 'full'
                 check (term_phase in ('full','pre_mid','post_mid')),
  -- Attendance rules travel with the row so the app never needs the catalogue
  -- to compute a percentage, and a past term's numbers stay correct after the
  -- catalogue is rebuilt for the next one.
  credits      numeric(3,1) not null default 3.0,
  total_classes int         not null default 20,
  min_pct      int          not null default 75,
  muted        boolean      not null default false,
  confirmed    boolean not null default false,
  created_at   timestamptz not null default now()
);
-- ---------- rescheduled sessions ----------
-- A weekly course has no row per occurrence — occurrences are generated from
-- the pattern — so a moved class is stored as an exception against the date it
-- was originally due. new_date NULL means the session was cancelled outright.
create table if not exists public.session_overrides (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  class_id      uuid not null references public.classes(id) on delete cascade,
  original_date date not null,
  new_date      date,
  new_start     time,
  new_end       time,
  note          text,
  created_at    timestamptz not null default now(),
  unique (user_id, class_id, original_date)
);
-- ---------- attendance ----------
create table if not exists public.attendance (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- The class row can disappear when a student swaps courses, so the subject
  -- is denormalised here: attendance history must outlive the timetable.
  class_id   uuid references public.classes(id) on delete set null,
  subject    text not null default '',
  -- Sixteen Term V courses run two back-to-back sessions in one day, so the
  -- slot has to be part of the identity or the second mark overwrites the first.
  start_time time not null default '00:00',
  class_date date not null,
  status     text not null check (status in ('present','absent','cancelled')),
  marked_at  timestamptz not null default now(),
  unique (user_id, subject, class_date, start_time)
);
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
-- ---------- alert dedupe ----------
-- One row per (class, date) once an alert has gone out, so a cron that runs
-- every 5 minutes never double-pings.
create table if not exists public.alert_log (
  -- One row per class row per day. Each meeting is its own `classes` row, so a
  -- course with two sessions in a day still gets two independent alerts.
  class_id   uuid not null references public.classes(id) on delete cascade,
  class_date date not null,
  sent_at    timestamptz not null default now(),
  primary key (class_id, class_date)
);

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

  -- drop the cascade so swapping courses can't wipe history — but only if it
  -- isn't already fixed, so re-running this file never touches a healthy FK
  if exists (
    select 1 from pg_constraint
    where conname = 'attendance_class_id_fkey' and confdeltype <> 'n'
  ) then
    alter table public.attendance drop constraint attendance_class_id_fkey;
    alter table public.attendance alter column class_id drop not null;
    alter table public.attendance
      add constraint attendance_class_id_fkey
      foreign key (class_id) references public.classes(id) on delete set null;
  end if;

  if exists (select 1 from pg_constraint where conname = 'attendance_class_id_class_date_key') then
    alter table public.attendance drop constraint attendance_class_id_class_date_key;
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_name = 'attendance' and column_name = 'start_time') then
    alter table public.attendance add column start_time time not null default '00:00';
    update public.attendance a
       set start_time = c.start_time
      from public.classes c
     where c.id = a.class_id;
  end if;

  -- the earlier key omitted the slot, so a course with two sessions in one day
  -- could only ever hold one mark
  if exists (select 1 from pg_constraint
             where conname = 'attendance_user_id_subject_class_date_key') then
    alter table public.attendance
      drop constraint attendance_user_id_subject_class_date_key;
  end if;

  if not exists (select 1 from pg_constraint
                 where conname = 'attendance_user_subject_date_slot_key') then
    alter table public.attendance
      add constraint attendance_user_subject_date_slot_key
      unique (user_id, subject, class_date, start_time);
  end if;

  -- credit rules + per-course mute
  if not exists (select 1 from information_schema.columns
                 where table_name = 'classes' and column_name = 'credits') then
    alter table public.classes add column credits numeric(3,1) not null default 3.0;
    alter table public.classes add column total_classes int not null default 20;
    alter table public.classes add column min_pct int not null default 75;
    -- half-term courses are 1.5 credits: 10 classes at 80%
    update public.classes
       set credits = 1.5, total_classes = 10, min_pct = 80
     where term_phase in ('pre_mid', 'post_mid');
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_name = 'classes' and column_name = 'muted') then
    alter table public.classes add column muted boolean not null default false;
  end if;

  -- fixed-date courses (visiting faculty blocks)
  if not exists (select 1 from information_schema.columns
                 where table_name = 'classes' and column_name = 'session_date') then
    alter table public.classes add column session_date date;
    create index if not exists classes_user_date_idx
      on public.classes (user_id, session_date) where session_date is not null;
  end if;

  -- two teaching windows instead of a single midterm date
  if not exists (select 1 from information_schema.columns
                 where table_name = 'terms' and column_name = 'pre_mid_end') then
    alter table public.terms add column pre_mid_end date;
    alter table public.terms add column post_mid_start date;
    update public.terms
       set pre_mid_end    = coalesce(pre_mid_end, midterm_start - 1),
           post_mid_start = coalesce(post_mid_start, midterm_end + 1);
    alter table public.terms alter column pre_mid_end set not null;
    alter table public.terms alter column post_mid_start set not null;
  end if;

  -- rescheduled / cancelled sessions
  if not exists (select 1 from information_schema.tables
                 where table_name = 'session_overrides') then
    create table public.session_overrides (
      id            uuid primary key default gen_random_uuid(),
      user_id       uuid not null references auth.users(id) on delete cascade,
      class_id      uuid not null references public.classes(id) on delete cascade,
      original_date date not null,
      new_date      date,
      new_start     time,
      new_end       time,
      note          text,
      created_at    timestamptz not null default now(),
      unique (user_id, class_id, original_date)
    );
    create index session_overrides_user_idx
      on public.session_overrides (user_id, original_date);
    create index session_overrides_new_idx
      on public.session_overrides (user_id, new_date) where new_date is not null;
    alter table public.session_overrides enable row level security;
    create policy "own reschedules" on public.session_overrides
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if exists (select 1 from information_schema.columns
             where table_name = 'terms' and column_name = 'midterm_start') then
    alter table public.terms drop column midterm_start;
    alter table public.terms drop column midterm_end;
  end if;
end $$;

-- ============================================================
-- Indexes
--
-- Deliberately after the migration above: on an existing database
-- `create table if not exists` is a no-op, so columns added by this
-- release only exist once the migration has run. An index defined
-- beside its table would reference a column that isn't there yet.
-- ============================================================
create index if not exists term_breaks_term_idx on public.term_breaks (term_id, from_date);

create index if not exists classes_user_day_idx
  on public.classes (user_id, day_of_week, start_time);

create index if not exists classes_user_date_idx
  on public.classes (user_id, session_date) where session_date is not null;

create index if not exists session_overrides_user_idx
  on public.session_overrides (user_id, original_date);

create index if not exists session_overrides_new_idx
  on public.session_overrides (user_id, new_date) where new_date is not null;

create index if not exists attendance_user_idx on public.attendance (user_id, class_date);

create index if not exists push_user_idx on public.push_subscriptions (user_id);

-- ============================================================
-- Row Level Security — every student sees only their own rows
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.classes            enable row level security;
alter table public.attendance         enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.session_overrides   enable row level security;
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

drop policy if exists "own reschedules" on public.session_overrides;
create policy "own reschedules" on public.session_overrides
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own subscriptions" on public.push_subscriptions;
create policy "own subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read terms" on public.terms;
create policy "read terms" on public.terms for select using (true);

alter table public.term_breaks enable row level security;
drop policy if exists "read breaks" on public.term_breaks;
create policy "read breaks" on public.term_breaks for select using (true);

-- alert_log is written only by the service role (edge function); no policy
-- means no anon/authenticated access, which is what we want.
alter table public.alert_log enable row level security;

-- ============================================================
-- Sign-in restriction
-- ============================================================

create or replace function public.enforce_allowed_email_domain()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  addr   text := lower(trim(coalesce(new.email, '')));
  domain text;
begin
  -- No address at all means an anonymous sign-in, which this app no longer
  -- uses: every account must be traceable to a student.
  if addr = '' then
    raise exception 'RollCall requires an IIM Calcutta Google account.'
      using errcode = '42501';
  end if;

  -- Exactly one '@', with something either side. Without this check,
  -- 'a@email.iimcal.ac.in@evil.com' reads as the institute domain if you take
  -- the second field, and as a stranger's if you take the last — so reject the
  -- shape outright rather than pick a side.
  if addr !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    raise exception 'That address is not in a form RollCall accepts.'
      using errcode = '42501';
  end if;

  domain := split_part(addr, '@', 2);

  if not exists (select 1 from public.allowed_email_domains d where d.domain = domain) then
    raise exception 'RollCall is only open to IIM Calcutta accounts. % is not eligible.', addr
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_email_domain on auth.users;
create trigger enforce_email_domain
  before insert on auth.users
  for each row execute function public.enforce_allowed_email_domain();

-- Readable by the app so the sign-in screen can name the expected domain.
alter table public.allowed_email_domains enable row level security;
drop policy if exists "read allowed domains" on public.allowed_email_domains;
create policy "read allowed domains" on public.allowed_email_domains
  for select using (true);

-- Supabase's OTP flow provisions the auth.users row the moment a code is
-- requested, before it's ever verified — so the domain must be checked at
-- request time too, or a stranger's inbox would just never get a working code
-- while still holding an account. This RPC is what the app calls instead of
-- asking Supabase directly, so the check runs before any account exists.
create or replace function public.request_otp_domain_check(p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare
  addr   text := lower(trim(coalesce(p_email, '')));
  domain text;
begin
  if addr = '' or addr !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;

  domain := split_part(addr, '@', 2);

  if not exists (select 1 from public.allowed_email_domains d where d.domain = domain) then
    raise exception 'RollCall is only open to IIM Calcutta accounts.' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.request_otp_domain_check(text) to anon, authenticated;

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

-- ============================================================
-- Term V calendar, from the published spreadsheet
-- ============================================================
insert into public.terms (label, term_start, pre_mid_end, post_mid_start, term_end, is_current)
values ('Term V', date '2026-08-24', date '2026-09-27',
        date '2026-10-05', date '2026-11-22', true)
on conflict do nothing;

update public.terms set
  term_start     = date '2026-08-24',
  pre_mid_end    = date '2026-09-27',
  post_mid_start = date '2026-10-05',
  term_end       = date '2026-11-22'
where is_current;

delete from public.term_breaks
 where term_id in (select id from public.terms where is_current);

insert into public.term_breaks (term_id, label, from_date, to_date, note)
select t.id, v.label, v.from_date, v.to_date, v.note
from public.terms t,
     (values
        ('Mid-term exams', date '2026-09-28', date '2026-10-01', 'September 28 to October 01, 2026 (No class in Mid Term Exam Week)'),
        ('Summer placement', date '2026-10-08', date '2026-10-16', 'October 8 to October 16, 2026 (No MBA classes)'),
        ('Puja vacation', date '2026-10-19', date '2026-10-25', 'October 19 to October 25, 2026 (No MBA classes)'),
        ('End-term exams', date '2026-11-23', date '2026-11-27', 'November 23 to November 27, 2026 (No class in End Term Exam Week)')
     ) as v(label, from_date, to_date, note)
where t.is_current;
