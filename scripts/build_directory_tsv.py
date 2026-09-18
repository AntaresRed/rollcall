#!/usr/bin/env python3
"""
Build FacultyDirectory.tsv from the MBA office's faculty directory workbook.

    python3 scripts/build_directory_tsv.py \
        "../rollcall-resources/Faculty Directory 2026 -2027_Updated - Copy.xlsx" \
        ../rollcall-resources/FacultyDirectory.tsv

The workbook is the source of truth, but it is laid out for printing in the
academic diary — Director / Deans / Faculty blocks, merged header cells, the
email written without its domain, a Residence column. The TSV is the flat
shape both build_directory.py and build_faculty.py already read, so this is
the only script that has to know about the diary's layout.

Residence extensions are deliberately dropped: the app has never shown them
and nobody asked for them to be.
"""

import csv
import re
import sys

import openpyxl

DOMAIN = "@iimcal.ac.in"

# ---------------------------------------------------------------- corrections
#
# Declarative, and verified on every run: if the office reissues the workbook
# with one of these already fixed — or with the cell changed to something else
# — the build fails rather than silently reapplying a stale correction.
NAME_FIXES = [
    # (name as printed, after whitespace is collapsed; corrected; why)
    ("Avesha Arora", "Ayesha Arora", "her address is ayeshaarora@"),
    ("Sounak Tkakur", "Sounak Thakur", "his address is sounakt@"),
    ("`Samarth Gupta", "Samarth Gupta", "stray backtick"),
    ("Nimruji Prasad . J.", "Nimruji Prasad J.", "stray full stop"),
]

# A dean's row names the person the way the diary's Deans block does, which
# isn't always how their own faculty row does. Without this the two rows
# become two cards instead of one person with two offices.
DEAN_NAMES = [
    # (name in the Deans block, name on their faculty row)
    ("Rajesh Babu", "R Rajesh Babu"),
]

# Sumanta Basu's faculty row carries "Dean (Development & External
# Relations)" pasted onto the name; the Deans block gives that post to Vivek
# Rajvanshi. Confirmed a copy slip, so the title is dropped from this row.
STRAY_TITLES = [
    # (name the stray title is attached to, the title as printed)
    ("Sumanta Basu", "Dean (Development & External Relations)"),
]

# Rooms the faculty row writes as "dean's office/own office". The dean's
# office is already on the Deans row, so the faculty row keeps its own.
ROOM_FIXES = [
    # (name, room as printed, own room)
    ("Peeyush Mehta", "P-303/A-202", "A-202"),
]

# People the app listed before this workbook arrived who aren't in it. Kept on
# purpose, from the previous directory: Karnika Bains and Saibal Chattopadhyay
# are on the Sept 2026 door list; the others have no room on it. Verified —
# anyone the workbook starts listing itself fails the build, so the workbook's
# row takes over instead of being shadowed by a stale copy.
EXTRA_PEOPLE = [
    # name, room, ext, direct, email
    ("Karnika Bains", "K-207", "2022", "033-7121-2022", "karnika.bains@iimcal.ac.in"),
    ("Saibal Chattopadhyay", "A-201", "2029", "033-7121-2029", "chattopa@iimcal.ac.in"),
    # No room, and no extension: theirs have been reissued (2041 is Latasri
    # Hazarika's now, 2089 Rajashik Roy Choudhury's, 2017 Ayesha Arora's), and
    # a stale number would ring someone else's desk.
    ("Lakshmi Goyal", "—", "—", "—", "lakshmi@iimcal.ac.in"),
    ("Rahul Roy", "—", "—", "—", "rahul@iimcal.ac.in"),
    ("Subir Bhattacharya", "—", "—", "—", "subir@iimcal.ac.in"),
    ("Vipul Mathur", "—", "—", "—", "vipul@iimcal.ac.in"),
    ("R. Mukherjee", "M-410", "—", "—", "—"),
]


def norm(s):
    return re.sub(r"\s+", " ", str(s if s is not None else "")).strip()


def number(s):
    """'2080 /1200' -> '2080 / 1200'; '033-7121- 2006' -> '033-7121-2006'."""
    s = norm(s)
    s = re.sub(r"\s*/\s*", " / ", s)
    return re.sub(r"\s*-\s*", "-", s) or "—"


def split_name(cell):
    """'Peeyush Mehta, \\nDean (Faculty & Research )' ->
    ('Peeyush Mehta', 'Dean Faculty & Research')

    The title's own parentheses are flattened: build_directory.py reads the
    first parenthetical on the name as the office label."""
    cell = norm(cell)
    m = re.search(r",?\s*(Dean\s*\(.*\))\s*$", cell)
    if not m:
        return cell, None
    title = norm(re.sub(r"[()]", " ", m.group(1)))
    return norm(cell[:m.start()]), title


def build(path):
    ws = openpyxl.load_workbook(path, data_only=True)["Final"]

    fixes = {wrong: right for wrong, right, _ in NAME_FIXES}
    dean_names = dict(DEAN_NAMES)
    stray = {name: title for name, title in STRAY_TITLES}
    rooms = {name: (printed, own) for name, printed, own in ROOM_FIXES}
    used = set()

    block, out = None, []
    for row in ws.iter_rows(values_only=True):
        a = norm(row[0])
        rest = [c for c in row[1:] if norm(c)]
        if a.upper() in {"DIRECTOR", "DEANS", "FACULTY"} and not rest:
            block = a.upper()
            continue
        if block is None or not a:
            continue  # the title and header rows above the first block

        name, title = split_name(row[0])
        if name in stray and title and norm(re.sub(r"[()]", " ", stray[name])) == title:
            used.add(("stray", name))
            title = None
        if name in fixes:
            used.add(("name", name))
            name = fixes[name]
        if block == "DEANS" and name in dean_names:
            used.add(("dean", name))
            name = dean_names[name]
        if block == "FACULTY" and title:
            raise SystemExit(f"{name}: a title on a faculty row ({title}) — "
                             f"a dean's office belongs in the Deans block")

        room = norm(row[1])
        if name in rooms and block == "FACULTY":
            printed, own = rooms[name]
            if room == printed:
                used.add(("room", name))
                room = own

        email = norm(row[5]).lower()
        out.append([
            f"{name} ({title})" if title else name,
            room or "—",
            number(row[2]),
            number(row[4]),
            email + DOMAIN if email else "—",
        ])

    stale = (
        [f"NAME_FIXES: {w!r}" for w, _, _ in NAME_FIXES if ("name", w) not in used]
        + [f"DEAN_NAMES: {n!r}" for n, _ in DEAN_NAMES if ("dean", n) not in used]
        + [f"STRAY_TITLES: {n!r}" for n, _ in STRAY_TITLES if ("stray", n) not in used]
        + [f"ROOM_FIXES: {n!r}" for n, _, _ in ROOM_FIXES if ("room", n) not in used]
    )
    listed = {re.sub(r"\s*\(.*$", "", r[0]).lower() for r in out}
    stale += [f"EXTRA_PEOPLE: {p[0]!r} is in the workbook now"
              for p in EXTRA_PEOPLE if p[0].lower() in listed]
    if stale:
        raise SystemExit(
            f"{len(stale)} correction(s) no longer match the workbook. Either "
            f"it was fixed at source — delete the entry — or the cell changed "
            f"and the entry needs rechecking:\n   " + "\n   ".join(stale))

    # The Director and the deans' offices stay on top, as the diary has them.
    heads = [r for r in out if "(" in r[0] or r[4] == "director" + DOMAIN]
    faculty = sorted([r for r in out if r not in heads] + [list(p) for p in EXTRA_PEOPLE],
                     key=lambda r: r[0].lower())
    return heads + faculty


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "../rollcall-resources/Faculty Directory 2026 -2027_Updated - Copy.xlsx"
    dest = sys.argv[2] if len(sys.argv) > 2 else "../rollcall-resources/FacultyDirectory.tsv"

    rows = build(src)
    with open(dest, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh, delimiter="\t", lineterminator="\n")
        w.writerow(["Name", "Room", "Office Ext", "Office Direct", "Email ID"])
        w.writerows(rows)

    print(f"{len(rows)} rows ({len(EXTRA_PEOPLE)} kept from the previous directory) -> {dest}")
    for wrong, right, why in NAME_FIXES:
        print(f"   {wrong} -> {right}  ({why})")
