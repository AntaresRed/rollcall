# IIMPresent

A PWA that builds a student's weekly timetable from the official Term V grid, sends a
web push notification before every class, and tracks attendance against the 75% line.

Students pick their courses from a searchable list generated from the published
schedule — days, times, sections, and pre/post-mid-term windows all come from that
catalogue, so there is nothing to type and nothing to misread.

**Stack:** React + Vite on Vercel · Supabase (Postgres, anonymous auth, Edge Functions,
pg_cron) · Gemini for image parsing · Web Push via VAPID.

Running cost at ~1,000 students: nothing, on free tiers.

---

## 1. Supabase

1. Create a project at supabase.com — pick the **Mumbai (ap-south-1)** region.
2. **SQL Editor** → paste `supabase/schema.sql` → Run.
3. Edit the seeded row in `terms` so `term_start`, `midterm_start`, `midterm_end`,
   and `term_end` match your actual calendar. Pre-mid and post-mid courses are
   silenced outside their window based on these dates.
4. **Authentication → Providers → Anonymous sign-ins:** enable.
   Students never create an account; the app signs them in silently on first open.
5. **Project Settings → API:** copy the project URL and the `anon` key.

## 2. Course catalogue

The catalogue ships with the repo, already built from the official schedule:

```bash
python3 scripts/build_catalogue.py Term_5_Schedule.csv src/data/catalogue.json
```

38 courses, 96 meetings, 6 slots a day. Re-run it each term with the new CSV, then
regenerate the Edge Function copy at `supabase/functions/_shared/catalogue.ts`.

**Schedule amendments go in `data/overrides.json`, never in `catalogue.json`.** The
institute moves lectures after the CSV is published and never reissues it, so a hand
edit to the generated file disappears at the next rebuild. Overrides are declarative
and idempotent — running the build twice is a no-op, and an override that no longer
matches the grid fails loudly rather than silently doing nothing. Current entries:

| Course | Change | Since |
| --- | --- | --- |
| CCM-A | Tuesday lecture moved 16:15 → 14:30 | 2026-08-10 |

The build also prints which other courses an amended course now shares a slot with,
so you can see who a move affects.
Because course codes (LSCM, BCM, MTIS…) are unique, the image parser matches on the
code and looks everything else up locally.

## 3. VAPID keys

```bash
npx web-push generate-vapid-keys
```

Keep the private key secret. The public key is safe in the frontend.

## 4. Deploy the Edge Functions

```bash
npm i -g supabase
supabase login
supabase link --project-ref <PROJECT_REF>

supabase secrets set VAPID_PUBLIC_KEY=<public>
supabase secrets set VAPID_PRIVATE_KEY=<private>
supabase secrets set VAPID_SUBJECT=mailto:you@example.com
supabase secrets set ALLOWED_ORIGIN=https://<your-app>.vercel.app

supabase functions deploy mark-attendance --no-verify-jwt
supabase functions deploy send-class-alerts --no-verify-jwt
```

`--no-verify-jwt` lets pg_cron call the sweep with the service-role key.

## 5. Schedule the alert sweep

Uncomment the `cron.schedule` block at the bottom of `schema.sql`, fill in your
project ref and **service role** key, and run it. It fires every 5 minutes;
`SWEEP_MINUTES` in the function must match that interval.

Check it works:

```sql
select * from cron.job;
select * from cron.job_run_details order by start_time desc limit 5;
```

## 6. Frontend

```bash
cp .env.example .env.local   # fill in the three values
npm install
npm run dev
```

Then push to GitHub, import the repo at vercel.com, and add the same three env vars
under **Settings → Environment Variables**. Vercel serves HTTPS by default, which
service workers and push both require.

Icons ship in `public/` already. Swap them if you want different artwork; the
manifest expects `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, and
`icon-badge.png`.

**Deploying for the first time? Follow `RUNBOOK.md`** — it walks the whole setup
end to end and includes the iOS push test protocol.

---

## How the pieces fit

```
Class_Schedule_Term-V.xlsx ──► build_catalogue.py ──► catalogue.json
                                                            │
                                                     course picker
                                              search, tick, choose section
                                                    clash detection
                                                            │
                                                       classes table
                                                            │
  pg_cron every 5 min ─► send-class-alerts ─► web push ─► service worker
                                │                              │
                                │                    "Mark present" button
                                │                              ▼
                                │                      mark-attendance
                                └─ alert_log dedupes, so no double pings
```

## Things worth knowing before you pilot

- **Notification buttons are Chrome-only and capped at two.** iOS and Firefox
  render none, so the buttons are a shortcut and never the only route — the
  body text falls back to an instruction there, and ignoring a notification
  always leaves the session in Catch up.
- **The service worker can't write attendance itself.** It has no Supabase
  session, so an action button passes its intent through the URL and the app
  applies it on load.

- **Sixteen courses meet twice in one day.** Attendance is therefore keyed on
  `(user, subject, date, start_time)`, not just the date. If you ever change
  that key, check `scripts/build_catalogue.py` output first — the double
  sessions are visible there.

- **iOS needs the Home Screen install.** Safari only delivers web push to PWAs added
  to the Home Screen. The app detects this and says so instead of failing silently.
  Measure delivery rates on iPhone during the pilot — if they disappoint, the same
  React code wraps in Capacitor for native scheduled notifications.
- **The catalogue is the source of truth.** Because it's generated from the published
  grid, a picked course's meetings are correct by construction. Anything the image
  parser can't match to a code is kept verbatim and flagged amber for the student.
- **Rebuild the catalogue every term.** A stale catalogue is the one failure mode that
  silently sends wrong alerts. Regenerate from the new CSV and redeploy both copies.
- **Anonymous auth means the account lives in browser storage.** Clearing site data
  loses the timetable. Add email or Google sign-in before students rely on this for
  a full term.
- **Free-tier Gemini may use prompts for training.** Timetables are low-sensitivity,
  but say so in your privacy note.
- **Term-start is your load spike.** Every student uploads in the same week. Watch
  the daily request cap then, not on an average day.
