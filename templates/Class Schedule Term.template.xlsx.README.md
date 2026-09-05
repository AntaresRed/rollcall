# Class Schedule (PGP2) — the weekly grid and the term calendar

Read by: scripts/build_catalogue.py    Feeds: every timetable, every alert, and the attendance maths



This is the most important file in the portal. Everything else is reference; this one decides what each student sees and when they are told to go to class.



**Sheets:**

One whose name STARTS WITH 'Class Schedule' — the weekly grid.

One whose name STARTS WITH 'Calendar' — the term dates.

Optionally, one sheet per block course taught on fixed dates. Where one exists it overrules the grid, because the grid only shows which slot the course occupies and the detail sheet says which dates it actually meets.



**The grid:**

Day names down the first column, spelled in full. Time slots across the top as HH:MM. Slot columns are found by reading the header, so they may be reordered.

Recognised start times: 08:30, 10:15, 12:00, 14:30, 16:15, 18:00. Every class is 90 minutes. A start time not on that list stops the build rather than being guessed at.



**What goes in a grid cell:**

Course Name-SECTION (Instructor codes) Venue

e.g.  Marketing Research-A (SKB) L-51

**A course running only half the term carries its phase in brackets:**

e.g.  Bank Management (Post Mid Term) (RC) Amphi West 100

Leave a cell empty when nothing runs in that slot.



**The calendar sheet:**

**Two columns — a label on the left, dates on the right. The labels that are read must contain these words:**

duration of term · pre mid term classes · post mid term classes · mid term exam · summer placement · puja vacation · end term exam

Write dates in full: 'August 4, 2026 to September 20, 2026'.



**A warning about running the build by hand:**

build_catalogue.py also writes supabase/repair-stale-classes.sql, at that fixed path, whatever output file you give it. Running it against a test workbook overwrites the real one. Commit or stash before experimenting.



**Changes after the file is issued:**

The institute amends schedules and does not reissue the workbook. Do NOT hand-edit this file for those. They go in data/overrides.json, which is reapplied on every rebuild and fails loudly if the sheet later changes underneath it.
