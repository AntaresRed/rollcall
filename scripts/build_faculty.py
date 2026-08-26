#!/usr/bin/env python3
"""
Build data/faculty.json from the institute's course-instructor list and
faculty directory.

    python3 scripts/build_faculty.py \
        data/CourseProfOutline.tsv data/FacultyDirectory.tsv data/faculty.json

Matching is name-based and deliberately conservative: the course-instructor
sheet and the directory spell names differently often enough (typos,
abbreviated middle names, alternate surname spellings) that an exact string
match would miss real matches, but a loose one risks attaching the wrong
person's email to a course. So this scores candidates and only accepts a
match above a threshold; anything else is left unmatched with a name and no
email, which is also the expected, correct outcome for visiting faculty who
have no institute address at all.
"""

import csv
import json
import re
import sys

TITLE_RE = re.compile(r"\b(?:Prof|Dr|Mr|Ms|Mrs)\.\s*", re.I)
ROLE_RE = re.compile(r"\((CC|VF)\)", re.I)

# Finds each title-prefixed name span in a cell that may list several
# instructors run together with irregular whitespace, e.g.
#   "Prof. Sudhir Jaiswall (CC)      Mr. Balachandran R (VF) "
INSTRUCTOR_SPAN_RE = re.compile(
    r"(?:Prof|Dr|Mr|Ms|Mrs)\.\s*([A-Za-z][A-Za-z.\'\-\s]*?)"
    r"(?:\s*\((CC|VF)\))?"
    r"(?=\s*(?:Prof|Dr|Mr|Ms|Mrs)\.|\s*$)",
    re.I,
)

STOP_WORDS = {"cc", "vf"}


def norm(s: str) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()


def clean_course_name(name: str) -> str:
    """Strip the qualifiers CourseProfOutline adds that the term-grid
    catalogue doesn't carry, so name-matching isn't thrown off by them."""
    name = norm(name)
    name = re.sub(r"\(.*?\)", "", name)  # parenthetical asides
    name = re.sub(
        r"\b(Pre[- ]?Mid Term|Post[- ]?Mid Term|New Course|Credit Change|"
        r"Rename|\d(?:st|nd|rd|th) Offering|\d+ Sections?)\b",
        "", name, flags=re.I,
    )
    return norm(name)


def parse_instructors(cell: str):
    """'Prof. X (CC)  Prof. Prof. Y' -> [{'name': 'X', 'role': 'CC'}, ...]

    The double "Prof. Prof." typo seen in the source sheet collapses to one
    title before matching, rather than being parsed as an empty instructor.
    """
    cell = re.sub(r"(?:Prof|Dr|Mr|Ms|Mrs)\.\s*(?=(?:Prof|Dr|Mr|Ms|Mrs)\.)", "", norm(cell), flags=re.I)
    out = []
    for m in INSTRUCTOR_SPAN_RE.finditer(cell):
        name = norm(m.group(1))
        name = re.sub(r"\s*\((CC|VF)\)\s*$", "", name, flags=re.I)
        if not name or name.lower() in STOP_WORDS:
            continue
        out.append({"name": name, "role": (m.group(2) or "").upper() or None})
    return out


def name_tokens(name: str):
    return [t for t in re.sub(r"[^A-Za-z\s]", " ", name.lower()).split() if t]


def bigrams(s: str):
    return {s[i:i + 2] for i in range(len(s) - 1)}


def token_similarity(a: str, b: str) -> float:
    """Dice coefficient over character bigrams — tolerant of the specific
    kind of drift seen here: Jaiswall/Jaiswal, Chakraborty/Chakrabarty."""
    A, B = bigrams(a), bigrams(b)
    if not A or not B:
        return 1.0 if a == b else 0.0
    overlap = len(A & B)
    return 2 * overlap / (len(A) + len(B))


def match_instructor(name: str, directory: list):
    """Score every directory entry against the given name; accept only a
    confident match.

    Surname similarity is a hard gate before any match is considered at
    all — everything else is secondary. This was added after an earlier
    version let single-letter initials ('D', 'C', 'R') prefix-match against
    *any* surname starting with that letter, which confidently matched
    "D P Ghosh" to "Parthapratim Pal" and "R Rangarajan Iyengar" to "Rahul
    Roy" — both false positives on real people's names, and both were
    actually external visiting faculty who should have come back as no
    match at all. An initial is not evidence of identity; a surname is.
    """
    given = name_tokens(name)
    if not given:
        return None, 0.0
    surname_a = given[0] if len(given) == 1 else given[-1]

    best, best_score, best_is_alias = None, 0.0, True
    for person in directory:
        cand = name_tokens(person["name"])
        if not cand:
            continue
        surname_b = cand[0] if len(cand) == 1 else cand[-1]

        strong_surname = surname_a == surname_b or (
            len(surname_a) >= 3 and len(surname_b) >= 3
            and token_similarity(surname_a, surname_b) >= 0.78
        )
        if not strong_surname:
            continue  # no amount of first-name similarity overrides this

        surname_sim = 1.0 if surname_a == surname_b else token_similarity(surname_a, surname_b)

        first_a, first_b = given[0], cand[0]
        # A short-token prefix boost is only trustworthy here because the
        # surname gate above has already confirmed identity — this is what
        # correctly resolves "Ramya T" against the directory's "Ramya
        # Tarakad" without reopening the door to unrelated-initial matches.
        first_sim = (
            1.0 if first_a == first_b
            or first_a.startswith(first_b) or first_b.startswith(first_a)
            else token_similarity(first_a, first_b)
        )

        score = 0.7 * surname_sim + 0.3 * first_sim
        is_alias = person.get("is_alias", False)

        # On a tie, prefer the person's plain directory entry over a
        # role-title alias ("Manish Thakur (Dean NIER)" vs the same person's
        # ordinary "Manish Thakur" row) — two entries can otherwise score
        # identically once the parenthetical is stripped for comparison.
        better = score > best_score or (score == best_score and best_is_alias and not is_alias)
        if better:
            best, best_score, best_is_alias = person, score, is_alias

    return (best, best_score) if best_score >= 0.85 else (None, best_score)


def parse_outline(path):
    with open(path, encoding="utf-8", newline="") as fh:
        rows = list(csv.reader(fh, delimiter="\t"))

    header_idx = next(i for i, r in enumerate(rows) if r and r[0].strip() == "Sl. No.")
    courses = []
    for row in rows[header_idx + 1:]:
        cells = [norm(c) for c in row]
        if len(cells) < 6 or not cells[1] or not cells[2]:
            continue  # a group heading row ("Finance & Control") or blank
        courses.append({
            "official_code": cells[1],
            "raw_name": cells[2],
            "name": clean_course_name(cells[2]),
            "credit": cells[4],
            "instructors": parse_instructors(cells[5]),
        })
    return courses


def parse_directory(path):
    with open(path, encoding="utf-8", newline="") as fh:
        rows = list(csv.reader(fh, delimiter="\t"))
    out = []
    for row in rows[1:]:
        cells = [norm(c) for c in row]
        if len(cells) < 5 or not cells[0]:
            continue
        raw = cells[0]
        name = re.sub(r"\(.*?\)", "", raw).strip()  # "(Dean Academic)" etc
        out.append({
            "name": name,
            "room": cells[1],
            "email": cells[4],
            # A row like "Manish Thakur (Dean NIER)" and that same person's
            # ordinary "Manish Thakur" row become identical once the
            # parenthetical is stripped — this flag lets the matcher prefer
            # the plain entry on a tie instead of picking whichever row
            # happened to come first in the file.
            "is_alias": raw != name,
        })
    return out


def build(outline_path, directory_path):
    courses = parse_outline(outline_path)
    directory = parse_directory(directory_path)

    unmatched_internal = []  # a name with no directory hit and no VF tag —
                              # worth a human glancing at, unlike VF misses.
    matched_count = 0

    for course in courses:
        for instr in course["instructors"]:
            person, score = match_instructor(instr["name"], directory)
            if person:
                instr["email"] = person["email"]
                instr["directory_name"] = person["name"]
                instr["match_confidence"] = round(score, 2)
                matched_count += 1
            else:
                instr["email"] = None
                instr["directory_name"] = None
                instr["match_confidence"] = round(score, 2)
                if instr["role"] != "VF":
                    unmatched_internal.append((course["official_code"], instr["name"], round(score, 2)))

    total_instr = sum(len(c["instructors"]) for c in courses)
    return courses, matched_count, total_instr, unmatched_internal


if __name__ == "__main__":
    outline_path = sys.argv[1] if len(sys.argv) > 1 else "data/CourseProfOutline.tsv"
    directory_path = sys.argv[2] if len(sys.argv) > 2 else "data/FacultyDirectory.tsv"
    dest = sys.argv[3] if len(sys.argv) > 3 else "data/faculty.json"

    courses, matched, total, unmatched_internal = build(outline_path, directory_path)

    with open(dest, "w", encoding="utf-8") as fh:
        json.dump(courses, fh, indent=2, ensure_ascii=False)

    print(f"{len(courses)} courses, {total} instructor listings, "
          f"{matched} matched to a directory email -> {dest}")

    if unmatched_internal:
        print(f"\n{len(unmatched_internal)} instructor(s) NOT tagged as visiting "
              f"faculty but no confident directory match — check these by hand:")
        for code, name, score in unmatched_internal:
            print(f"   {code:<12} {name!r:<32} best score {score}")
    else:
        print("\nevery non-visiting-faculty instructor matched confidently")
