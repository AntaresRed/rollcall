# PGP1 Schedule — a core curriculum, so the section decides everything

Read by: scripts/build_pgp1_catalogue.py    Feeds: the first-year timetable



**Why this is a separate file from the PGP2 schedule:**

First years do not pick courses. Every student is in one section, A to F, and the whole timetable follows from it. So each grid cell names its section, and the app shows a section picker rather than a course search.



**Sheets — all four must be present, named exactly:**

Pre Mid Term-II · Post Mid Term-II · Instructors · Calendar

The two grids are the two halves of the term. A course that only runs in one half appears on one sheet, which is how the app knows not to alert for it in the other half.



**The grids:**

The header row must contain a cell reading 'Dayslot / Timeslot' — that cell is how the parser finds which column holds the day names, so the column may move but that heading may not disappear.

Day names go under it, spelled in full. Time slots across the top as HH:MM, found by reading the same header row, which may sit anywhere in the first eleven rows.

Recognised start times: 08:30, 10:15, 12:00, 14:30, 16:15. First years have no 18:00 slot.



**What goes in a grid cell:**

Course Name (SECTION) then, on a new line, (Instructor code) Room

e.g.  Organizational Behaviour-II (A)

      (VJ) L-21

Every course must cover sections A to F exactly once across the grid. A section listed twice, or missing, stops the build — that is the check that catches a copy-paste slip in a sheet where every row looks alike.



**Rooms follow the section, not the course:**

A=L-21, B=L-22, C=L-31, D=L-32, E=N-31, F=N-32 in a typical term. Write the room in the cell anyway; it is read from there, not assumed.



**The Instructors sheet:**

Course Code in column B, Course Name in C, Credits in D, Instructors in E. The header row may sit anywhere in the first seven rows as long as one cell reads 'Course Code'.

List several instructors on separate lines within the cell. Mark who teaches which sections in brackets — 'Secs-A,C', 'Sec-B', '(A, B and C)' and 'Secs.CDEF' are all understood.

Name the sections explicitly. Between them the instructors must cover A to F exactly once, and a phrase like 'all sections' does not count — the build stops rather than assuming which six it meant.

Course names here must match the grid's spelling closely; where they have drifted the build says so rather than guessing.



**The Calendar sheet:**

Same shape as the PGP2 one — a label on the left, dates on the right. First-year term dates are genuinely different from the second years', which is why each cohort has its own.

Every one of these rows is required, and a missing one stops the build by name: duration of term · pre mid term classes · post mid term classes · mid term exam · summer placement · puja vacation · end term exam.
