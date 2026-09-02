import bundled from "../data/catalogue.json";

/**
 * Which schedule the app is running on, and the lookups derived from it.
 *
 * The catalogue used to be nothing but a build-time import: correcting the
 * institute's schedule meant rebuilding and redeploying the whole app. It can
 * now also arrive from the database, published by an admin, which is why this
 * module exists — something has to own "the current one" and rebuild the
 * lookups when it changes.
 *
 * The bundled copy stays as the fallback rather than being removed. A student
 * whose network drops on the catalogue fetch, or a deployment where nothing
 * has been published yet, gets exactly the behaviour they had before.
 */

let active = bundled;
let fromDatabase = false;

// Rebuilt, not recomputed per call: these are read on every render of Today
// and Profile, and the catalogue changes at most once a term.
let instructorsByCode = new Map();
let venueByCode = new Map();

function reindex() {
  instructorsByCode = new Map(
    (active.courses ?? []).map((c) => [c.code, c.instructors ?? []]),
  );
  venueByCode = new Map(
    (active.courses ?? []).map((c) => [c.code, c.venue || null]),
  );
}
reindex();

export const activeCatalogue = () => active;
export const usingBundledCatalogue = () => !fromDatabase;

/**
 * Which graduating year this schedule is for.
 *
 * Null for a catalogue built before cohorts existed, which the caller should
 * read as "cannot tell" rather than "mine" — serving a first year the second
 * years' electives is worse than serving them nothing.
 */
export const catalogueCohort = () => active.cohort_year ?? null;

/**
 * How courses are chosen on this schedule.
 *
 * "electives" means the student picks courses and their sections; "sections"
 * means they pick one section and the whole timetable follows, which is how
 * the first-year core curriculum works. Absent means electives, because every
 * catalogue built before first years existed is one.
 */
export const catalogueKind = () => active.kind ?? "electives";

/**
 * Swap in a published schedule. Called once during boot, before the first
 * screen renders — these lookups are plain module state, so nothing would
 * re-render if it were swapped later.
 *
 * Anything falsy puts the bundled copy back, which is what a failed fetch
 * should do.
 */
export function setActiveCatalogue(next) {
  active = next && Array.isArray(next.courses) && next.courses.length ? next : bundled;
  fromDatabase = active !== bundled;
  reindex();
  return active;
}

/**
 * Who teaches a course — and, given a section, who teaches *that* section.
 *
 * On the first-year grid a course is taught by three professors to six
 * sections, so listing all three tells a student almost nothing. Entries carry
 * the sections they cover, and naming one narrows to it.
 *
 * Entries with no sections apply to everybody: that is every elective, and
 * also the first-year courses whose teaching splits by session range rather
 * than by section. Those still list all names, because that is the truth.
 */
export function instructorsFor(code, section = null) {
  const all = instructorsByCode.get(code) ?? [];
  if (!section) return all;
  const mine = all.filter(
    (i) => !i.sections?.length || i.sections.includes(section),
  );
  // A section nobody claims is a data fault, not a reason to show an empty
  // line — fall back to the whole list rather than pretending it has no staff.
  return mine.length ? mine : all;
}

/**
 * Where a course meets. On the first-year grid the room follows the section
 * rather than the course, so it lives on each meeting and the course-level
 * venue is empty; naming a section finds it.
 */
export function venueForCode(code, section = null) {
  const course = (active.courses ?? []).find((c) => c.code === code);
  if (!course) return null;
  if (section) {
    const meeting = (course.sections?.[section] ?? []).find((m) => m.room);
    if (meeting) return meeting.room;
  }
  return venueByCode.get(code) ?? null;
}

/**
 * Class rows for one section of a schedule, exactly as the picker would save
 * them — same fields, same phase and room resolution.
 *
 * Nothing here is written. The ids are `preview-` prefixed and exist in no
 * table, which is what lets the admin walk another cohort's app without a
 * single row of theirs being touched. Pass no section on an elective
 * schedule, where every section is shown.
 */
export function classesFromCatalogue(payload, section = null) {
  const out = [];
  for (const c of payload?.courses ?? []) {
    const letters = section ? [section] : Object.keys(c.sections ?? {});
    for (const letter of letters) {
      (c.sections?.[letter] ?? []).forEach((m, i) => {
        out.push({
          id: `preview-${c.code}-${letter}-${i}`,
          subject: c.name,
          course_code: c.code,
          section: letter,
          day_of_week: m.day,
          session_date: m.date ?? null,
          start_time: m.start,
          end_time: m.end,
          room: m.room ?? c.venue ?? null,
          term_phase: m.phase ?? c.phase ?? "full",
          credits: c.credits,
          total_classes: c.total_classes,
          min_pct: c.min_pct,
          muted: false,
          confirmed: true,
        });
      });
    }
  }
  return out;
}

/** The term a catalogue describes, in the shape the screens expect. */
export function termFromCatalogue(payload) {
  const cal = payload?.calendar;
  if (!cal) return null;
  return {
    label: payload.term,
    term_start: cal.term_start,
    pre_mid_end: cal.pre_mid_end,
    post_mid_start: cal.post_mid_start,
    term_end: cal.term_end,
    breaks: (cal.breaks ?? []).map((b) => ({
      label: b.label, from_date: b.from, to_date: b.to,
    })),
  };
}

/** Section letters a schedule offers, in order. */
export function sectionsOf(payload) {
  const found = new Set();
  for (const c of payload?.courses ?? []) {
    for (const letter of Object.keys(c.sections ?? {})) found.add(letter);
  }
  return [...found].sort();
}

// ---------- validation ----------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

const CALENDAR_DATES = ["term_start", "pre_mid_end", "post_mid_start", "term_end"];

/**
 * Is this file safe to publish?
 *
 * Deliberately strict. Publishing rewrites the term dates and every student's
 * saved class rows, so a malformed upload is not something to discover
 * afterwards — and the failure would be silent, because a course with no
 * meetings simply stops appearing rather than raising anything.
 *
 * Returns every problem found rather than the first, so one upload-and-look
 * round trip is enough to fix the file.
 */
export function validateCatalogue(input) {
  const errors = [];
  const add = (msg) => { if (errors.length < 25) errors.push(msg); };

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["That isn't a catalogue file — expected a JSON object."], summary: null };
  }

  const courses = input.courses;
  if (!Array.isArray(courses) || courses.length === 0) {
    add("No courses. Expected a `courses` array with at least one entry.");
  }

  const cal = input.calendar;
  if (!cal || typeof cal !== "object") {
    add("No `calendar` block — the term dates come from there.");
  } else {
    for (const key of CALENDAR_DATES) {
      if (!DATE.test(String(cal[key] ?? ""))) add(`calendar.${key} is missing or not YYYY-MM-DD.`);
    }
    if (CALENDAR_DATES.every((k) => DATE.test(String(cal[k] ?? "")))) {
      if (!(cal.term_start <= cal.pre_mid_end)) add("calendar: term_start is after pre_mid_end.");
      if (!(cal.pre_mid_end < cal.post_mid_start)) add("calendar: the two teaching windows overlap.");
      if (!(cal.post_mid_start <= cal.term_end)) add("calendar: post_mid_start is after term_end.");
    }
    for (const [i, b] of (cal.breaks ?? []).entries()) {
      if (!DATE.test(String(b?.from ?? "")) || !DATE.test(String(b?.to ?? ""))) {
        add(`calendar.breaks[${i}] has no usable from/to dates.`);
      } else if (b.from > b.to) {
        add(`calendar.breaks[${i}] ("${b.label ?? "unnamed"}") ends before it starts.`);
      }
    }
  }

  if (typeof input.term !== "string" || !input.term.trim()) {
    add("No `term` label — that's what identifies the term being published.");
  }

  let meetings = 0;
  const seenCodes = new Set();

  for (const [i, c] of (Array.isArray(courses) ? courses : []).entries()) {
    const where = c?.code ? `course ${c.code}` : `courses[${i}]`;
    if (!c || typeof c !== "object") { add(`${where} is not an object.`); continue; }
    if (!c.code || typeof c.code !== "string") { add(`${where} has no code.`); continue; }
    // A duplicate code is silent damage: the lookups are Maps, so the second
    // entry quietly wins and one course's venue and instructors vanish.
    if (seenCodes.has(c.code)) add(`Duplicate course code "${c.code}".`);
    seenCodes.add(c.code);

    if (!c.name || typeof c.name !== "string") add(`${where} has no name.`);

    const sections = c.sections;
    if (!sections || typeof sections !== "object" || !Object.keys(sections).length) {
      add(`${where} has no sections, so nobody could pick it.`);
      continue;
    }
    for (const [letter, list] of Object.entries(sections)) {
      if (!Array.isArray(list) || list.length === 0) {
        add(`${where} section ${letter} has no meetings.`);
        continue;
      }
      for (const m of list) {
        meetings += 1;
        if (!Number.isInteger(m?.day) || m.day < 1 || m.day > 7) {
          add(`${where} section ${letter}: a meeting has no weekday (1–7).`);
        }
        if (!TIME.test(String(m?.start ?? ""))) {
          add(`${where} section ${letter}: a meeting has no HH:MM start time.`);
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    summary: {
      term: typeof input.term === "string" ? input.term : null,
      courses: Array.isArray(courses) ? courses.length : 0,
      meetings,
      termStart: cal?.term_start ?? null,
      termEnd: cal?.term_end ?? null,
      breaks: Array.isArray(cal?.breaks) ? cal.breaks.length : 0,
    },
  };
}

// ---------- diff ----------

/** Everything about a course that a student's saved row copies. */
const shapeOf = (c) => ({
  name: c.name ?? "",
  phase: c.phase ?? "full",
  credits: Number(c.credits ?? 3),
  total_classes: Number(c.total_classes ?? 20),
  min_pct: Number(c.min_pct ?? 75),
  venue: c.venue || null,
});

/** The meeting pattern, as a comparable string. */
const meetingsOf = (c) =>
  Object.entries(c.sections ?? {})
    .flatMap(([letter, list]) =>
      (list ?? []).map((m) => `${letter}|${m.day}|${m.start}|${m.end ?? ""}|${m.phase ?? ""}|${m.date ?? ""}`))
    .sort()
    .join(",");

/**
 * What publishing this file would actually change.
 *
 * `meetingsMoved` is called out separately because it is the one difference
 * publishing cannot repair on its own: saved rows are matched on day and
 * start time, so a course whose meetings moved leaves its students holding
 * rows that match nothing. They keep working, but at the old time, until the
 * student re-picks the course. Worth knowing before pressing the button, not
 * after.
 */
export function diffCatalogues(current, next) {
  const a = new Map((current?.courses ?? []).map((c) => [c.code, c]));
  const b = new Map((next?.courses ?? []).map((c) => [c.code, c]));

  const added = [...b.keys()].filter((k) => !a.has(k)).sort();
  const removed = [...a.keys()].filter((k) => !b.has(k)).sort();

  const changed = [];
  const meetingsMoved = [];
  for (const [code, before] of a) {
    const after = b.get(code);
    if (!after) continue;

    const was = shapeOf(before);
    const now = shapeOf(after);
    const fields = Object.keys(was).filter((f) => was[f] !== now[f]);

    const meetingsDiffer = meetingsOf(before) !== meetingsOf(after);
    if (meetingsDiffer) meetingsMoved.push(code);
    if (fields.length) changed.push({ code, name: now.name || was.name, fields });
  }

  changed.sort((x, y) => x.code.localeCompare(y.code));
  meetingsMoved.sort();

  const calChanged = CALENDAR_DATES.filter(
    (k) => (current?.calendar?.[k] ?? null) !== (next?.calendar?.[k] ?? null),
  );

  return { added, removed, changed, meetingsMoved, calendarChanged: calChanged };
}
