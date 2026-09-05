# POR Contacts Sheet — eight sheets, four different shapes

Read by: scripts/build_por.py    Feeds: the POR Details screen



**Sheet names must match exactly:**

Student Council · Preparation Committee · Placement Representatives · Clubs · SIGs · Chapters · Cultural Cell · Sports Council



**Columns are read by POSITION, not by heading:**

The headings are there for the person filling the sheet in. The parser counts columns, so a column inserted in the middle silently shifts everything after it. Add new columns at the far right only.



**Phone numbers:**

Ten digits starting 6-9. '+91' and spaces are fine and are stripped. Anything that is not a valid Indian mobile is dropped and reported when the build runs, so check that list.



**Clubs, SIGs and Chapters:**

Fill the Group cell on the FIRST row of each group only; leave it blank on the rows beneath and they are taken as belonging to the group above.



**Sports Council:**

A row reading 'Sports Captains' on its own starts a second section within the sheet, and a repeated header row after it is fine.



**Corrections:**

Numbers known to be wrong in the sheet are fixed in a list inside build_por.py, and re-checked on every run. If the workbook comes back with one already fixed — or changed to something else — the build stops rather than quietly reapplying a stale correction.



**This template will not build as-is, and that is correct:**

Running build_por.py against this blank template fails with 'ADDITIONS no longer describe the workbook', naming real students it expected to find. That is the guard above doing its job — the template has none of them in it. A real filled-in workbook builds cleanly. Nothing to fix here.
