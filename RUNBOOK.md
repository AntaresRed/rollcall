# IIMPresent — deploy & test runbook

Goal of this pass: get the app live and answer one question — **do push
notifications reliably reach an iPhone when the app is closed?** Everything else
waits until you know.

Budget about 90 minutes for steps 1–7, then a day of passive waiting for step 8.

You need: Node 18+, git, a GitHub account, a Google account, one iPhone
(iOS 16.4 or newer) and ideally one Android phone.

---

## 1. Get the code into a repo (10 min)

```bash
cd rollcall
git init
git add .
git commit -m "IIMPresent: course picker, alerts, attendance"
```

Create an empty repo on GitHub, then:

```bash
git remote add origin https://github.com/<you>/rollcall.git
git branch -M main
git push -u origin main
```

Check it runs locally before going further:

```bash
npm install
npm run dev
```

You should see the course picker with 38 Term V courses. It won't save yet —
there's no database.

---

## 2. Supabase project (15 min)

1. supabase.com → **New project**. Region **Mumbai (ap-south-1)**.
   Save the database password it generates.
2. **SQL Editor** → paste all of `supabase/schema.sql` → **Run**.
   You should see "Success. No rows returned."
3. **Edit the term dates.** The seeded row is a placeholder and pre/post-mid
   alerts fire off it:

```sql
update public.terms set
  term_start    = '2026-06-15',   -- your real dates
  midterm_start = '2026-07-27',
  midterm_end   = '2026-08-01',
  term_end      = '2026-09-19'
where is_current;
```

4. **Authentication → Sign In / Providers → Anonymous sign-ins → enable.**
   Without this the app can't create a session and every screen will fail.
5. **Project Settings → API** → copy the **Project URL** and the **anon public**
   key. You'll need both in step 6.

> Skip Gemini for now. The course picker is the primary path and needs no API
> key. Add image parsing after the push question is settled.

---

## 3. VAPID keys (2 min)

```bash
npx web-push generate-vapid-keys
```

Copy both. The public key goes in the frontend; the private key is a server
secret and must never reach the browser.

---

## 4. Deploy the Edge Functions (15 min)

```bash
npm i -g supabase
supabase login
supabase link --project-ref <PROJECT_REF>   # from your Supabase URL

supabase secrets set VAPID_PUBLIC_KEY=<public>
supabase secrets set VAPID_PRIVATE_KEY=<private>
supabase secrets set VAPID_SUBJECT=mailto:you@example.com

supabase functions deploy send-class-alerts --no-verify-jwt
```

`--no-verify-jwt` lets pg_cron call it with the service-role key.

Verify it's alive — this should return `{"sent":0,...}`, not an error:

```bash
curl -X POST \
  https://<PROJECT_REF>.supabase.co/functions/v1/send-class-alerts \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

The service-role key is under **Project Settings → API**. Treat it like a
password — it bypasses every row-level security policy.

---

## 5. Schedule the sweep (5 min)

> **Substitute both placeholders before running.** Pasting the block verbatim
> schedules a job that fails on every tick with `Bad hostname`, and nothing in
> the app tells you — the only symptom is that alerts never arrive. Check
> `cron.job_run_details` after five minutes and confirm `status = succeeded`.
> To fix a bad job: `select cron.unschedule('iimpresent-class-alerts');` then
> reschedule.

In the SQL Editor, with your values filled in:

```sql
select cron.schedule(
  'iimpresent-class-alerts',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-class-alerts',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
```

Confirm after five minutes:

```sql
select jobid, jobname, schedule, active from cron.job;
select status, start_time from cron.job_run_details order by start_time desc limit 5;
```

---

## 6. Deploy the frontend (15 min)

vercel.com → sign in with GitHub → **Add New → Project** → import the repo.
Framework detects as Vite. Before clicking Deploy, add three environment
variables:

| Name | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | your project URL |
| `VITE_SUPABASE_ANON_KEY` | the anon public key |
| `VITE_VAPID_PUBLIC_KEY` | the VAPID public key |

Deploy. You get `https://<something>.vercel.app` on HTTPS, which service workers
and push both require.

> If you add env vars after the first deploy, you must redeploy — Vite bakes
> them in at build time.

---

## 7. Install on your phone (10 min)

**iPhone — this order matters.** Safari only delivers push to a PWA that was
added to the Home Screen and launched from there.

1. Open the Vercel URL **in Safari** (not Chrome, not in-app browsers).
2. Share button → **Add to Home Screen** → Add.
3. Close Safari. Open IIMPresent **from the Home Screen icon.**
4. Pick 2–3 courses → Save.
5. Tap **Turn on alerts** → Allow.

If you see "Add IIMPresent to your Home Screen first," you opened it in a Safari
tab. Go back to step 2.

**Android:** open in Chrome, accept the install prompt (or menu → Install app),
then enable alerts. Less fussy than iOS.

Confirm the subscription landed:

```sql
select id, timezone, created_at, last_ok_at from push_subscriptions;
```

One row per device. No row means the subscribe call failed — check the browser
console.

---

## 8. Test push properly

### 8a. Fast test — a class 6 minutes from now

Don't wait for a real class. Run this in the SQL Editor (it targets whichever
account is yours — check `select id, created_at from profiles;` if you have
several):

```sql
-- alert fires alert_after_mins into the class
update public.profiles set alert_after_mins = 2 where id = '<YOUR_USER_ID>';

insert into public.classes
  (user_id, day_of_week, start_time, end_time, subject, term_phase, confirmed)
values (
  '<YOUR_USER_ID>',
  extract(isodow from (now() at time zone 'Asia/Kolkata'))::int,
  ((now() at time zone 'Asia/Kolkata') + interval '6 minutes')::time,
  ((now() at time zone 'Asia/Kolkata') + interval '81 minutes')::time,
  'Push test', 'full', true
);
```

Now **swipe IIMPresent away from the app switcher** — fully closed, not
backgrounded. Lock the phone. Wait.

The notification should arrive about 3 minutes before that start time.

### 8b. Read the result honestly

Three outcomes, three different problems:

| What you see | What it means | Where to look |
| --- | --- | --- |
| Notification arrives | Working | — |
| `alert_log` has a row, `last_ok_at` updated, no notification | Push service accepted it; the phone dropped it | This is the iOS reliability risk |
| No `alert_log` row | The sweep never matched the class | Timezone, `confirmed = false`, or cron not running |

```sql
select * from alert_log order by sent_at desc limit 5;
select endpoint, last_ok_at from push_subscriptions;
select status, return_message, start_time
  from cron.job_run_details order by start_time desc limit 5;
```

### 8c. The test that actually decides it

One clean delivery proves nothing. iOS throttles background delivery for PWAs
that go unopened. So:

- Add a test class for **tomorrow morning**, then don't open the app all day.
- Repeat for **three days running** without opening it.
- Try once with **Low Power Mode on**, and once with a **Focus mode** active.
- Test on a **second iPhone on a different iOS version** if you can borrow one.

Log each attempt: sent (from `alert_log`), delivered (did it appear), and how
late. That table is your decision.

### 8d. Clean up

```sql
delete from public.classes where subject = 'Push test';
update public.profiles set alert_after_mins = 15 where id = '<YOUR_USER_ID>';
```

---

## 8e. An alert for a course that should not be running

A half-term course firing in the wrong half — a post-mid course alerting in
August, say — is not a scheduling bug. It is one of two data problems, and the
first one is far more likely.

**A stale class row.** The alert sweep decides whether a course is in session
from `classes.term_phase` on the student's own saved row, and nothing else.
Until this was fixed, saving your courses only ever inserted and deleted rows,
never updated them — so a row kept whatever the catalogue said on the day the
course was first picked. When the institute corrected a course afterwards, the
row kept the old value for ever, and re-picking the course did not help: it
matched on day, time and subject, so it was left alone every time.

Find them, then repair them:

```sql
select c.subject, c.course_code, c.day_of_week, c.start_time, c.term_phase
  from classes c
 where c.term_phase = 'full'
 order by c.subject;
```

`supabase/repair-stale-classes.sql` fixes every affected row in one pass. It
carries the current catalogue inline, so run STEP 1 to see exactly what it
would change, then STEP 2. It only writes rows that genuinely differ, and never
touches `muted`, `confirmed`, or `id` — so mute settings and attendance
history survive.

**It regenerates itself.** `build_catalogue.py` rebuilds it as its final step,
because a repair file still carrying the *previous* catalogue would write last
term's phases and venues over the rows this one just corrected. There is no
second command to remember, and a catalogue build that cannot regenerate it
stops with a non-zero exit rather than leaving the two out of step.

The app now also patches drifted rows whenever a student saves their courses,
so this is a one-off catch-up for rows already stored, not a recurring chore.

**No current term.** Every phase and break decision needs the term calendar. If
no row has `is_current`, the sweep now holds all half-term alerts rather than
guessing — previously it assumed "in session" and fired them all year.

```sql
select label, term_start, pre_mid_end, post_mid_start, term_end, is_current
  from terms where is_current;
```

Nothing back means the seed at the end of `schema.sql` was never run. The sweep
also reports this on every invocation:

```json
{ "sent": 0, "termResolved": false }
```

`termResolved: false` in the cron logs is the signal; fix the term row and it
returns to `true`.

## 8f. Alerts that arrive the moment you open the app (Android)

The signature: nothing at the time the class starts, then the real alert lands
within a second of opening RollCall. Sometimes it never arrives at all.

This is not the sweep misfiring. Confirm that first:

```sql
select a.sent_at, c.subject, c.start_time, p.alert_after_mins
from alert_log a
join classes c on c.id = a.class_id
left join profiles p on p.id = c.user_id
order by a.sent_at desc limit 20;
```

If `sent_at` is roughly `alert_after_mins` past `start_time`, the server did
its job on time and the delay is in delivery.

**What is happening.** Web push on Android goes through FCM, which can only
hand a message to Chrome while Chrome is running. When the OS or an OEM
battery manager has killed the browser process, FCM queues the message and
flushes it the instant Chrome next starts — which is exactly what opening the
app does. Nothing in this codebase can force that wake-up.

**What the code now does about it.** The message used to carry a fixed 45
minute TTL while its payload claimed the alert stayed useful for over two
hours. Any phone that woke in the gap got nothing, permanently: FCM had
already destroyed the message, and `alert_log` had already recorded the send
so no sweep would retry. Both gates are now the same number — until an hour
after the class ends — so a phone waking late gets the alert late rather than
never. A typical 90-minute class went from 45 to 135 minutes of survivable
queue time.

Separately, a send that fails for a retryable reason (an FCM 5xx, a timeout)
now releases its `alert_log` claim, so a later sweep inside the same 30-minute
window tries again. It used to burn the claim and lose the alert silently.
`retrying` in the sweep's JSON response counts these.

**What only the phone can fix.** The hold-then-flush behaviour itself is
Android power management, and it is a device setting:

- Settings → Apps → Chrome → Battery → **Unrestricted**
- The same for RollCall itself if it is installed as its own app icon
- Turn off any OEM "battery optimisation", "app sleep", "deep clear" or
  "auto-launch management" for Chrome — Xiaomi, OnePlus, Oppo, Vivo, Realme
  and Samsung are all aggressive here, and it is the usual culprit
- Do not swipe Chrome out of the recents list; that kills the process that
  receives push

## 8g. Notifications at odd hours, or missing entirely

Three distinct causes, three different fixes. Check all three before concluding
iOS/Android is at fault.

**Leftover test rows.** The test-class SQL inserts a row on today's
`day_of_week`, which then recurs *every week at that time, forever*. If you ran
it more than once you now have several. This is the most common cause of an
alert at a nonsensical hour:

```sql
select id, day_of_week, start_time, subject, confirmed from classes
order by day_of_week, start_time;

delete from classes
 where subject in ('Push test', '30 Second Test')
    or subject ilike '%test%';
```

**An alert offset still set low from testing:**

```sql
select id, alert_after_mins, timezone from profiles;
update profiles set alert_after_mins = 15;   -- back to a sane default
```

**Duplicate device subscriptions.** Reinstalling the PWA can leave a stale row
behind, and each row gets its own push:

```sql
select user_id, count(*) from push_subscriptions group by user_id having count(*) > 1;
delete from push_subscriptions where last_ok_at is null and created_at < now() - interval '1 day';
```

Then confirm what the server actually believes it sent:

```sql
select a.class_date, a.sent_at, c.subject, c.start_time
from alert_log a join classes c on c.id = a.class_id
order by a.sent_at desc limit 20;
```

Compare `sent_at` against the notification's arrival time on the phone. A large
gap means the push service queued it — that is a delivery problem, not a
scheduling one, and is what the TTL setting now prevents.

## 9. Already deployed before 2026-08-20?

`schema.sql` ends with a guarded migration block. Re-run the whole file in the
SQL Editor — it's idempotent, and it moves attendance off the cascading foreign
key that would otherwise erase a student's history the moment they changed
courses.

## 10. The decision

**≥95% delivered, within 2 minutes, across three days of not opening the app:**
Option A holds. Move on to replacing anonymous auth with email or Google sign-in
— right now clearing Safari data wipes a student's timetable mid-term, and
that's your worst support problem waiting to happen.

**Delivery flaky or badly delayed on iOS:** stop. Wrap the same React code with
Capacitor and use `@capacitor/local-notifications`, which schedules on-device
and doesn't depend on a push service at all. The frontend code carries over
almost unchanged; you drop the cron job and the `send-class-alerts` function.

Either way you'll know in under a week, and you'll know it before twenty
students are depending on it.

---

## Troubleshooting

**"Sign in required" on every screen** — anonymous sign-ins aren't enabled
(step 2.4).

**Alerts button does nothing on iPhone** — opened in a Safari tab rather than
from the Home Screen icon.

**`{"sent":0}` when a class is due** — check `confirmed = true` on the row, that
`day_of_week` matches today (1 = Monday), and that `push_subscriptions.timezone`
says `Asia/Kolkata`.

**Notification fires twice** — two subscription rows for the same phone, usually
from installing before and after a redeploy. Delete the older row.

**Service worker serving stale code** — `vercel.json` already sends
`Cache-Control: no-store` for `/sw.js`. On the phone, delete the Home Screen
icon and re-add it.
