/**
 * OLT's record laid beside the student's own, session by session, for the
 * Attendance breakdown.
 *
 * Nothing here mixes the two. Each row says what OLT printed and what the
 * student marked for the same meeting, and the numbers on either side stay
 * their own source's — the point is to see where they disagree, which a
 * blended figure would hide.
 */

/**
 * A course's name for matching. The same rule as `courseKey` in the Edge
 * Function's parse.ts — the code in brackets goes, "&" reads as "and", and
 * case and punctuation stop mattering — kept in step by a test rather than
 * imported, so the app bundle doesn't reach into the function's folder.
 * OLT's names arrive here already decoded, so entities aren't handled.
 */
export function courseKey(s) {
  return String(s ?? "")
    .replace(/\(\s*[A-Za-z]+-\d+[^)]*\)\s*$/, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * One course's line in OLT's term table, with its dates. Null when OLT has no
 * course by that name — or has two, since guessing between them would show
 * another section's record as this student's.
 */
export function oltCourse(snap, subject) {
  const columns = snap?.columns ?? [];
  const col = (re) => columns.findIndex((c) => re.test(c));
  const titleCol = Math.max(0, col(/course|subject/i));
  const pctCol = col(/%|percent/i);
  const attendedCol = col(/^attended$/i);
  const totalCol = col(/total/i);

  const key = courseKey(subject);
  if (!key) return null;
  const hits = (snap?.rows ?? []).filter((cells) => courseKey(cells[titleCol]) === key);
  if (hits.length !== 1) return null;

  const cells = hits[0];
  const at = (i) => (i >= 0 && i !== titleCol ? cells[i] ?? null : null);
  return {
    name: cells[titleCol],
    pct: at(pctCol),
    attended: at(attendedCol),
    total: at(totalCol),
    datewise: snap?.datewise?.[cells[titleCol]] ?? null,
  };
}

const minutes = (t) => {
  const m = String(t ?? "").match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

/**
 * The student's sessions and OLT's, paired by meeting.
 *
 * Paired by date first and then by the nearest start time on that date, never
 * by time alone: OLT stamps the slot the class was booked into, which isn't
 * always the time the timetable gives, and a class moved to another day is
 * recorded by OLT on the day it was actually held — the same day the app's
 * reschedule puts it. Two meetings on one date are told apart by whichever
 * start times sit closest, so an OLT entry is never paired with the wrong
 * one of them just because it came first.
 *
 * Anything left over stands alone: OLT's with no `app`, the student's with no
 * `olt`. Newest first, as the breakdown lists them.
 */
export function pairSessions(appSessions, oltSessions) {
  const byDate = new Map();
  const slot = (date) => {
    if (!byDate.has(date)) byDate.set(date, { app: [], olt: [] });
    return byDate.get(date);
  };
  for (const s of appSessions ?? []) slot(s.date).app.push(s);
  for (const s of oltSessions ?? []) slot(s.date).olt.push(s);

  const out = [];
  for (const [date, { app, olt }] of byDate) {
    const pairs = [];
    for (let i = 0; i < app.length; i++) {
      for (let j = 0; j < olt.length; j++) {
        pairs.push([Math.abs(minutes(app[i].start_time) - minutes(olt[j].time)), i, j]);
      }
    }
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);

    const appTaken = new Set();
    const oltTaken = new Set();
    for (const [, i, j] of pairs) {
      if (appTaken.has(i) || oltTaken.has(j)) continue;
      appTaken.add(i);
      oltTaken.add(j);
      out.push({ date, app: app[i], olt: olt[j] });
    }
    app.forEach((s, i) => { if (!appTaken.has(i)) out.push({ date, app: s, olt: null }); });
    olt.forEach((s, j) => { if (!oltTaken.has(j)) out.push({ date, app: null, olt: s }); });
  }

  const startOf = (r) => minutes(r.app ? r.app.start_time : r.olt.time);
  return out.sort((a, b) => b.date.localeCompare(a.date) || startOf(b) - startOf(a));
}
