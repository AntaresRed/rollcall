# Input templates

A blank, correctly shaped example of every file the portal is built from.
Hand the relevant one to whoever supplies that data.

**These are examples, not data.** Nothing here is read by the app or by any
build. Fill a copy in, put it wherever you keep the real sheets, and point
the builder at that.

| Template | Given by | Read by | Feeds |
|---|---|---|---|
| `Class Schedule Term.template.xlsx` | Academic office | `build_catalogue.py` | Second-year timetable, alerts, attendance |
| `PGP1 Schedule.template.xlsx` | Academic office | `build_pgp1_catalogue.py` | First-year timetable |
| `CourseProfOutline.template.tsv` | Academic office | `build_faculty.py` | Professor shown per course |
| `FacultyDirectory.template.tsv` | Institute directory | `build_directory.py` | Faculty directory screen |
| `POR Contacts Sheet.template.xlsx` | Student Council | `build_por.py` | POR Details screen |
| `Day Mess Menu.template.xlsx` | Mess secretary | `build_menu.py` | Day mess tab |
| `Tuck Shops.template.xlsx` | Tuck shop / mess secretary | `build_tuck.py` | Tuck shops tab |
| `Night Mess Menu.template.xlsx` | Canteen / mess secretary | `build_night_menu.py` | Night canteen tab |

Every template has a `.README.md` beside it saying what each sheet and column
means and what will stop the build.

The guidance is deliberately not a tab inside the workbook. `build_menu.py`
treats every sheet as a hostel and `build_night_menu.py` every sheet but
`Info` as a menu, so an explanatory tab reads as data and stops the build.
That is worth knowing when you fill one in: **do not leave a "Notes" or
"Sheet1" tab in the mess workbooks.**

## Rules that hold for all of them

**Send `.xlsx`.** The builders use openpyxl, which reads `.xlsx` only. A
`.xls`, a Google Sheet or a PDF needs *File → Download as .xlsx* first.

**A renamed column usually stops the build**, and prints the header it
actually read. That is the intended behaviour: a build that stops costs an
hour, and a build that guesses costs a term of wrong alerts.

**Two files are read by column position rather than by heading** — both
`.tsv`s. Inserting a column in the middle of those shifts everything after it
silently. Add columns at the right-hand end only.

**Corrections after the fact do not belong in these files.** The institute
amends schedules without reissuing the workbook. Those go in
`data/overrides.json` (schedules) or the correction lists inside
`build_por.py` (contacts), both of which are reapplied on every rebuild and
fail loudly if the source later changes underneath them.

**Read what the build prints.** Every builder ends with a summary — how many
courses, people or items it found, and what it could not resolve. That
summary is the check that catches a file which parsed cleanly but is not the
file you meant to hand it.

## These have been run through their own parsers

Every template here was fed to the builder that reads it, and the output
checked. A template that its own parser rejects is a wrong template, and the
first draft of these was rejected — the explanatory tab inside each workbook
was being read as a hostel.

One exception, and it is correct behaviour: **`build_por.py` fails against
the blank POR template**, with `ADDITIONS no longer describe the workbook`.
The corrections list inside that builder names real students, and this
template contains none of them. A real filled-in workbook builds cleanly.

## One hazard when testing a build by hand

`build_catalogue.py` also writes `supabase/repair-stale-classes.sql`, at that
fixed path, whatever output file you pass it. Running it against a test
workbook overwrites the real one. Commit or stash before experimenting.

## Regenerating

    python3 scripts/build_templates.py

The templates are generated, so that when a parser changes the template can
change with it. If you edit a builder's expectations, edit
`scripts/build_templates.py` too and re-run.
