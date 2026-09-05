# CourseProfOutline.tsv

**Read by:** `scripts/build_faculty.py`
**Feeds:** the professor shown against each course

Tab-separated. Everything above the header row is ignored, and the header row
is found by looking for a first cell reading exactly **`Sl. No.`** — so that
cell has to be spelled that way.

## Columns, in this order

| # | Column | Notes |
|---|---|---|
| 1 | Sl. No. | Also used to find the header row |
| 2 | Course Code | Required — a row without one is skipped |
| 3 | Course Name | Required |
| 4 | Area | Read but not used |
| 5 | Credit | `3` or `1.5` |
| 6 | Instructors | See below |

**Columns are read by position, not by heading.**

## Group heading rows

A row with a group name and no course code — `Finance & Control` on its own —
is skipped. You do not need to remove them.

## The instructors cell

Titles are required, because they are how several names run together in one
cell are told apart:

```
Prof. Sudhir Jaiswall (CC)      Mr. Balachandran R (VF)
```

`Prof.`, `Dr.`, `Mr.`, `Ms.` and `Mrs.` are all recognised. `(CC)` marks the
course coordinator and `(VF)` a visiting faculty member.

Names are matched against `FacultyDirectory.tsv` to find each professor's
email. Matching is deliberately conservative — a close-but-not-certain match
is left unmatched rather than risking the wrong person's address on a course.
Visiting faculty usually have no institute address at all, and coming back
unmatched is the correct outcome for them.

The build prints every internal professor it could not match. That list is
worth reading: it is usually a spelling difference between this sheet and the
directory.

## A caution

This builder currently has **no failure path**. If the columns move it will
write a file with the wrong things in the wrong fields and say nothing. Check
the counts it prints at the end.
