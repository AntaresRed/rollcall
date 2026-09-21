-- ============================================================
-- Prototype gate
--
-- Somewhere to put a feature that is finished enough to run against real data
-- but not finished enough for the batch — the MBA office attendance mirror
-- being the one it was built for.
--
-- A flag rather than a hardcoded address, for the same reasons as is_admin: a
-- second tester is one UPDATE rather than a deploy, and because it lives in
-- the database it can be used in a policy, so gated rows never leave Postgres
-- at all. A constant compiled into the app can only decline to draw something
-- the browser has already been handed.
--
-- This file grants the flag and nothing else. Nothing in the app reads it yet;
-- the first feature to need it wires it up.
--
--   psql "$DATABASE_URL" -f supabase/prototype-gate.sql
-- ============================================================

alter table public.profiles
  add column if not exists is_tester boolean not null default false;

comment on column public.profiles.is_tester is
  'Sees unreleased features. Grant by UPDATE; never settable by the account itself.';

-- The profile row is created by handle_new_user() on first sign-in, so this
-- only takes effect once that account has signed in at least once. Re-run it
-- afterwards if it reports 0 rows.
do $$
declare
  n int;
begin
  update public.profiles p
     set is_tester = true
    from auth.users u
   where u.id = p.id
     and lower(u.email) = 'anuja2027@email.iimcal.ac.in';
  get diagnostics n = row_count;
  if n = 0 then
    raise notice 'No profile matched anuja2027@email.iimcal.ac.in — sign in once, then re-run this file.';
  else
    raise notice 'Granted tester to % profile(s).', n;
  end if;
end $$;

-- Reads the caller's own flag. SECURITY DEFINER so it can be used inside the
-- policies on `profiles` itself without recursing through them — exactly as
-- is_admin() is.
create or replace function public.is_tester()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_tester from public.profiles p where p.id = auth.uid()), false);
$$;

-- ---------- nobody hands themselves the flag ----------

-- The update policy from admin-schedule.sql pins is_admin and lets every other
-- column through. A new column therefore arrives *writable by its own owner*:
-- without this, any student could PATCH their own profile row and switch the
-- prototype on. Restated here in full, because a policy is replaced whole.
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id)
  with check (
    auth.uid() = id
    -- Each flag may only stay as it is, unless an admin is doing the changing.
    -- Compared against the SECURITY DEFINER readers, which fetch the stored
    -- value without re-entering these policies — a plain sub-select on
    -- profiles here would be a policy on the table querying the same table.
    and (is_admin  = public.is_admin()  or public.is_admin())
    and (is_tester = public.is_tester() or public.is_admin())
  );
