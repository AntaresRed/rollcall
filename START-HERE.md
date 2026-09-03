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
  screens/            Splash, SignIn, Today, Timetable, EditAttendance, Stats,
                      Profile, Reschedule, TermCalendar, CoursePicker,
                      AttendanceBreakdown, SectionPicker,
                      CataloguePreview, MessMenu (Day + Night),
                      Utils (the hub) and what it opens — Faculty,
                      CalendarExport, PorDetails —
                      plus ScheduleAdmin, reached from Profile
  data/catalogue.json generated — do not edit by hand (second years)
  data/catalogue-pgp1.json  generated — do not edit by hand (first years)
  data/menu.json      generated — do not edit by hand (day mess)
  data/night-menu.json generated — do not edit by hand (night canteens)
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

## When the mess menu changes

The Day mess menu screen reads `src/data/menu.json`, built from a workbook
with one sheet per hostel (`NH Day Mess menu`, `OH Day Mess Menu`, and so on):

```powershell
python scripts/build_menu.py "data/Day Mess Menu.xlsx" src/data/menu.json
```

The night canteens are a separate workbook and a separate script, because
they are a different kind of thing — a priced list per hostel rather than a
week of meals:

```powershell
python scripts/build_night_menu.py "data/Night Mess Menu.xlsx" src/data/night-menu.json
```

That workbook has an `Info` sheet (canteen name, phone, hours, room service)
and one `<TAG> Night Menu` sheet per hostel with **Category, Item, Price,
Diet**. `Diet` is `veg`, `egg` or `non-veg` and is what the app's veg filter
reads — it is a column rather than something guessed from the item name,
because guessing is right most of the time and the times it is wrong are the
times a vegetarian eats meat. Anything left blank or marked `?` is carried
through as *unconfirmed*: shown under every filter, marked with a hollow dot,
never silently called vegetarian. Twelve items are in that state today.

The hostel is read off the front of each sheet name, so a fifth mess is a new
sheet rather than a code change. The build fails rather than emitting blanks
if a sheet is missing a meal column or a weekday, and it reports any hostels
whose menus are identical — LVH and WH are, today — so a copy-pasted sheet is
noticed instead of shipped as fact.

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

1. Build the catalogue from the spreadsheet. Second years (electives):

   ```
   python scripts/build_catalogue.py "data/Class Schedule_Term-V_AY-2026-27.xlsx" src/data/catalogue.json data/overrides.json data/faculty.json 2027
   ```

   First years (core curriculum, six sections):

   ```
   python scripts/build_pgp1_catalogue.py "data/PGP1 term 2.xlsx" src/data/catalogue-pgp1.json src/data/directory.json 2028
   ```

   The last argument is the **graduating year** the schedule serves, which is
   what matches it to its students. Both scripts stop rather than emit a
   half-parsed term if the workbook has changed shape.
2. Upload the resulting `catalogue.json` on the Schedule admin screen. It is
   checked and stored as a **draft** — nothing changes for anybody.
3. Press *What would change?* to see the difference against what is live.
4. Press **See it as a student** to read the schedule the way somebody on it
   will — the real Today and Timetable screens, with a section and a date you
   choose. This works on an unpublished draft, which is the point: it is how
   you check a parse *before* it goes live. Nothing there is saved and marking
   is disabled.
5. Press **Publish**.

Publishing sets the term dates and break weeks for everyone and corrects the
saved rows of students who already picked those courses — phase, venue, credit
rules, end time — keeping row ids so attendance stays attached. It never adds
or removes a course from anyone's timetable, and never touches `muted`.

The one thing it cannot repair is a course whose *meeting times* moved: saved
rows are matched on day and start time, so those students keep the old slot
until they re-pick the course. The preview calls this out before you publish.

Until something is published the app runs on the copy compiled into the
bundle — but only for the cohort that copy belongs to. The bundled schedule is
the second years', so a first year with nothing published sees "no timetable
published for your year yet" rather than somebody else's electives.

### Seeing the app as the other year

An admin with more than one live schedule gets an offer at the top of the app:
**see it as another year**. Taking it re-renders the whole app — Today, the
timetable, Utils, Profile — as a student of that cohort, with a section
selector and an obvious dark bar saying so.

It is strictly read-only. The timetable is synthesised from that cohort's
published catalogue and never saved: the rows carry ids that exist in no
table, every write callback returns early, and marking, rescheduling, muting,
course-changing and Schedule admin are all switched off while it is on.
"Back to mine" restores your own timetable and catalogue.

This is for checking a parse and walking a first year's app without a first
year's account. It cannot mark attendance — if you need to exercise the write
path, sign in with a real `…2028@` account.

### Two years, one app

Which schedule a student gets comes from the **graduating year in their
address** (`anuja2027@` → 2027), stored once on their profile at sign-up and
never changed afterwards. Terms and catalogues carry the same year, and there
is one live schedule *per cohort*.

Nothing needs doing each August: publish the new term for each year and
everyone moves up, because it is the term that moves, not the student.

Run `supabase/pgp1-cohorts.sql` once to add this. It is safe on its own and
changes nothing visible until a second cohort's catalogue is published.

**Deploy in this order.** The migration first, then the app, then publish the
first-year schedule. An app built before the migration asks for "the current
term" without naming a cohort, so a second live term existing too early could
hand a second year the first years' dates.

The only manual lever you should ever need is for a student whose address does
not describe them — someone repeating a year:

```sql
update public.profiles set cohort_year = 2028
 where id = (select id from auth.users where email = 'someone2027@email.iimcal.ac.in');
```

## Still open

- **Anonymous accounts.** Clearing browser data loses a student's timetable.
  Worth replacing with email or Google sign-in before anyone relies on this.
- **iOS delivery.** Unverified: whether notifications still arrive after the
  app has sat unopened for several days. Only a real phone can answer it.

`RUNBOOK.md` has the full setup and the diagnostic queries.

`VENDOR-HANDOFF.md` is the operational handoff document — written for whoever
takes over running the portal day to day, not necessarily a developer.
