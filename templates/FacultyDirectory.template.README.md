# FacultyDirectory.tsv

**Read by:** `scripts/build_directory.py` (and `scripts/build_faculty.py`)
**Feeds:** the Faculty directory screen, and the email shown against each course

Tab-separated. The first row is a header and is skipped.

## Columns, in this order

| # | Column | Notes |
|---|---|---|
| 1 | Name | May carry an administrative title in brackets — see below |
| 2 | Room | |
| 3 | Extension | |
| 4 | Direct | Full outside line |
| 5 | Email | |

**Columns are read by position, not by heading.** A column inserted in the
middle shifts everything after it. Add new columns at the far right only.

## Two rows for one person

Deans and chairpersons appear twice: once under their own name and office,
and once under the administrative title with that office's room and role
address. Write the title in brackets after the name —

```
Manish Thakur (Dean NIER)	P-303	1120	033-7121-1120	dean_nier@iimcal.ac.in
Manish Thakur	B-308	2120	033-7121-2120	mt@iimcal.ac.in
```

— and the app shows one person holding both offices, their own first. Do not
merge them into one row: each carries a number somebody might need to dial.

## Nothing on file

Write `—`, `-`, `n/a` or leave the cell empty. Any of those is understood as
"not on file" and is left out of the card rather than printed as if it were a
room number.

## A caution

This builder currently has **no failure path**. If the columns move, it will
write a plausible-looking file with the wrong things in the wrong fields, and
say nothing. Check the count it prints at the end against what you expected.
