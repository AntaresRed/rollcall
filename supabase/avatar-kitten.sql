-- ============================================================
-- The black kitten: a DP made for one student
--
-- Brown eyes, a red flower by one ear. Readable and wearable by
-- avanthekac2027@email.iimcal.ac.in only — see "DPs drawn for one person"
-- in profile-avatar.sql, which has to be run first.
--
-- Also puts it on her profile, so it is her DP without her having to find
-- it. She can still pick something else, and the kitten stays in her picker
-- to come back to.
--
-- Safe to re-run: the picture is replaced, and her DP is set again only if
-- she hasn't picked anything since.
--
--   psql "$DATABASE_URL" -f supabase/avatar-kitten.sql
-- ============================================================

insert into public.exclusive_avatars (key, email, name, caption, svg) values (
  'only-kitten',
  'avanthekac2027@email.iimcal.ac.in',
  'Kitten',
  'For Smol Black Kat',
  $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#F8D3E2"/><g fill="#fff" opacity=".9"><path d="M15 20l1.6 4.4 4.4 1.6-4.4 1.6-1.6 4.4-1.6-4.4-4.4-1.6 4.4-1.6z"/><path d="M85 74l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2z"/></g><g fill="#F2B544"><path d="M84 16l1.1 3 3 1.1-3 1.1-1.1 3-1.1-3-3-1.1 3-1.1z"/><path d="M14 78l.9 2.5 2.5.9-2.5.9-.9 2.5-.9-2.5-2.5-.9 2.5-.9z"/></g><path d="M21 52L23 15L47 33Z" fill="#1F1B24"/><path d="M27 42L28 25L40 33Z" fill="#F4A6C0"/><path d="M79 52L77 15L53 33Z" fill="#1F1B24"/><path d="M73 42L72 25L60 33Z" fill="#F4A6C0"/><path d="M18 62Q18 32 50 31Q82 32 82 62Q82 76 72 82Q62 89 50 89Q38 89 28 82Q18 76 18 62Z" fill="#1F1B24"/><path d="M43 33l3-6 3 5 3-6 3 7" fill="#1F1B24"/><path d="M18 64l-4 2 4 1M82 64l4 2-4 1" fill="#1F1B24"/><ellipse cx="37" cy="58" rx="9" ry="10" fill="#6E4120"/><ellipse cx="63" cy="58" rx="9" ry="10" fill="#6E4120"/><ellipse cx="37" cy="59" rx="6.6" ry="7.4" fill="#9A5F2E"/><ellipse cx="63" cy="59" rx="6.6" ry="7.4" fill="#9A5F2E"/><ellipse cx="37" cy="59" rx="4.2" ry="5.4" fill="#120F14"/><ellipse cx="63" cy="59" rx="4.2" ry="5.4" fill="#120F14"/><circle cx="40" cy="54.5" r="2.7" fill="#fff"/><circle cx="66" cy="54.5" r="2.7" fill="#fff"/><circle cx="34.6" cy="62.6" r="1.2" fill="#fff"/><circle cx="60.6" cy="62.6" r="1.2" fill="#fff"/><ellipse cx="27" cy="71" rx="5" ry="3" fill="#F4A6C0" opacity=".45"/><ellipse cx="73" cy="71" rx="5" ry="3" fill="#F4A6C0" opacity=".45"/><path d="M46.5 68.5h7l-3.5 3.6z" fill="#F4A6C0"/><path d="M50 72q-3 4-6.5 1.6M50 72q3 4 6.5 1.6" stroke="#8C8094" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M29 69l-17-3M29 73l-16 1M71 69l17-3M71 73l16 1" stroke="#E9E2EE" stroke-width="1.3" stroke-linecap="round" opacity=".85"/><g transform="translate(70 30) rotate(12)"><ellipse cx="0" cy="-5.2" rx="4" ry="5.6" fill="#D7263D" transform="rotate(0)"/><ellipse cx="0" cy="-5.2" rx="4" ry="5.6" fill="#D7263D" transform="rotate(72)"/><ellipse cx="0" cy="-5.2" rx="4" ry="5.6" fill="#D7263D" transform="rotate(144)"/><ellipse cx="0" cy="-5.2" rx="4" ry="5.6" fill="#D7263D" transform="rotate(216)"/><ellipse cx="0" cy="-5.2" rx="4" ry="5.6" fill="#D7263D" transform="rotate(288)"/><circle r="3.2" fill="#F2B544"/><circle cx="-.9" cy="-.9" r="1" fill="#FFF3C4"/></g></svg>$svg$
)
on conflict (key) do update
  set email = excluded.email, name = excluded.name, caption = excluded.caption, svg = excluded.svg;

-- Her profile row is created on first sign-in, so this only takes effect once
-- she has signed in at least once. Re-run it afterwards if it reports 0 rows.
do $$
declare
  n int;
begin
  update public.profiles p
     set avatar = 'only-kitten'
    from auth.users u
   where u.id = p.id
     and lower(u.email) = 'avanthekac2027@email.iimcal.ac.in'
     and p.avatar is null;
  get diagnostics n = row_count;
  if n = 0 then
    raise notice 'Kitten not set: either she has not signed in yet (sign in once, then re-run) or she has already picked a DP.';
  else
    raise notice 'Kitten set as the DP on % profile(s).', n;
  end if;
end $$;

-- The notices above only show in psql; Supabase's SQL editor drops them and
-- says "no rows returned". So the file ends by saying where things stand.
select
  (select count(*) from public.exclusive_avatars where key = 'only-kitten') = 1 as kitten_saved,
  coalesce(
    (select coalesce(p.avatar, '(none)')
       from public.profiles p join auth.users u on u.id = p.id
      where lower(u.email) = 'avanthekac2027@email.iimcal.ac.in'),
    'she has not signed in yet: re-run this file after she does'
  ) as her_dp;
