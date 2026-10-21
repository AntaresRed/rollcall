-- ============================================================
-- Retire per-course "Mute alerts".
--
-- The button has been removed from the app, and send-class-alerts no longer
-- reads the column. This clears any mute already set, so nothing is left in a
-- state the app can no longer show or undo.
--
-- The `muted` column itself stays (not null, default false): dropping it
-- would break any phone still running a cached older build, which writes it.
--
-- Run STEP 1 and read it. Run STEP 2 when it looks right.
-- ============================================================


-- ---------- STEP 1: who has a course muted (changes nothing) ----------
select u.email,
       c.subject,
       count(*) as meetings
  from public.classes c
  join auth.users u on u.id = c.user_id
 where c.muted
 group by u.email, c.subject
 order by u.email, c.subject;


-- ---------- STEP 2: unmute everyone ----------
update public.classes set muted = false where muted;
