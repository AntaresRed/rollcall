# Deploying this update

> **Update 2026-08-20b.** If you already deployed the earlier version, you need
> this one too: sixteen Term V courses run two back-to-back sessions in a single
> day (BM meets Tue 16:15 *and* Tue 18:00), and the attendance key didn't include
> the slot — so marking the second session silently overwrote the first. Re-run
> `schema.sql` and redeploy the frontend. No attendance is lost; existing rows
> are backfilled with their slot.

You already have a live project, so this replaces what's running. Four steps,
about ten minutes. Do them in order — the schema migration has to land before
the new frontend talks to it.

---

## 1. Database (2 min)

Supabase → **SQL Editor** → paste the whole of `supabase/schema.sql` → **Run**.

Safe to re-run. Every statement is guarded, and the migration block at the
bottom moves attendance off the cascading foreign key that would otherwise
erase a student's history the moment they changed courses.

Then clear out the wreckage from testing:

```sql
-- ghost classes from the test inserts recur weekly, forever
select id, day_of_week, start_time, subject from classes order by day_of_week, start_time;
delete from classes where subject ilike '%test%';

-- put the lead time back
update profiles set lead_mins = 10;

-- stale device rows left behind by reinstalling the PWA
select user_id, count(*) from push_subscriptions group by user_id having count(*) > 1;
```

## 2. Edge function (3 min)

```bash
supabase functions deploy send-class-alerts --no-verify-jwt
```

This carries the TTL and urgency fixes — the ones that stop a queued push
arriving hours late — plus the catch-up window.

## 3. Confirm the cron job is healthy (1 min)

```sql
select jobid, jobname, schedule, active from cron.job;
select status, start_time, return_message
  from cron.job_run_details order by start_time desc limit 5;
```

`status` must read **succeeded**. If you still see `Bad hostname`, the job is
carrying the literal `<your-project-ref>` placeholder:

```sql
select cron.unschedule('rollcall-class-alerts');
-- then reschedule with your real project ref and rotated service_role key
```

## 4. Frontend (3 min)

```bash
git add .
git commit -m "Fix attendance data loss, push TTL, alert window"
git push
```

Vercel redeploys automatically. Then **on your phone: delete the RollCall icon
from the Home Screen and re-add it.** The service worker version changed, and
the old one will otherwise keep serving cached code.

---

## Verify it worked

Insert a class 12 minutes out with a 10-minute lead, so the window spans at
least two cron sweeps:

```sql
insert into classes
  (user_id, day_of_week, start_time, end_time, subject, term_phase, confirmed)
values (
  '<your-user-id>',
  extract(isodow from (now() at time zone 'Asia/Kolkata'))::int,
  to_char((now() at time zone 'Asia/Kolkata') + interval '12 minutes', 'HH24:MI')::time,
  to_char((now() at time zone 'Asia/Kolkata') + interval '27 minutes', 'HH24:MI')::time,
  'Deploy check', 'full', true
);
```

Close the app fully. When the notification lands, compare the clock against:

```sql
select a.sent_at, c.subject, c.start_time
from alert_log a join classes c on c.id = a.class_id
order by a.sent_at desc limit 5;
```

`sent_at` and the arrival time should be within a minute of each other. A large
gap means the push service queued it, which is a delivery problem rather than a
scheduling one.

Clean up afterwards:

```sql
delete from classes where subject = 'Deploy check';
```

---

## What changed, briefly

| Fix | Symptom it addresses |
| --- | --- |
| `on delete set null` + denormalised subject | changing courses wiped all attendance history |
| `security_invoker` on the summary view | one student could read everyone's numbers |
| push `TTL: 15min` + `urgency: high` | alerts arriving hours late, at nonsense times |
| catch-up alert window | one skipped sweep lost the alert permanently |
| `HH:MM` normalisation | edit screens showed the wrong slot |
| service-worker ready timeout | app stuck on the loading spinner |
| paginated queries | silent 1000-row cap at scale |
| three-way clash detection | only the first collision was reported |

Still unverified, and only your phone can answer it: whether iOS delivers
reliably after the app has sat unopened for several days.
