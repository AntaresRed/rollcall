-- ============================================================
-- Prototype gate
--
-- Somewhere to put a feature that is finished enough to run against real data
-- but not finished enough for the batch.
--
-- A flag rather than a hardcoded address, for the same reasons as is_admin: a
-- second tester is one UPDATE rather than a deploy, and because it lives in
-- the database it can be used in a policy, so gated rows never leave Postgres
-- at all. A constant compiled into the app can only decline to draw something
-- the browser has already been handed.
--
-- This file grants the flag and nothing else; each feature that reads it
-- wires up its own check, in the app and in its own policy. Safe to re-run.
--
--   psql "$DATABASE_URL" -f supabase/prototype-gate.sql
-- ============================================================

alter table public.profiles
  add column if not exists is_tester boolean not null default false;

comment on column public.profiles.is_tester is
  'Sees unreleased features. Grant by UPDATE; never settable by the account itself.';

-- Who has it. The flag unlocks every feature behind it, so whoever is listed
-- here sees all of them — today that is only the OLT reader (Official
-- attendance, OLT Sync, its password and its mismatch marks). Before gating
-- something new on it, check this list is still people meant to see that too.
--
--   anuja2027      the original tester
--   manikkuwara2027  added 2026-11-16, for OLT Sync
--
-- The profile row is created by handle_new_user() on first sign-in, so this
-- only takes effect once that account has signed in at least once. Re-run it
-- afterwards if it reports an address with no profile. Never revokes: taking
-- the flag away is a separate UPDATE.
do $$
declare
  addr text;
  n int;
begin
  foreach addr in array array[
    'anuja2027@email.iimcal.ac.in',
    'manikkuwara2027@email.iimcal.ac.in'
  ] loop
    update public.profiles p
       set is_tester = true
      from auth.users u
     where u.id = p.id
       and lower(u.email) = addr;
    get diagnostics n = row_count;
    if n = 0 then
      raise notice 'No profile matched % — sign in once, then re-run this file.', addr;
    else
      raise notice 'Tester: %', addr;
    end if;
  end loop;
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
