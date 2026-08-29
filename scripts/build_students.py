#!/usr/bin/env python3
"""
Build src/data/students.json — the student contact list, as the app bundles it.

    python3 scripts/build_students.py \
        data/SplitContacts62.csv src/data/students.json

Separate from build_directory.py on purpose. That one answers "how do I reach
a professor" from the institute's published office directory; this one is the
cohort's own collected contact list, and the two have different sources,
different columns and different update cycles.

The source is a spreadsheet export, which brings two failure modes worth
naming rather than silently absorbing:

  * Excel rewrites a long number as scientific notation ("9.19407E+11"),
    which destroys digits it cannot get back. A number that does not survive
    the check below is dropped rather than guessed at, and reported.
  * The registration number is repeated inside the Name column
    ("Pranjal Chakraborty 0446/62"). That is stripped for display, since the
    screen shows the registration number in its own field anyway.
"""

import csv
import json
import re
import sys

# Indian mobile numbers as collected here: exactly ten digits, first one 6-9.
# Anything else is either a country-code prefix that was never normalised or a
# number Excel has already mangled, and neither is safe to publish as fact.
PHONE_RE = re.compile(r"^[6-9]\d{9}$")


def norm(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


def clean_name(raw, reg):
    """'Pranjal Chakraborty 0446/62' -> 'Pranjal Chakraborty'"""
    name = norm(raw)
    if reg and name.endswith(reg):
        name = name[: -len(reg)].strip()
    # A trailing registration number that didn't match the reg column exactly
    # (a stray space, a different separator) still shouldn't reach the UI.
    name = re.sub(r"\s*\d{3,4}\s*/\s*\d{2}$", "", name).strip()
    return name


def clean_phone(raw):
    digits = re.sub(r"\D", "", str(raw or ""))
    # Tolerate a country code that survived the export intact.
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    return digits if PHONE_RE.match(digits) else None


def build(path):
    with open(path, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))

    out = []
    dropped_phones = []
    for row in rows:
        reg = norm(row.get("RegistrationNumber"))
        name = clean_name(row.get("Name"), reg)
        if not name and not reg:
            continue

        phone = clean_phone(row.get("Phone"))
        if phone is None and norm(row.get("Phone")):
            dropped_phones.append((name, reg, norm(row.get("Phone"))))

        out.append({"name": name, "reg": reg or None, "phone": phone})

    out.sort(key=lambda p: p["name"].lower())
    return out, dropped_phones


def report_duplicates(people, key, label):
    seen = {}
    for p in people:
        k = p.get(key)
        if not k:
            continue
        seen.setdefault(k, []).append(p["name"])
    clashes = {k: v for k, v in seen.items() if len(v) > 1}
    if clashes:
        print(f"\n{len(clashes)} duplicate {label} — both entries are kept, "
              f"but one of each pair is wrong:")
        for k, names in sorted(clashes.items()):
            print(f"   {k}  ->  {', '.join(names)}")
    return clashes


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "data/SplitContacts62.csv"
    dest = sys.argv[2] if len(sys.argv) > 2 else "src/data/students.json"

    people, dropped = build(src)
    with open(dest, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(people, fh, indent=2, ensure_ascii=False)

    with_phone = sum(1 for p in people if p["phone"])
    print(f"{len(people)} students, {with_phone} with a usable phone number -> {dest}")

    if dropped:
        print(f"\n{len(dropped)} phone number(s) unusable and left blank — these "
              f"need re-collecting from the source, not repairing here:")
        for name, reg, raw in dropped:
            print(f"   {name} ({reg}): {raw!r}")

    report_duplicates(people, "reg", "registration number(s)")
