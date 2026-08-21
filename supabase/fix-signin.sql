-- ============================================================
-- Fix: "Database error saving new user" on Google sign-in
--
-- The previous trigger declared a variable called `domain` and compared it
-- against a column of the same name. PL/pgSQL refuses to guess which one is
-- meant and raises "column reference is ambiguous", which Supabase surfaces
-- as the generic message above — so every signup failed, eligible or not.
--
-- Paste this whole file into the Supabase SQL Editor and run it. Safe to
-- re-run. No redeploy needed; this is server-side only.
-- ============================================================

-- Split out so the rule can be tested directly, without OAuth in the way.
create or replace function public.email_is_allowed(addr text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_addr   text := lower(trim(coalesce(addr, '')));
  v_domain text;
begin
  if v_addr = '' then
    return false;
  end if;

  -- Exactly one '@', with something either side. Without this,
  -- 'a@email.iimcal.ac.in@evil.com' reads as the institute domain if you take
  -- the second field and as a stranger's if you take the last.
  if v_addr !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    return false;
  end if;

  v_domain := split_part(v_addr, '@', 2);

  return exists (
    select 1 from public.allowed_email_domains d where d.domain = v_domain
  );
end;
$$;

create or replace function public.enforce_allowed_email_domain()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_addr text := coalesce(
    nullif(trim(coalesce(new.email, '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'email', '')), ''),
    ''
  );
begin
  if not public.email_is_allowed(v_addr) then
    raise exception
      'RollCall is open to IIM Calcutta accounts only. % is not eligible.',
      coalesce(nullif(v_addr, ''), '(no address)')
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_email_domain on auth.users;
create trigger enforce_email_domain
  before insert on auth.users
  for each row execute function public.enforce_allowed_email_domain();


-- ============================================================
-- Check it before trying to sign in again
-- ============================================================

-- 1. The allowlist must actually have a row. If this is empty, every account
--    is rejected and the symptom looks identical to the bug above.
select * from public.allowed_email_domains;

-- If it came back empty:
--   insert into public.allowed_email_domains (domain, note)
--   values ('email.iimcal.ac.in', 'IIM Calcutta student accounts');

-- 2. The rule itself. Expect true, true, false, false, false.
select
  public.email_is_allowed('anuja2027@email.iimcal.ac.in')  as institute_ok,
  public.email_is_allowed('ANUJA2027@EMAIL.IIMCAL.AC.IN')  as uppercase_ok,
  public.email_is_allowed('someone@gmail.com')             as gmail_blocked,
  public.email_is_allowed('a@email.iimcal.ac.in@evil.com') as spoof_blocked,
  public.email_is_allowed('')                              as empty_blocked;

-- 3. The trigger is attached.
select tgname, tgenabled from pg_trigger where tgname = 'enforce_email_domain';

-- 4. Nothing left over from the anonymous era. These bypass the sign-in
--    screen because their tokens are still valid in the browser.
select id, email, created_at from auth.users where email is null;
-- delete from auth.users where email is null;
