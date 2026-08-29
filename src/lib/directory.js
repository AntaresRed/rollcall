import directory from "../data/directory.json";
import { instructorsFor } from "./api";

/**
 * The institute faculty directory.
 *
 * Kept out of api.js, and so out of the eager bundle, because it is a
 * reference dataset for one lazily-loaded screen — every student pays for
 * anything api.js imports on first paint, and nobody opens the directory on
 * first paint.
 */

const lower = (s) => String(s ?? "").toLowerCase();
/** "K-208" and "033-7121-2080" search as "k208" and "03371212080", so a
 *  student typing a room or a number without its punctuation still finds it. */
const squash = (s) => lower(s).replace(/[^a-z0-9]/g, "");

// Searching rebuilds nothing: each person's haystack is derived once at module
// load, because the directory is a static asset and the search box fires on
// every keystroke.
const DIRECTORY = directory.map((person) => {
  const text = [
    person.name,
    person.title,
    ...person.offices.flatMap((o) => [o.label, o.room, o.ext, o.direct, o.email]),
  ]
    .filter(Boolean)
    .join(" ");
  return { ...person, _text: lower(text), _squashed: squash(text) };
});

export const facultyCount = DIRECTORY.length;

/**
 * Which of the student's own courses each person teaches, keyed by the
 * institute email.
 *
 * Email is the join, not the name: the course sheet and the directory spell
 * the same person's name differently often enough that name matching needs
 * the fuzzy scoring in scripts/build_faculty.py, and that has already been
 * done — an email in the catalogue *came from* a confident directory match,
 * so matching on it here is exact by construction.
 */
function coursesByEmail(classes) {
  const map = new Map();
  const seen = new Set();
  for (const c of classes) {
    if (!c.course_code || seen.has(c.subject)) continue;
    seen.add(c.subject);
    for (const i of instructorsFor(c.course_code)) {
      if (!i.email) continue;   // visiting faculty, not in the directory
      const list = map.get(lower(i.email)) ?? [];
      if (!list.includes(c.subject)) list.push(c.subject);
      map.set(lower(i.email), list);
    }
  }
  return map;
}

/**
 * The whole institute directory, filtered by a free-text query and tagged
 * with the student's own courses.
 *
 * Every token in the query has to match something, so "roy k-1" narrows the
 * way a person expects rather than widening to everyone called Roy plus
 * everyone in the K block.
 */
export function facultyDirectory(classes = [], query = "", mineOnly = false) {
  const byEmail = coursesByEmail(classes);

  const tokens = lower(query).split(/\s+/).filter(Boolean);
  const rows = [];

  for (const person of DIRECTORY) {
    const courses = [
      ...new Set(person.offices.flatMap((o) => byEmail.get(lower(o.email)) ?? [])),
    ];
    if (mineOnly && !courses.length) continue;

    const hay = `${person._text} ${courses.join(" ").toLowerCase()}`;
    const flat = `${person._squashed}${squash(courses.join(" "))}`;
    // The squashed comparison is skipped for a token that squashes to nothing:
    // every string contains "", so a query of pure punctuation would otherwise
    // match every person on the directory rather than none.
    const hit = tokens.every((t) => {
      const flatToken = squash(t);
      return hay.includes(t) || (flatToken !== "" && flat.includes(flatToken));
    });
    if (!hit) continue;

    rows.push({
      name: person.name,
      title: person.title,
      offices: person.offices,
      courses,
    });
  }

  // Whoever teaches the student rises to the top of an unfiltered list; a
  // search is the student naming who they want, so it stays alphabetical.
  if (!tokens.length) {
    rows.sort((a, b) =>
      (b.courses.length > 0) - (a.courses.length > 0) || a.name.localeCompare(b.name));
  }
  return rows;
}
