# RollCall (IIMPresent) — Vendor Handoff

**What this document is for:** everything needed to run and support the portal
day to day, written for whoever is looking after it operationally — not
necessarily someone who reads or writes code. Anything that genuinely needs a
developer is called out explicitly, with what to hand them.

**Not covered here, by design:** who owns the hosting/database/Google
accounts and how login access to them transfers. That is being handled as its
own conversation, separately from this document.

---

## 1. What the portal is

RollCall (the app itself is titled **IIMPresent**) is a website built for
IIM Calcutta MBA students. It turns the institute's official class schedule
into each student's personal weekly timetable, and tracks their attendance
against the institute's 75% (or 80%, for half-term courses) requirement.

Students sign in with **Google**, restricted to `@email.iimcal.ac.in`
addresses — enforced by the database itself, not just the sign-in screen, so
it cannot be bypassed by calling the API directly.

## 2. What a student sees

Four tabs, always visible at the bottom of the screen:

| Tab | What it does |
| --- | --- |
| **Today's classes** | Today's sessions in order, with Present / Absent / Cancelled buttons and a live marker on whichever class is happening right now. |
| **Week's Timetable** | The whole week as a grid — time down the side, days across. On a laptop-width screen every day fits side by side; on a phone it scrolls sideways with the time column pinned. |
| **Missed Attendances** | Sessions from the last 4 weeks that were never marked, so a forgetful week doesn't quietly wreck the attendance percentage. |
| **Profile** | Account info, a per-course "skips left" budget, changing picked courses, sign out. The admin-only **Schedule admin** screen (§4a) opens from here too. |

From **Week's Timetable**, four more screens open:

- **Reschedule** — move or cancel a single occurrence of a class, including
  one that already happened (for entering a change after the fact).
- **Term calendar** — term dates, the pre-mid/post-mid teaching windows, and
  break weeks (exams, placements, Puja vacation).
- **Faculty directory** — every IIM Calcutta faculty member (room, extension,
  direct line, email), searchable, with the student's own instructors tagged
  and pinned to the top.
- **Add to calendar** — downloads a `.ics` file of the student's whole term,
  with on-screen steps for importing it into Google Calendar or Apple
  Calendar. It's a one-time snapshot, not a live sync — see §6.

**First run:** a student who hasn't picked courses yet lands on a searchable
course picker instead of these tabs. It warns if two picked courses would
clash, and section-picks a course that has more than one section.

## 3. Where it actually lives

Three separate places, each doing a different job:

1. **The source code** — a GitHub repository. This is the single source of
   truth for the website's code. Nothing that isn't in this repository is
   part of the live app.
2. **Hosting** — Vercel. Every push to the repository's main branch
   automatically rebuilds and redeploys the website — there's no separate
   "publish" step for the code itself.
3. **Database** — Supabase, which hosts the Postgres database and handles
   Google sign-in.

Every student's timetable, attendance history, and the term schedule itself
live in Supabase's database — not in the code, and not on the student's
phone. A code deploy on Vercel cannot lose or change anyone's data.

## 4. What you'll actually be asked to do

Four recurring tasks, roughly in order of how often each comes up.

### 4a. Publish a new term's schedule

> **Before you start:** this is the one task in this whole document that
> needs a command line and Python, not just a web page. Everything else here
> is point-and-click. If nobody on your side is comfortable running a script
> from a terminal, say so up front and loop in a developer just for step 2 —
> everything after that is a normal web screen.

1. Get the new term's class schedule from the institute, in the same Excel
   layout as previous terms.
2. From a computer with this repository and Python installed, run:

   ```bash
   python scripts/build_catalogue.py path/to/NewSchedule.xlsx src/data/catalogue.json data/overrides.json
   ```

   This turns the spreadsheet into `catalogue.json` — the file the next step
   actually uploads. It prints a summary (course count, anything it couldn't
   confidently match) when it finishes.
3. Sign in to the portal with the admin account → **Profile → Schedule
   admin**.
4. Under **Upload**, choose the `catalogue.json` just produced. The screen
   checks it immediately and shows a summary — course count, meeting count,
   term dates. If it's rejected, the exact problem is listed (e.g. "course AP
   has no sections"). **Nothing has changed yet at this point** — an upload
   on its own is inert.
5. Click **What would change?** for a plain-language diff against what's
   currently live: new courses, removed courses, anything corrected, and —
   importantly — any course whose meeting *time* itself changed.
6. If it looks right, click **Publish**. This is the one action in the whole
   flow that isn't reversible with an "undo" button — it immediately sets
   the term dates and break weeks for everyone, and corrects the saved
   details (room, credit rules, which half of term) for every student who
   already picked that course.

> **The one thing publishing cannot fix:** if a course's meeting *day or
> time* genuinely changed (not just its room), a student who already picked
> it keeps seeing the old time until they personally go to **Profile →
> Change my courses** and re-pick it. The preview in step 5 calls this out
> by name before you publish — read that warning if it appears.

Until the very first schedule is published this way, the app quietly runs on
the schedule that was baked into the code at the last deploy — nothing
breaks in the meantime.

### 4b. Grant another admin

Only one account can publish schedules today. To add a second, run this in
Supabase's **SQL Editor**:

```sql
update profiles set is_admin = true
from auth.users u
where u.id = profiles.id and lower(u.email) = 'newadmin@email.iimcal.ac.in';
```

The person has to have signed into the portal at least once already — their
account record doesn't exist until they do.

### 4c. Update the faculty directory

When the institute issues a corrected faculty directory (rooms and
extensions change from time to time):

1. Save the new sheet as `data/FacultyDirectory.tsv`, same layout as before.
2. Run:
   ```bash
   python scripts/build_directory.py data/FacultyDirectory.tsv src/data/directory.json
   ```
3. Commit and push the result. This one needs a developer (or anyone with
   git access) for the commit/push step — unlike the schedule, the faculty
   directory is part of the code, not something uploaded through a screen.

### 4d. "My timetable shows the wrong room / wrong term half for one course"

This happens when a course was corrected on the institute's spreadsheet
after students had already picked it, and that correction was never
re-published. The fix is exactly §4a, run again with the corrected file —
publishing brings every affected student's saved details back in line
automatically. It never touches their attendance history or removes the
course from their list.

## 5. "I can't sign in"

The portal only accepts Google accounts on `@email.iimcal.ac.in` — enforced
in the database, so there's no workaround to offer even from the admin side.
If a genuine student is blocked, the near-universal cause is that they used a
personal Gmail address, or a Google Workspace account under a different
domain, by mistake. Ask them to retry with their institute address
specifically.

## 6. Known limitations — worth knowing before you promise otherwise

- **A moved class time needs the student to re-pick the course** (§4a) —
  publishing corrects everything except the two things a saved row is
  matched on (the course's day and start time).
- **This is the student's own attendance record, not the institute's
  official one.** The app says so on-screen. It exists to help a student
  track where they stand; it has no connection to whatever system the
  institute uses to certify attendance.
- **Calendar export is a snapshot.** A student who reschedules a class after
  exporting has to export and re-import again to see the change reflected in
  their Google or Apple Calendar — it doesn't update itself.

## 7. Handle it yourself, or bring in a developer?

**You can do these without touching code:**
- Publish a new term schedule, once `catalogue.json` exists (§4a, from step 3
  onward)
- Grant a new admin (§4b)
- Diagnose a sign-in complaint (§5)

**These need a developer:**
- Turning the institute's spreadsheet into `catalogue.json` (§4a, step 2 —
  one command, but it needs Python and a terminal)
- Updating the faculty directory (§4c — needs a git commit and push)
- Any change to how a screen looks, reads, or behaves
- Any change to the database structure itself

## 8. A short glossary

| Term | Means |
| --- | --- |
| **RLS (Row Level Security)** | A database-level rule that only ever lets a student see or change their own data, enforced by the database itself — a bug in the website's code can't accidentally expose someone else's timetable. |
| **Catalogue** | The machine-readable version of one term's class schedule — what `build_catalogue.py` produces and Schedule admin uploads. |
| **Publish** (Schedule admin) | The one action that makes an uploaded catalogue the live schedule for everyone. |

---

*A shorter developer-facing overview (`START-HERE.md`) lives alongside this
file in the repository, for whoever ends up doing the developer-side tasks
in §7.*
