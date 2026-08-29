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
    return out


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
