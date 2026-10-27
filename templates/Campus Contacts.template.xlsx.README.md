# Campus Contacts — medical, shops, food, sports, hostel staff

Read by: scripts/build_campus.py    Feeds: the Campus & Hostel Services screen



**Sheet names must match exactly:**

Medical · Doctor Hours · Services · NH · OH · LVH · WH



**Not in this workbook, on purpose:**

The hostel and mess reps, the four night messes, Mohan Da and the WH tuck shop. The build copies them from the POR sheet, the night menu and the tuck shop workbook, which are the one place each number is written. Rebuild campus.json after rebuilding any of those.



**Columns are found by heading:**

Order does not matter, but the headings must read as below.



**Phone numbers:**

Ten digits starting 6-9. Anything else stops the build — a typo'd number is a dead call button. 'Phone label' names a number when a contact has two that differ ('Day, till 7:30 PM' / 'Night').



**Doctor Hours:**

Monday to Sunday, in that order, one row each. They belong to the Medical row named 'Doctor'.



**Services:**

Group is Store, Food or Services (shown as Shops, Food, Sports). Delivery reads Yes, No, or a short phrase kept as written.



**Hostel sheets:**

A Note reading 'Contact the OH Rep' (or NH, LVH, WH) gets that hostel's rep and their number shown beside it. A row with no number and no note is left out and reported.



**Corrections:**

Cells known to be wrong in the source sheet are fixed in a list inside build_campus.py and re-checked on every run, as in build_por.py.



**This template will not build as-is, and that is correct:**

Running build_campus.py against it fails, naming something of the real sheet's it expected — Kotler Da for the NH tab, or the WH electrician's misspelling it corrects. That is the guard doing its job. A real filled-in workbook builds cleanly.
