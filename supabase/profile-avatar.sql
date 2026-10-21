-- ============================================================
-- Animal DPs
--
-- A student whose Google account has no photo gets Google's one-letter circle,
-- and there is nothing better to fall back on: the app can't tell that circle
-- from a real photo. So instead of guessing, the student picks one of a fixed
-- set of animals drawn into the app (src/lib/avatars.js). This column holds
-- which one; null means "use my Google photo", which is everyone until they
-- pick.
--
-- A key, not a picture: there are no uploads, so nothing to moderate or
-- store, and the constraint below means the column can only ever hold a name
-- the app knows how to draw, or a one-person DP from the table further down.
--
-- Nobody else reads it. The only select policy on profiles is the student's
-- own row, and the DP is drawn only on their own Profile tab.
--
-- No policy change: "own profile update" (prototype-gate.sql) pins is_admin
-- and is_tester and lets every other column through, which is right for this
-- one — it is the student's to set.
--
--   psql "$DATABASE_URL" -f supabase/profile-avatar.sql
-- ============================================================

alter table public.profiles
  add column if not exists avatar text;

comment on column public.profiles.avatar is
  'Animal DP picked in the app (a key from src/lib/avatars.js); null = Google photo.';

-- Must list exactly the keys in AVATARS — test/logic.mjs reads this file and
-- fails the build when the two disagree. Adding an animal means adding it
-- here and re-running this file before the app that draws it ships.
-- The `only-` keys are the one-person DPs below; which person is the
-- trigger's business, since a check constraint can't look anything up.
alter table public.profiles drop constraint if exists profiles_avatar_known;
alter table public.profiles add constraint profiles_avatar_known check (
  avatar is null or avatar in (
    'monty', 'cat', 'fox', 'panda', 'owl', 'frog',
    'penguin', 'koala', 'monkey', 'shiba', 'llama'
  ) or avatar ~ '^only-[a-z0-9-]{1,40}$'
);


-- ---------- DPs drawn for one person ----------
--
-- A DP made for one student, which nobody else can pick or even see. So it
-- can't live in the app: everything bundled there downloads to every phone,
-- and so would the student's address beside it. The picture and the address
-- live here instead, and each account reads back only its own rows — for
-- nearly everyone, none.
--
-- Written from the SQL editor only (see avatar-kitten.sql); there is no
-- insert or update policy. The picture is drawn as an <img>, where an SVG
-- can't run scripts or fetch anything, and nobody but an admin writes these.
--
-- Needs public.my_email() from por-dashboard.sql.

create table if not exists public.exclusive_avatars (
  key    text primary key check (key ~ '^only-[a-z0-9-]{1,40}$'),
  email  text not null check (email = lower(trim(email)) and email like '%@%'),
  name   text not null check (length(name) between 1 and 24),
  svg    text not null check (svg like '<svg xmlns="http://www.w3.org/2000/svg"%' and length(svg) < 20000)
);

-- The line under the name in the picker. Here rather than in the app because
-- it is as personal as the picture; null shows "Just for you".
alter table public.exclusive_avatars
  add column if not exists caption text check (length(caption) between 1 and 24);

alter table public.exclusive_avatars enable row level security;

drop policy if exists "own exclusive avatars" on public.exclusive_avatars;
create policy "own exclusive avatars" on public.exclusive_avatars
  for select to authenticated using (email = public.my_email());

-- Only the student it was made for can wear it. Checked against the owner of
-- the profile row, not whoever is writing, so setting it from the SQL editor
-- on their behalf passes and setting it on anyone else's row doesn't.
create or replace function public.check_exclusive_avatar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.avatar like 'only-%' and not exists (
    select 1
      from public.exclusive_avatars x
      join auth.users u on lower(u.email) = x.email
     where x.key = new.avatar and u.id = new.id
  ) then
    raise exception 'avatar % is not available to this account', new.avatar
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_exclusive_avatar on public.profiles;
create trigger profiles_exclusive_avatar
  before insert or update of avatar on public.profiles
  for each row execute function public.check_exclusive_avatar();
