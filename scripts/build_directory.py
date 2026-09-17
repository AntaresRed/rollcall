#!/usr/bin/env python3
"""
Build src/data/directory.json — the whole institute faculty directory, as the
app bundles it.

    python3 scripts/build_directory.py \
        data/FacultyDirectory.tsv src/data/directory.json

This is deliberately separate from build_faculty.py. That script answers "who
teaches this course", and throws away everything except the email once it has
matched a name. The directory screen answers "how do I reach this person",
which needs the room and both phone numbers too — so the whole sheet is
carried through here, unmatched and unjoined.

The one piece of real work is the duplicate rows. Three people appear twice:
once under their own name and office, and once under an administrative title
with that office's room, extension and role address —

    Manish Thakur (Dean NIER)   P-303   1120 / 2120   dean_nier@iimcal.ac.in
    Manish Thakur               B-308   2120 / 1120   mt@iimcal.ac.in

Rendering those as two cards with the same name reads as a bug, and dropping
either one loses a number somebody might actually need to dial. So a person
becomes one entry holding several offices, their own first.
"""

import csv
import json
import re
import sys

# The sheet writes "not on file" as an em dash, which should not reach the UI
# as though it were a room number.
EMPTY = {"", "-", "—", "–", "n/a", "na"}


# -------------------------------------------------------------- posted rooms
#
# The blocks post a printed list of who sits in which room ("Name of faculty in
# NAB Block" / "... in ABC Block"), and it moves ahead of FacultyDirectory.tsv:
# the sheet is reissued rarely, the notice board is repainted whenever somebody
# moves. Where the two disagree about a room, the notice board wins — it is the
# thing a student walking to an office is actually standing in front of.
#
# Only the differences are recorded here, not the whole notice board. Each is
# declarative and verified on every run: when the sheet catches up, or a cell
# drifts to a third value, the build fails rather than reapplying a stale
# correction over a newer truth. Same reasoning as CORRECTIONS in build_por.py.
#
# `source` is where the room came from: the serial number on the printed list
# ("NAB 5", "ABC 63"), so a correction can be checked against the photo of it
# without re-reading every line — or "reported directly" for the handful the
# board itself has got wrong, which outrank it.

MOVES = [
    # (name, room in the sheet, room now, source)
    ("Vimal Kumar M",      "C-307", "K-102", "NAB 5"),
    ("Apoorva Bharadwaj",  "K-401", "K-503", "NAB 32"),
    ("Sudhir Jaiswal",     "C-302", "K-103", "NAB 54"),
    ("Sourav Bhattacharya", "C-308", "K-106", "NAB 55"),
    ("Tanika Chakrabarty", "A-303", "A-310", "ABC 60"),
    ("Sumanta Basu",       "A-304", "A-209", "ABC 63"),
    # The sheet carries no room at all for him; the posted list does.
    ("Uttam Kumar Sarkar", None,    "A-203", "ABC 62"),
    # ABC 68 still has him in A-309, but he has moved into the K-401 that
    # Apoorva Bharadwaj vacated (NAB 32) — the board has not caught up. A
    # first-hand report outranks it, the same way it outranks the sheet.
    ("Abhishek Goel",      "A-309", "K-401", "reported directly"),
]

# People whose room on the sheet the posted list hands to somebody else,
# without saying where they went. Their room is cleared rather than left
# pointing at an office that is now demonstrably not theirs — a student sent to
# the wrong door is worse served than one told we don't know. Everything else
# on their card (extension, direct line, email) still reaches them.
VACATED = [
    # (name, room in the sheet, who holds it now)
    ("Rahul Roy",     "K-102", "Vimal Kumar M (NAB 5)"),
    ("Lakshmi Goyal", "K-307", "Latasri Hazarika (NAB 53)"),
]

# On the posted list, not on the sheet — faculty who joined since it was last
# issued. A room and nothing else: an extension or an address invented to fill
# the card would be worse than the blank. They drop out of here the moment the
# sheet carries them, which the build checks.
ADDITIONS = [
    # (name, room, source)
    ("Samarth Gupta",          "M-109", "NAB 49"),
    ("Sabyasachi Mukhopadhyay", "M-404", "NAB 51"),
    ("Ayesha Gupta",           "M-402", "NAB 52"),
    ("Latasri Hazarika",       "K-307", "NAB 53"),
    ("Rajashik Roy Choudhury", "M-411", "NAB 56"),
    ("Ayush Gupta",            "M-409", "NAB 58"),
    ("Anurima Chakrabarty",    "K-309", "NAB 59"),
    ("Rohit Negi",             "C-304", "ABC 83"),
]


def apply_posted_rooms(people):
    """Overlay the printed block list onto the sheet, in place.

    Every entry is checked, and a mismatch raises rather than being skipped:
    the failure mode this guards against is a correction quietly reapplying
    itself over a sheet that has since been reissued with better data.
    """
    by_name = {p["name"].lower(): p for p in people}

    def own_office(name, source):
        person = by_name.get(name.lower())
        if person is None:
            raise SystemExit(
                f"{source}: {name} is not in the sheet. Either the sheet dropped "
                f"them — in which case move this entry to ADDITIONS — or the "
                f"name is spelled differently there and this one needs fixing.")
        # The own office, never an administrative one: a dean's room on the
        # posted list is their faculty office, not the dean's office.
        return person["offices"][0]

    for name, was, now, source in MOVES:
        office = own_office(name, source)
        if office["room"] == now:
            raise SystemExit(
                f"{source}: the sheet already puts {name} in {now}. Drop this "
                f"entry from MOVES.")
        if office["room"] != was:
            raise SystemExit(
                f"{source}: expected {name} in {was} on the sheet, found "
                f"{office['room']}. Recheck against the posted list before "
                f"reapplying this move.")
        office["room"] = now

    for name, was, holder in VACATED:
        office = own_office(name, was)
        if office["room"] != was:
            raise SystemExit(
                f"{name}: expected {was} on the sheet, found {office['room']}. "
                f"The sheet has moved since {holder} took that room — recheck "
                f"and drop or update this entry.")
        office["room"] = None

    for name, room, source in ADDITIONS:
        if name.lower() in by_name:
            raise SystemExit(
                f"{source}: the sheet now carries {name} itself. Drop this entry "
                f"from ADDITIONS so their real extension and address are used.")
        people.append({
            "name": name,
            "title": None,
            "offices": [{"label": None, "room": room, "ext": None,
                         "direct": None, "email": None}],
        })

    people.sort(key=lambda p: p["name"].lower())
    return people


def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


def value(s):
    v = norm(s)
    return None if v.lower() in EMPTY else v


def split_title(raw):
    """'Manish Thakur (Dean NIER)' -> ('Manish Thakur', 'Dean NIER')"""
    m = re.search(r"\(([^)]*)\)", raw)
    return norm(re.sub(r"\(.*?\)", "", raw)), (norm(m.group(1)) if m else None)


def build(path):
    with open(path, encoding="utf-8", newline="") as fh:
        rows = list(csv.reader(fh, delimiter="\t"))

    people = {}
    order = []
    for row in rows[1:]:
        cells = [norm(c) for c in row]
        if len(cells) < 5 or not cells[0]:
            continue
        name, title = split_title(cells[0])
        if not name:
            continue

        office = {
            "label": title,
            "room": value(cells[1]),
            "ext": value(cells[2]),
            "direct": value(cells[3]),
            "email": value(cells[4]),
        }

        key = name.lower()
        if key not in people:
            people[key] = {"name": name, "title": None, "offices": []}
            order.append(key)
        people[key]["offices"].append(office)

    out = []
    for key in order:
        person = people[key]
        # Own office first, administrative ones after — the sheet lists the
        # deans at the top under their titles, which is the opposite order
        # from the one that reads well on a person's card.
        person["offices"].sort(key=lambda o: o["label"] is not None)
        person["title"] = next((o["label"] for o in person["offices"] if o["label"]), None)
        out.append(person)

    out.sort(key=lambda p: p["name"].lower())
    return apply_posted_rooms(out)


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "data/FacultyDirectory.tsv"
    dest = sys.argv[2] if len(sys.argv) > 2 else "src/data/directory.json"

    people = build(src)
    with open(dest, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(people, fh, indent=2, ensure_ascii=False)

    offices = sum(len(p["offices"]) for p in people)
    merged = [p["name"] for p in people if len(p["offices"]) > 1]
    print(f"{len(people)} people, {offices} office listings -> {dest}")
    if merged:
        print("merged duplicate rows for: " + ", ".join(merged))
