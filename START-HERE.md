# IIMPresent — final package

Replace your project folder's contents with everything in here, then:

```powershell
npm install
git add .
git commit -m "Crash reporting, revised design, rescheduling"
git push
```

Then **delete the IIMPresent icon from your Home Screen and add it again.** The
service worker is at v8; the old one will keep serving the old bundle until
it's removed.

---

## Sign-in changed

IIMPresent now requires a Google account on **@email.iimcal.ac.in**; anonymous
accounts are gone. This needs a one-time setup in Google Cloud Console and
Supabase before anyone (including you) can get in — **see `GOOGLE-SIGNIN.md`**.

Until that's done the app will show the sign-in screen and go no further.

## Two things to check first

**1. Your Vercel environment variables must exist.** Vite bakes them in at
build time, so a missing one produces a working build and a blank page. The app
now says so out loud instead, but it's quicker to confirm up front:

Vercel → Settings → Environment Variables

| Name | Where it comes from |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public |
| `VITE_VAPID_PUBLIC_KEY` | `npx web-push generate-vapid-keys` |

If you edit any of them, **redeploy** — editing alone doesn't rebuild.

**2. `.eslintrc.cjs` starts with a dot.** Windows Explorer sometimes hides or
mangles it. Confirm with `dir -Force`. It's optional: without it, set
`"build": "vite build"` in `package.json` and everything still works.

---

## Notification buttons need one new secret

The Present / Absent buttons now write attendance directly, without opening the
app. A service worker can't safely hold a Supabase session, so each alert
carries a token authorising that one session for that one student, valid for
six hours. Set the signing secret and deploy the endpoint:

```powershell
supabase secrets set ATTENDANCE_TOKEN_SECRET=<a long random string>
supabase functions deploy mark-attendance --no-verify-jwt
supabase functions deploy send-class-alerts --no-verify-jwt
```

Any long random string works. On Windows, `[guid]::NewGuid()` twice over is
fine; on macOS or Linux, `openssl rand -hex 32`.

Until the secret is set, the buttons fall back to their old behaviour — opening
the app with the mark applied — so nothing breaks while you get to it.

## Checking your own changes

```powershell
npm run smoke     # renders every screen, exercises the data layer
npm run lint      # hook order, undefined variables
npm run build     # runs both, then builds — fails if either does
```

`npm run smoke` is the one that matters. Every crash that has reached this app
was a shape mismatch — an occurrence handed to something expecting a class row
— which builds cleanly, passes a linter, and dies on first render. The smoke
test renders all 24 screen states, including empty, malformed and over-budget
input, and 34 checks push bad values through the date and attendance logic.

It's wired into `build`, so a broken screen fails the Vercel deploy rather than
shipping a blank page.

## If the app doesn't start

It will now tell you why, in one of three ways:

- **A message before React loads** — something failed while modules were
  evaluating. Usually a missing environment variable.
- **"Something went wrong" with a stack trace** — a render crash. The
  **Clear cache and reload** button unregisters the service worker and empties
  the caches, which fixes anything caused by a stale bundle.
- **"The app loaded but never rendered"** after eight seconds — wedged, most
  often on a stale service worker.

Send whichever message you get; it names the actual fault.

---

## What's in the box

```
index.html            crash handler that runs before React
vite.config.js        build config (React stays in the entry chunk on purpose)
.eslintrc.cjs         catches hook-order and undefined-variable bugs at build

src/
  main.jsx            entry, wraps the app in the error boundary
  ErrorBoundary.jsx   render-crash screen with a cache-clearing escape hatch
  App.jsx             state, routing, alert handling
  styles.css          design tokens and every component style
  lib/
    supabase.js       client, fails loudly if config is missing
    api.js            all data access, attendance maths, occurrence generation
    push.js           subscription, permissions, test notification
  screens/            Splash, SignIn, Today, Timetable, CatchUp, Stats,
                      Profile, Reschedule, TermCalendar, CoursePicker,
                      AttendanceBreakdown,
                      Utils (the hub) and what it opens — Faculty,
                      CalendarExport, PorDetails —
                      plus ScheduleAdmin, reached from Profile
  data/catalogue.json generated — do not edit by hand
  data/directory.json generated — do not edit by hand
  data/por.json       generated — do not edit by hand

public/               manifest, service worker, icons
data/
  overrides.json      schedule amendments; edit these, not the catalogue
  Class_Schedule_Term-V_AY-2026-27.xlsx
scripts/
  build_catalogue.py  rebuilds the catalogue from the spreadsheet
  build_faculty.py    matches course instructors to directory emails
  build_directory.py  rebuilds src/data/directory.json from FacultyDirectory.tsv
  build_por.py        rebuilds src/data/por.json from the POR workbook
  build_repair_sql.py emits the SQL that realigns saved class rows with a
                      corrected catalogue (see RUNBOOK 8e). Run automatically
                      by build_catalogue.py — you never call this directly.
supabase/
  schema.sql          run in the SQL Editor; safe to re-run
  admin-schedule.sql  adds the super-admin flag and schedule publishing
  fix-signin.sql      standalone patch for the sign-in trigger
  functions/          send-class-alerts, mark-attendance
```

## Removing the test courses

Delete the `ZTEST`, `ZSAT` and `ZSUN` entries from `data/overrides.json`, then:

```powershell
python scripts/build_catalogue.py data/Class_Schedule_Term-V_AY-2026-27.xlsx src/data/catalogue.json data/overrides.json
```

Then push. The catalogue is read by the app only, so there is nothing to
copy into an edge function and nothing to redeploy.

## When the faculty directory changes

The Faculty details screen reads `src/data/directory.json`, which is the whole
of `FacultyDirectory.tsv` — name, room, extension, direct line, email. When a
new sheet arrives:

```powershell
python scripts/build_directory.py data/FacultyDirectory.tsv src/data/directory.json
```

`build_faculty.py` is a separate step and answers a different question — which
directory entry each course instructor is — so run it too if the course sheet
changed, then rebuild the catalogue to attach the result.

## When the POR contact sheet changes

The POR details screen reads `src/data/por.json`, built from the eight-sheet
POR contacts workbook:

```powershell
python scripts/build_por.py "data/POR Contacts Sheet.xlsx" src/data/por.json
```

Two things about that script are worth knowing before a rebuild:

**It knows the shape of each sheet, not each sheet's code.** The `SHEETS`
table near the top says which column holds the post, the name, the number and
the email, and whether the sheet groups its rows (Clubs, SIGs and Chapters
name a group only on its first row). A sheet added next year is an entry in
that table.

**Four numbers are corrected on the way through**, listed in `CORRECTIONS`
with the reason for each — found by cross-checking every number against the
student roll. Those corrections are *verified* on every run: if a reissued
workbook has already fixed one, or changed the cell to something else, the
build fails rather than quietly reapplying a stale fix. Delete the entry when
the source is corrected. Sequential numbers that clearly belong to an issued
block — the Placement Representatives' — are deliberately left alone.

## Publishing a new term schedule

Run `supabase/admin-schedule.sql` once. It adds `profiles.is_admin`, a
`catalogues` table, and `publish_catalogue()`. The admin account must have
signed in at least once before running it, since the profile row is what gets
flagged.

Afterwards, Profile grows a **Schedule admin** button for that account only.
The flow:

1. Build the catalogue from the spreadsheet as usual:
   `python scripts/build_catalogue.py data/Class_Schedule_Term-V_AY-2026-27.xlsx src/data/catalogue.json data/overrides.json`
2. Upload the resulting `catalogue.json` on the Schedule admin screen. It is
   checked and stored as a **draft** — nothing changes for anybody.
3. Press *What would change?* to see the difference against what is live.
4. Press **Publish**.

Publishing sets the term dates and break weeks for everyone and corrects the
saved rows of students who already picked those courses — phase, venue, credit
rules, end time — keeping row ids so attendance stays attached. It never adds
or removes a course from anyone's timetable, and never touches `muted`.

The one thing it cannot repair is a course whose *meeting times* moved: saved
rows are matched on day and start time, so those students keep the old slot
until they re-pick the course. The preview calls this out before you publish.

Until something is published the app runs on the copy compiled into the
bundle, exactly as before.

## Still open

- **Anonymous accounts.** Clearing browser data loses a student's timetable.
  Worth replacing with email or Google sign-in before anyone relies on this.
- **iOS delivery.** Unverified: whether notifications still arrive after the
  app has sat unopened for several days. Only a real phone can answer it.

`RUNBOOK.md` has the full setup and the diagnostic queries.

`VENDOR-HANDOFF.md` is the operational handoff document — written for whoever
takes over running the portal day to day, not necessarily a developer.
