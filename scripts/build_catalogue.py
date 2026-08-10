#!/usr/bin/env python3
"""
Turn the official IIM Calcutta Term V class schedule (CSV export of the
published grid) into a canonical course catalogue for RollCall.

    python3 scripts/build_catalogue.py Term_5_Schedule.csv src/data/catalogue.json

Output shape:

{
  "term": "TERM-V: AY 2026-2027",
  "slots": ["08:30", ...],
  "courses": [
    {
      "code": "LSCM",
      "name": "Logistics and Supply Chain Management",
      "phase": "full",
      "sections": {
        "A": [ {"day": 1, "start": "10:15", "end": "11:30"}, ... ],
        "B": [ ... ]
      }
    }
  ]
}

Once this exists, a student's timetable is just a list of (code, section)
pairs — no image, no OCR, no model call.
"""

import csv
import json
import os
import re
import sys
from collections import defaultdict

DAY_NAMES = {1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun"}

DAYS = {
    "MONDAY": 1, "TUESDAY": 2, "WEDNESDAY": 3, "THURSDAY": 4,
    "FRIDAY": 5, "SATURDAY": 6, "SUNDAY": 7,
}

SLOT_END = {
    "08:30": "09:45", "10:15": "11:30", "12:00": "13:15",
    "14:30": "15:45", "16:15": "17:30", "18:00": "19:15",
}

# Entries look like:  Some Course Name(CODE)-A
#                     Another Course (Pre-Mid Term)(ABC)-PRE-B
ENTRY = re.compile(r"^(?P<name>.*?)\((?P<code>[A-Z0-9&]{2,8})\)-(?P<section>(?:PRE|POST)-)?(?P<letter>[A-Z])$")

PHASE_IN_NAME = re.compile(r"\(\s*(pre|post)[-\s]?mid\s*term\s*\)", re.I)


def demojibake(s: str) -> str:
    """The published export is double-encoded UTF-8; en-dashes arrive as 'â€“'.

    latin-1 is tried first because it round-trips the whole 0x80-0x9F range;
    cp1252 leaves gaps there and would refuse the very bytes we need.
    """
    for codec in ("latin-1", "cp1252"):
        try:
            return s.encode(codec, errors="strict").decode("utf-8", errors="strict")
        except (UnicodeEncodeError, UnicodeDecodeError):
            continue
    return s


def clean(cell: str) -> str:
    return demojibake(cell).replace("\n", " ").replace("\r", " ").strip()


def parse_cell(cell: str):
    """-> (code, name, phase, section) or None"""
    text = clean(cell)
    if not text:
        return None

    m = ENTRY.match(text)
    if not m:
        return None

    name = m.group("name").strip()
    code = m.group("code")
    letter = m.group("letter")

    phase = "full"
    found = PHASE_IN_NAME.search(name)
    if found:
        phase = "pre_mid" if found.group(1).lower() == "pre" else "post_mid"
        name = PHASE_IN_NAME.sub("", name)
    elif m.group("section"):
        phase = "pre_mid" if m.group("section").startswith("PRE") else "post_mid"

    name = re.sub(r"\s{2,}", " ", name).strip(" -–—")
    return code, name, phase, letter


def build(csv_path: str):
    with open(csv_path, newline="", encoding="utf-8") as fh:
        rows = list(csv.reader(fh))

    # Locate the header row that carries the slot times.
    header_idx = next(
        i for i, r in enumerate(rows)
        if any(re.fullmatch(r"\d{2}:\d{2}", (c or "").strip()) for c in r)
    )
    slots = [(c or "").strip() for c in rows[header_idx][1:]]

    courses = {}
    sections = defaultdict(lambda: defaultdict(list))
    skipped = []
    current_day = None

    for row in rows[header_idx + 1:]:
        label = clean(row[0]).upper() if row and row[0] else ""
        if label in DAYS:
            current_day = DAYS[label]
        if current_day is None:
            continue

        for col, cell in enumerate(row[1:]):
            if col >= len(slots) or not (cell or "").strip():
                continue
            parsed = parse_cell(cell)
            if not parsed:
                skipped.append(clean(cell))
                continue

            code, name, phase, letter = parsed
            start = slots[col]
            meeting = {
                "day": current_day,
                "start": start,
                "end": SLOT_END.get(start, start),
            }

            existing = courses.get(code)
            if existing:
                # Prefer the longest spelling seen — some cells truncate.
                if len(name) > len(existing["name"]):
                    existing["name"] = name
            else:
                courses[code] = {"code": code, "name": name, "phase": phase}

            if meeting not in sections[code][letter]:
                sections[code][letter].append(meeting)

    out = {
        "term": "TERM-V: AY 2026-2027",
        "slots": slots,
        "courses": sorted(
            (
                {
                    **courses[code],
                    "sections": {
                        letter: sorted(ms, key=lambda m: (m["day"], m["start"]))
                        for letter, ms in sorted(sections[code].items())
                    },
                }
                for code in courses
            ),
            key=lambda c: c["name"].lower(),
        ),
    }
    return out, skipped


def apply_overrides(catalogue, overrides_path):
    """Reapply published-grid amendments. Fails loudly on a stale entry."""
    try:
        with open(overrides_path, encoding="utf-8") as fh:
            spec = json.load(fh)
    except FileNotFoundError:
        return []

    by_code = {c["code"]: c for c in catalogue["courses"]}
    applied = []

    for ov in spec.get("overrides", []):
        op = ov["op"]
        code, letter = ov["code"], ov["section"]
        course = by_code.get(code)
        if not course:
            raise SystemExit(f"override refers to unknown course {code}")
        meetings = course["sections"].get(letter)
        if meetings is None:
            raise SystemExit(f"override refers to unknown section {code}-{letter}")

        def find(target, required=True):
            for m in meetings:
                if m["day"] == target["day"] and m["start"] == target["start"]:
                    return m
            if not required:
                return None
            raise SystemExit(
                f"override for {code}-{letter} expects a meeting on day "
                f"{target['day']} at {target['start']}, which no longer exists. "
                "The published grid may have changed — recheck it."
            )

        # Overrides are declarative, so applying them twice must be a no-op:
        # the build runs both from a fresh CSV and over an already-built
        # catalogue, and neither should blow up.
        if op == "move":
            dest_slot = {"day": ov["to"].get("day", ov["from"]["day"]), "start": ov["to"]["start"]}
            if find(ov["from"], required=False) is None and find(dest_slot, required=False):
                applied.append(f"{code}-{letter}: {ov.get('note', op)} (already applied)")
                continue
            m = find(ov["from"])
            m["day"] = dest_slot["day"]
            m["start"] = dest_slot["start"]
            m["end"] = SLOT_END.get(m["start"], m["start"])
        elif op == "remove":
            gone = find(ov["from"], required=False)
            if gone is None:
                applied.append(f"{code}-{letter}: {ov.get('note', op)} (already applied)")
                continue
            meetings.remove(gone)
        elif op == "add":
            start = ov["to"]["start"]
            slot = {"day": ov["to"]["day"], "start": start}
            if find(slot, required=False):
                applied.append(f"{code}-{letter}: {ov.get('note', op)} (already applied)")
                continue
            meetings.append({**slot, "end": SLOT_END.get(start, start)})
        else:
            raise SystemExit(f"unknown override op '{op}'")

        meetings.sort(key=lambda m: (m["day"], m["start"]))
        applied.append(f"{code}-{letter}: {ov.get('note', op)}")

    return applied


def clashes_for(catalogue, codes):
    """Which other courses now share a slot with the ones we just amended.

    Catalogue-wide clash detection is meaningless — dozens of courses run in
    parallel every slot and a student picks five. What matters after an
    amendment is the delta: who a moved course collides with now.
    """
    wanted = set(codes)
    slots = defaultdict(list)
    for c in catalogue["courses"]:
        for letter, meetings in c["sections"].items():
            for m in meetings:
                slots[(m["day"], m["start"])].append((c["code"], letter, c["phase"]))

    out = []
    for (day, start), entries in sorted(slots.items()):
        mine = [e for e in entries if e[0] in wanted]
        if not mine:
            continue
        for a in mine:
            for b in entries:
                if b[0] == a[0]:
                    continue
                if {a[2], b[2]} == {"pre_mid", "post_mid"}:
                    continue  # these never actually overlap
                out.append((day, start, f"{a[0]}-{a[1]}", f"{b[0]}-{b[1]}", b[2]))
    return out


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "Term_5_Schedule.csv"
    dest = sys.argv[2] if len(sys.argv) > 2 else "src/data/catalogue.json"
    overrides = sys.argv[3] if len(sys.argv) > 3 else "data/overrides.json"

    if os.path.exists(src):
        catalogue, skipped = build(src)
        source_note = f"built from {src}"
    elif os.path.exists(dest):
        # Reapplying an amendment doesn't need the CSV — the last build is
        # already canonical, and overrides are declarative.
        with open(dest, encoding="utf-8") as fh:
            catalogue = json.load(fh)
        skipped = []
        source_note = f"reapplied over existing {dest}"
    else:
        raise SystemExit(f"neither {src} nor {dest} exists — nothing to build from")

    applied = apply_overrides(catalogue, overrides)

    with open(dest, "w", encoding="utf-8") as fh:
        json.dump(catalogue, fh, indent=2, ensure_ascii=False)

    total_meetings = sum(
        len(ms) for c in catalogue["courses"] for ms in c["sections"].values()
    )
    print(f"{len(catalogue['courses'])} courses, {total_meetings} meetings "
          f"-> {dest} ({source_note})")

    if applied:
        print(f"\n{len(applied)} override(s) applied:")
        for a in applied:
            print("  ", a)

    if applied:
        touched = {ov["code"] for ov in json.load(open(overrides, encoding="utf-8"))["overrides"]}
        clashes = clashes_for(catalogue, touched)
        if clashes:
            print(f"\nAmended courses now share a slot with:")
            for day, start, a, b, phase in clashes:
                tail = "" if phase == "full" else f"  ({phase.replace('_', '-')})"
                print(f"   {DAY_NAMES[day]} {start}  {a} vs {b}{tail}")

    if skipped:
        print(f"\n{len(skipped)} cell(s) not recognised as a course entry:")
        for s in dict.fromkeys(skipped):
            print("  ", s)
