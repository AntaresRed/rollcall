/**
 * Which halves of the term a screen shows: the Pre MT and Post MT ticks on
 * the Week's Timetable and on Profile.
 *
 * The two screens remember their ticks separately, by choice: someone may
 * want the whole term's attendance on Profile while the grid shows only the
 * week they are in. A full-term course is shown whatever is ticked — it runs
 * in both halves, so neither tick is about it.
 *
 * No React here, so test/logic.mjs can reach all of it.
 */

export const HALF_LABEL = { pre_mid: "Pre MT", post_mid: "Post MT" };

const isHalf = (phase) => phase === "pre_mid" || phase === "post_mid";

/**
 * The ticks a screen opens with before the student has chosen: the half that
 * is running, so a student who never touches them sees what the grid always
 * showed.
 *
 * Deliberately not `inSession`, which also answers "is there a class today"
 * and so goes false during every exam week and vacation; the grid would blank
 * out for the whole of Puja. And the changeover is `post_mid_start`, not
 * `pre_mid_end`: between the two is a gap of up to three weeks, and going by
 * `pre_mid_end` would leave nothing ticked through all of it. The first half
 * stays until the second actually begins.
 *
 * With no term there is no way to tell which half is running, so neither is
 * ticked and half-term courses are held back — the same fail-closed rule as
 * everywhere else. The student can still tick one.
 */
export function defaultHalves(date, term) {
  if (!term) return { pre: false, post: false };
  return { pre: date < term.post_mid_start, post: date >= term.post_mid_start };
}

/** Does a row (or a course) of this phase show under these ticks? */
export function halfShown(phase, halves) {
  if (phase === "pre_mid") return Boolean(halves?.pre);
  if (phase === "post_mid") return Boolean(halves?.post);
  return true;
}

/**
 * Rows for the weekly grid. Filtered meeting by meeting, not course by course:
 * Operations Research runs all term but meets in different slots before and
 * after the mid-term, and with only Post MT ticked its pre-mid slots are not
 * this week's.
 */
export function rowsForHalves(classes, halves) {
  return (classes ?? []).filter((c) => halfShown(c.term_phase, halves));
}

/**
 * A course's half, from its saved rows. A course whose rows sit in both
 * halves, or any of whose rows is full-term, runs all term.
 */
export function courseHalf(rows) {
  const phases = new Set((rows ?? []).map((r) => r.term_phase || "full"));
  if (phases.size === 1) {
    const [only] = phases;
    if (isHalf(only)) return only;
  }
  return "full";
}

const bySubject = (classes) => {
  const map = new Map();
  for (const c of classes ?? []) {
    const list = map.get(c.subject) ?? [];
    list.push(c);
    map.set(c.subject, list);
  }
  return map;
};

/**
 * Rows for the Profile list. Filtered course by course, and every row of a
 * course that shows is kept: attendance is counted over all of a course's
 * meetings, and dropping Operations Research's pre-mid slots here would drop
 * the marks made in them from its total.
 */
export function coursesForHalves(classes, halves) {
  const keep = new Set();
  for (const [subject, rows] of bySubject(classes)) {
    if (halfShown(courseHalf(rows), halves)) keep.add(subject);
  }
  return (classes ?? []).filter((c) => keep.has(c.subject));
}

/** Whether the ticks would change anything on the grid. */
export const gridHasHalves = (classes) => (classes ?? []).some((c) => isHalf(c.term_phase));

/** Whether the ticks would change anything on Profile. */
export function profileHasHalves(classes) {
  for (const rows of bySubject(classes).values()) {
    if (isHalf(courseHalf(rows))) return true;
  }
  return false;
}

// ---------- remembered ticks ----------

const KEY = "rollcall.halves";

/**
 * What the student last ticked on this screen, or the default.
 *
 * Kept per term: a choice made in one term says nothing about the next one's
 * courses, and carrying a Post MT-only tick into the first week of a new term
 * would open the grid on the half that hasn't started.
 *
 * `storage` is there for the tests; the accessor itself can throw in a locked
 * down browser, hence the try.
 */
export function loadHalves(screen, term, date, storage) {
  const fallback = defaultHalves(date, term);
  try {
    const s = storage ?? globalThis.localStorage;
    const all = JSON.parse(s.getItem(KEY) || "null");
    const saved = all?.[screen];
    if (!saved || saved.term !== termKey(term)) return fallback;
    if (typeof saved.pre !== "boolean" || typeof saved.post !== "boolean") return fallback;
    return { pre: saved.pre, post: saved.post };
  } catch {
    return fallback;
  }
}

export function saveHalves(screen, term, halves, storage) {
  try {
    const s = storage ?? globalThis.localStorage;
    const all = JSON.parse(s.getItem(KEY) || "null") ?? {};
    all[screen] = { term: termKey(term), pre: Boolean(halves.pre), post: Boolean(halves.post) };
    s.setItem(KEY, JSON.stringify(all));
  } catch {
    /* not remembered; the ticks still work for this visit */
  }
}

// The term's id where there is one; its start date for a term built from the
// bundled catalogue; "none" when no term loaded.
const termKey = (term) => (term ? String(term.id ?? term.term_start ?? "none") : "none");
