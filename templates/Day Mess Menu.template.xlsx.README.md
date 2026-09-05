# Day Mess Menu — one sheet per hostel

Read by: scripts/build_menu.py    Feeds: the Day mess tab



**Sheet names:**

One sheet per hostel. The hostel is read from the FIRST WORD of the sheet name, so 'NH Day Mess Menu' and 'NH Menu' both work, but two sheets starting with the same word will stop the build.

Adding a fifth hostel is a new sheet. It needs no code change.



**Columns:**

Breakfast, Lunch, Snacks and Dinner must all be present. They are found by name, so you may reorder them or add columns of your own in between — but renaming one stops the build.



**Rows:**

All seven days, spelled in full, Monday first through Sunday. A missing or misspelled day stops the build.

Blank spacer rows and stray notes are ignored.



**Items served every day:**

A row containing 'Everyday offering' is treated as food served regardless of the weekday, and shown under every meal. Write it as 'Breakfast: ... Lunch: ...' to split it per meal; anything else is kept whole and shown as one note.



**What the app does with blanks:**

An empty meal cell is allowed and is reported as a warning when the build runs. It will show as an empty meal in the app.
