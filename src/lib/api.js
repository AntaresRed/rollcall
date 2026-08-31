import { supabase } from "./supabase";
import { instructorsFor, venueForCode } from "./catalogue";

// Instructors and venue are looked up by course_code at render time rather
// than stored on the student's saved class row — they are properties of the
// course, not of one student's enrollment, so this avoids a schema change and
// avoids the data silently going stale if the catalogue is corrected after a
// student has already picked their courses.
//
// Both now come from ./catalogue, which holds whichever schedule is live: the
// one published by an admin, or the copy compiled into the bundle when
// nothing has been published.
export { instructorsFor };

/** Where a class meets: the row's own room if it has one, else the venue the
 *  catalogue publishes for that course code. */
export const venueOf = (cls) =>
  cls?.room?.trim() || venueForCode(cls?.course_code) || null;

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LONG = {
  1: "Monday", 2: "Tuesday", 3: "Wednesday",
  4: "Thursday", 5: "Friday", 6: "Saturday", 7: "Sunday",
};

export const SLOT_STARTS = ["08:30", "10:15", "12:00", "14:30", "16:15", "18:00"];
// Each slot is 90 minutes, matching the institute's dated block courses,
// which already used these exact boundaries.
export const SLOT_ENDS = {
    "08:30": "10:00", "10:15": "11:45", "12:00": "13:30",
    "14:30": "16:00", "16:15": "17:45", "18:00": "19:30",
};

export const PHASE_LABEL = {
  full: null,
  pre_mid: "Pre-mid",
  post_mid: "Post-mid",
};

/** Postgres `time` comes back as "18:00:00"; every lookup key here is "18:00". */
export const hhmm = (t) => String(t ?? "").slice(0, 5);

/**
 * Minutes since midnight.
 *
 * Returns NaN rather than throwing when handed something that isn't a time.
 * Every comparison against NaN is false, so a bad value degrades to "not
 * now, not past" — a missing marker instead of a blank screen.
 */
export const toMinutes = (t) => {
  const s = String(t ?? "");
  if (!/^\d{2}:\d{2}/.test(s)) return NaN;
  return Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
};

export function pretty(t) {
  const s = String(t ?? "");
  if (!/^\d{2}:\d{2}/.test(s)) return "--:--";
  const h = Number(s.slice(0, 2));
  return `${((h + 11) % 12) + 1}:${s.slice(3, 5)} ${h < 12 ? "am" : "pm"}`;
}

export const isoDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** JS Sunday-first weekday -> Monday-first 1..7 */
export const weekdayOf = (d = new Date()) => ((d.getDay() + 6) % 7) + 1;

// ---------- classes ----------

const normaliseRow = (r) => ({
  ...r,
  start_time: hhmm(r.start_time),
  end_time: hhmm(r.end_time),
});

export async function loadClasses() {
  const { data, error } = await supabase
    .from("classes")
    .select("*")
    .order("day_of_week")
    .order("start_time");
  if (error) throw error;
  return data.map(normaliseRow);
}

// Fields on a saved class row that the catalogue owns, and may correct after a
// student has already picked the course. Deliberately excludes `muted` and
// `confirmed`, which belong to the student, and the three fields that make up
// the reconcile key below, which cannot drift by definition.
const CATALOGUE_FIELDS = [
  "day_of_week", "end_time", "course_code", "section",
  "room", "term_phase", "credits", "total_classes", "min_pct",
];

const NUMERIC_FIELDS = new Set(["day_of_week", "credits", "total_classes", "min_pct"]);

/** Compare like with like: Postgres hands back "13:30:00" for a time and may
 *  hand back a numeric as either a number or a string, and "" and null both
 *  mean "nothing here". Without this every save would look like a drift. */
const normField = (field, v) => {
  if (field === "end_time") return hhmm(v);
  if (NUMERIC_FIELDS.has(field)) return v === null || v === undefined || v === "" ? null : Number(v);
  const s = typeof v === "string" ? v.trim() : v;
  return s === "" || s === undefined ? null : s;
};

/**
 * Which catalogue-owned fields on an existing row no longer agree with the
 * catalogue — the patch needed to bring it back in line, or {} if it's fine.
 *
 * This exists because the institute corrects the published schedule after
 * students have already picked their courses. Before it, saveTimetable only
 * ever inserted and deleted, so a row that survived a re-save kept whatever
 * the catalogue said on the day it was first created — for ever. A course
 * later corrected to post-mid kept `term_phase: 'full'`, and the alert sweep,
 * which reads that column and nothing else, fired its notifications from the
 * first week of term. Re-picking the course didn't help: the row matched on
 * day, time and subject, so it was left alone every time.
 */
export function catalogueDrift(existing, wanted) {
  const patch = {};
  for (const f of CATALOGUE_FIELDS) {
    if (normField(f, existing?.[f]) !== normField(f, wanted?.[f])) patch[f] = wanted[f];
  }
  return patch;
}

/**
 * Reconcile rather than replace. Deleting every row and reinserting would mint
 * new class ids on each save, orphaning attendance and — before the schema
 * fix — cascading it into oblivion. So: keep the row and its id, patch it back
 * into line with the catalogue if it has drifted, insert what's new, delete
 * only what the student actually dropped.
 */
export async function saveTimetable(rows) {
  const { data: { user } } = await supabase.auth.getUser();

  // Dated sessions repeat the same weekday and slot on different dates, so the
  // date has to be part of the identity or five ODS Thursdays collapse to one.
  const key = (r) =>
    `${r.session_date ?? `w${r.day_of_week}`}|${hhmm(r.start_time)}|${r.subject.trim()}`;

  const { data: current, error: readErr } = await supabase
    .from("classes").select("*").eq("user_id", user.id);
  if (readErr) throw readErr;

  const currentByKey = new Map((current ?? []).map((r) => [key(r), r]));
  const wanted = rows.map((r) => ({
    user_id: user.id,
    day_of_week: r.day_of_week,
    start_time: hhmm(r.start_time),
    end_time: hhmm(r.end_time) || SLOT_ENDS[hhmm(r.start_time)] || hhmm(r.start_time),
    subject: r.subject.trim(),
    session_date: r.session_date ?? null,
    course_code: r.course_code ?? null,
    section: r.section ?? null,
    room: r.room?.trim() || null,
    term_phase: r.term_phase || "full",
    credits: r.credits ?? 3.0,
    total_classes: r.total_classes ?? 20,
    min_pct: r.min_pct ?? 75,
    muted: r.muted ?? false,
    confirmed: true,
  }));
  const wantedKeys = new Set(wanted.map(key));

  // A row that already exists keeps its id — and its mute setting.
  const toInsert = wanted.filter((r) => !currentByKey.has(key(r)));
  const toDelete = (current ?? []).filter((r) => !wantedKeys.has(key(r))).map((r) => r.id);

  // ...but not its stale catalogue data. Patching in place rather than
  // deleting and reinserting is what keeps the id, and so keeps the
  // attendance already marked against it.
  const toUpdate = [];
  for (const r of wanted) {
    const existing = currentByKey.get(key(r));
    if (!existing) continue;
    const patch = catalogueDrift(existing, r);
    if (Object.keys(patch).length) toUpdate.push({ id: existing.id, patch });
  }

  if (toDelete.length) {
    const { error } = await supabase.from("classes").delete().in("id", toDelete);
    if (error) throw error;
  }
  if (toInsert.length) {
    const { error } = await supabase.from("classes").insert(toInsert);
    if (error) throw error;
  }
  if (toUpdate.length) {
    const results = await Promise.all(
      toUpdate.map(({ id, patch }) => supabase.from("classes").update(patch).eq("id", id)),
    );
    const failed = results.find((r) => r.error);
    if (failed) throw failed.error;
  }

  return loadClasses();
}

export async function clearTimetable() {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("classes").delete().eq("user_id", user.id);
}

// ---------- term ----------

export async function loadTerm() {
  // Breaks come back embedded rather than as a second round trip — the term
  // is on the critical path for first paint.
  const { data } = await supabase
    .from("terms")
    .select("*, term_breaks(*)")
    .eq("is_current", true)
    .limit(1);

  const term = data?.[0] ?? null;
  if (!term) return null;

  const breaks = [...(term.term_breaks ?? [])].sort(
    (a, b) => a.from_date.localeCompare(b.from_date),
  );
  return { ...term, breaks };
}

/** Exam weeks, placement season, Puja vacation — nobody has class. */
export function breakOn(date, term) {
  return (term?.breaks ?? []).find((b) => date >= b.from_date && date <= b.to_date) ?? null;
}

/**
 * Is a course of this phase actually meeting on this date?
 *
 * The term has two teaching windows with a gap between them, and several
 * institute-wide breaks inside those windows. A course meets only when the
 * date clears all of it.
 */
export function inSession(phase, date, term) {
  // Same fail-closed rule as the alert sweep, and for a related reason: with
  // no term loaded there is no way to place a half-term course, and calling it
  // "in session" doesn't just mis-draw the grid — Catch up would ask the
  // student to mark attendance for meetings that never happened, and marking
  // them writes rows. A full-term course still shows, so a failed term fetch
  // degrades to a slightly over-full timetable rather than an empty one.
  if (!term) return phase !== "pre_mid" && phase !== "post_mid";
  if (date < term.term_start || date > term.term_end) return false;
  if (breakOn(date, term)) return false;

  const inPre = date <= term.pre_mid_end;
  const inPost = date >= term.post_mid_start;
  if (phase === "pre_mid") return inPre;
  if (phase === "post_mid") return inPost;
  return inPre || inPost;   // full-term: everything except the gap between
}

// ---------- attendance ----------

export async function loadAttendance(sinceDate) {
  let q = supabase.from("attendance").select("*").order("class_date", { ascending: false });
  if (sinceDate) q = q.gte("class_date", sinceDate);
  const { data, error } = await q;
  if (error) throw error;
  // Same HH:MM normalisation as classes, so comparisons line up.
  return data.map((r) => ({ ...r, start_time: hhmm(r.start_time) }));
}

/** Identity of one attendance mark: subject + date + slot. */
export const attendanceKey = (subject, date, startTime) =>
  `${subject}|${date}|${hhmm(startTime)}`;

/**
 * How many classes a student may miss and still clear the bar.
 *
 *   3 credits  -> 20 classes at 75% -> attend 15, may miss 5
 *   1.5 credits-> 10 classes at 80% -> attend  8, may miss 2
 *
 * Only what the student marked counts: a session with no mark is outside the
 * percentage entirely, neither attended nor missed.
 */
export function skipBudget({ total_classes = 20, min_pct = 75 } = {}) {
  const total = Number(total_classes) || 0;
  const mustAttend = Math.ceil((total * Number(min_pct)) / 100);
  return { total, mustAttend, allowedAbsences: Math.max(0, total - mustAttend) };
}

/** Per-course rollup used by both the Attendance screen and the Today header. */
export function courseStats(classes, attendance) {
  const bySubject = new Map();

  for (const c of classes) {
    if (bySubject.has(c.subject)) continue;
    bySubject.set(c.subject, {
      subject: c.subject,
      course_code: c.course_code,
      credits: Number(c.credits ?? 3),
      // Undefined (not looked up, e.g. no course_code at all) is kept
      // distinct from an empty array (looked up, genuinely no instructor on
      // file) — the Profile screen falls back to the credit line only in
      // the first case, not the second.
      instructors: c.course_code ? instructorsFor(c.course_code) : undefined,
      venue: venueOf(c),
      ...skipBudget(c),
      present: 0,
      absent: 0,
      muted: Boolean(c.muted),
    });
  }

  for (const a of attendance) {
    const row = bySubject.get(a.subject);
    if (!row) continue;
    if (a.status === "present") row.present += 1;
    else if (a.status === "absent") row.absent += 1;
  }

  return [...bySubject.values()]
    .map((r) => {
      const marked = r.present + r.absent;
      return {
        ...r,
        marked,
        skipsLeft: r.allowedAbsences - r.absent,
        // Percentage of what's been marked so far, not of the whole term.
        pct: marked ? Math.round((r.present / marked) * 100) : null,
      };
    })
    .sort((a, b) => a.skipsLeft - b.skipsLeft);
}

// ---------- mute ----------

/** Mute every meeting of a course at once — students think in courses. */
export async function setCourseMuted(subject, muted) {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("classes")
    .update({ muted })
    .eq("user_id", user.id)
    .eq("subject", subject);
  if (error) throw error;
}

// ---------- rescheduling ----------

export async function loadOverrides() {
  const { data, error } = await supabase
    .from("session_overrides")
    .select("*")
    .order("original_date");
  if (error) throw error;
  return data.map((r) => ({
    ...r,
    new_start: r.new_start ? hhmm(r.new_start) : null,
    new_end: r.new_end ? hhmm(r.new_end) : null,
  }));
}

/**
 * Where a meeting sits *before* the change being made now — which is not
 * necessarily where the timetable published it.
 *
 * A session moved once already had its attendance row carried to the new slot
 * by rescheduleSession. Looking for that row back at `originalDate` therefore
 * found nothing on a second move, and the mark was left stranded on a date the
 * class no longer runs. The same miss made "Cancelled" do nothing at all to a
 * class that had been moved first.
 *
 * `originalDate` stays the identity of the exception either way; this is only
 * about locating the attendance row that goes with it.
 */
export function currentSlotOf(cls, originalDate, prior) {
  return {
    date: prior?.new_date ?? originalDate,
    start: prior?.new_start ? hhmm(prior.new_start) : hhmm(cls?.start_time),
  };
}

/**
 * Move one occurrence of a class to a different date and/or time.
 *
 * `newDate === null` cancels the session outright. Any attendance already
 * marked against the old slot moves with it, because it's the same class
 * meeting — just held elsewhere in the week.
 */
export async function rescheduleSession(cls, originalDate, { newDate, newStart, newEnd, note } = {}) {
  const { data: { user } } = await supabase.auth.getUser();

  const start = newStart ? hhmm(newStart) : null;
  const end = newEnd ? hhmm(newEnd) : (start ? SLOT_ENDS[start] ?? start : null);

  const { data: prior } = await supabase
    .from("session_overrides")
    .select("new_date, new_start")
    .eq("class_id", cls.id)
    .eq("original_date", originalDate)
    .maybeSingle();

  const { date: currentDate, start: currentStart } = currentSlotOf(cls, originalDate, prior);

  const { error } = await supabase.from("session_overrides").upsert(
    {
      user_id: user.id,
      class_id: cls.id,
      original_date: originalDate,
      new_date: newDate ?? null,
      new_start: start,
      new_end: end,
      note: note ?? null,
    },
    { onConflict: "user_id,class_id,original_date" },
  );
  if (error) throw error;

  // Carry any existing mark across to where the class actually happened.
  //
  // One case is still beyond reach: a session moved and then cancelled loses
  // the record of where it went (the override's new_date is overwritten with
  // null), so giving it a date afterwards cannot find the mark. Recovering
  // that needs somewhere to remember the previous slot, which is a schema
  // change rather than a fix here.
  const existing = await supabase
    .from("attendance")
    .select("*")
    .eq("subject", cls.subject)
    .eq("class_date", currentDate)
    .eq("start_time", currentStart)
    .maybeSingle();

  if (existing.data) {
    if (newDate) {
      await supabase
        .from("attendance")
        .update({ class_date: newDate, start_time: start ?? currentStart })
        .eq("id", existing.data.id);
    } else {
      // Cancelled: keep the record but stop it counting against the budget.
      await supabase
        .from("attendance")
        .update({ status: "cancelled" })
        .eq("id", existing.data.id);
    }
  }
}

/** Put a moved or cancelled session back where the timetable says it belongs. */
export async function clearOverride(classId, originalDate) {
  const { error } = await supabase
    .from("session_overrides")
    .delete()
    .eq("class_id", classId)
    .eq("original_date", originalDate);
  if (error) throw error;
}

// ---------- catch-up ----------

const DAY_MS = 86_400_000;

/**
 * Every session that should have happened between two dates, so the app can
 * work out which ones were never marked. Generated from the weekly pattern
 * rather than stored, because storing one row per meeting per term would mean
 * a migration every time a student changes a course.
 */
export function expectedSessions(classes, term, { from, to }, overrides = []) {
  // Two indexes: what's been moved *away* from a date, and what's been moved
  // *into* one. A moved session must vanish from its original slot and appear
  // at its new one, so both directions are needed.
  const movedFrom = new Map();
  const movedInto = new Map();
  for (const o of overrides) {
    movedFrom.set(`${o.class_id}|${o.original_date}`, o);
    if (o.new_date) {
      const list = movedInto.get(o.new_date) ?? [];
      list.push(o);
      movedInto.set(o.new_date, list);
    }
  }
  const byId = new Map(classes.map((c) => [c.id, c]));

  const out = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);

  for (let t = start.getTime(); t <= end.getTime(); t += DAY_MS) {
    const d = new Date(t);
    const iso = isoDate(d);
    const weekday = weekdayOf(d);

    for (const c of classes) {
      const scheduled = c.session_date
        // Fixed-date course: one specific day. The published dates already
        // work around exam weeks and vacations, so no phase check.
        ? c.session_date === iso
        : c.day_of_week === weekday && inSession(c.term_phase, iso, term);
      if (!scheduled) continue;
      if (movedFrom.has(`${c.id}|${iso}`)) continue;   // moved away or cancelled
      out.push({ cls: c, date: iso, movedFrom: null });
    }

    for (const o of movedInto.get(iso) ?? []) {
      const c = byId.get(o.class_id);
      if (!c) continue;
      const startTime = o.new_start ?? hhmm(c.start_time);
      out.push({
        // The occurrence carries the effective time, so attendance keys and
        // alerts line up with when the class is actually held.
        cls: { ...c, start_time: startTime, end_time: o.new_end ?? SLOT_ENDS[startTime] ?? hhmm(c.end_time) },
        date: iso,
        movedFrom: o.original_date,
      });
    }
  }
  return out;
}

/** Every occurrence on a single date, reschedules applied. */
export function occurrencesOn(classes, term, date, overrides = []) {
  return expectedSessions(classes, term, { from: date, to: date }, overrides)
    .sort((a, b) => toMinutes(hhmm(a.cls.start_time)) - toMinutes(hhmm(b.cls.start_time)));
}

/**
 * A ceiling on the no-calendar window. Longer than an academic year, so it
 * never truncates a real term; short enough that a corrupt timestamp cannot
 * turn the day-by-day walk below into a loop over twenty thousand days.
 */
const MAX_UNSCOPED_DAYS = 400;

/**
 * How far back to look when no term calendar is published.
 *
 * The calendar is the normal answer, and a rolling window used to be the
 * fallback — which meant that in the one situation where the app already knows
 * least, it also quietly stopped letting anyone fix a mark after four weeks.
 *
 * The better floor is the student's own timetable: a session from before a
 * course was added is not theirs to mark. That tracks both of the things that
 * should actually end an edit window, without needing a calendar to announce
 * either — a new term re-picks courses, so the floor moves forward with it,
 * and a dropped course takes its row with it, so it generates no sessions at
 * all.
 *
 * Rows with no usable `created_at` fall back to the rolling window, since a
 * floor that cannot be read is worse than a conservative one.
 */
function timetableFloor(classes, now, fallbackDays) {
  const stamps = classes
    .map((c) => Date.parse(c.created_at))
    // A timestamp in the future is a clock disagreeing with itself, not a
    // fact about when the course was picked.
    .filter((t) => Number.isFinite(t) && t <= now.getTime());

  if (!stamps.length) {
    return isoDate(new Date(now.getTime() - fallbackDays * DAY_MS));
  }
  const earliest = Math.min(...stamps);
  const ceiling = now.getTime() - MAX_UNSCOPED_DAYS * DAY_MS;
  return isoDate(new Date(Math.max(earliest, ceiling)));
}

/**
 * Every session a student is allowed to mark, newest first, each carrying the
 * mark it already has (or null).
 *
 * The cut-off is whether the class has *begun*. A class you are sitting in is
 * markable — that is when people actually reach for the app — but one that
 * has not started yet is not: attendance for it is not a fact yet, and a
 * screen that invites you to record one is inviting a guess.
 *
 * Scope is the term calendar: everything from the first day of term up to
 * now. It used to be a rolling 28 days, which quietly made a session
 * uneditable once it aged out — no other screen can write attendance for a
 * past date, so anything older than four weeks could never be corrected.
 *
 * With no term calendar the scope comes from the timetable instead — see
 * `timetableFloor`. `fallbackDays` is the last resort under that, for rows
 * carrying no usable timestamp.
 */
export function markableSessions(classes, attendance, term, now = new Date(), fallbackDays = 28, overrides = []) {
  if (!classes.length) return [];

  const status = new Map(
    attendance.map((a) => [attendanceKey(a.subject, a.class_date, a.start_time), a.status]),
  );

  const to = isoDate(now);
  const from = term?.term_start ?? timetableFloor(classes, now, fallbackDays);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const today = isoDate(now);

  return expectedSessions(classes, term, { from, to }, overrides)
    // Nothing after today is generated at all, so only today needs the clock.
    .filter(({ cls, date }) =>
      !(date === today && toMinutes(hhmm(cls.start_time)) > nowMinutes))
    .map((o) => ({
      ...o,
      status: status.get(attendanceKey(o.cls.subject, o.date, o.cls.start_time)) ?? null,
    }))
    .sort((a, b) =>
      a.date === b.date
        ? toMinutes(hhmm(a.cls.start_time)) - toMinutes(hhmm(b.cls.start_time))
        : b.date.localeCompare(a.date),
    );
}

/**
 * Past sessions with no attendance mark, newest first — the count behind the
 * tab badge.
 *
 * Narrower than `markableSessions` on purpose: a class still running has not
 * been forgotten yet, so badging it as missed would nag about something the
 * student is in the middle of. It becomes countable once it ends.
 */
export function unmarkedSessions(classes, attendance, term, now = new Date(), fallbackDays = 28, overrides = []) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const today = isoDate(now);

  return markableSessions(classes, attendance, term, now, fallbackDays, overrides)
    .filter(({ cls, date, status }) =>
      status === null &&
      !(date === today && toMinutes(hhmm(cls.end_time)) > nowMinutes));
}

/**
 * Per-course Present / Absent / Did not mark, over the term so far.
 *
 * Derived from the sessions rather than from the attendance table, which is
 * the only direction that can answer the third bucket at all: an unmarked
 * class leaves no row behind, so "did not mark" only exists as the gap
 * between what the timetable says should have happened and what was recorded
 * against it. `courseStats` counts rows and therefore cannot see it.
 *
 * Working from the session list also settles a subtler case correctly. A mark
 * left on a session that was later moved or cancelled no longer belongs to
 * any real meeting; joining marks onto sessions drops it, where counting rows
 * would keep crediting it.
 *
 * Only finished sessions count. A class later today is not yet unmarked, and
 * showing it as a gap would have every student open the app to a red bar each
 * morning.
 *

 * Each row also carries the sessions it was counted from, newest first, so the
 * screen can show which day was which without recomputing the same walk. They
 * are the evidence for the totals rather than a second query against them —
 * the counts and the list can't disagree.
 *
 * Without a term calendar the sessions cannot be enumerated — `inSession`
 * deliberately fails closed there — so `unmarked` and `expected` come back
 * null and the caller is expected to say so rather than print a zero it
 * cannot stand behind.
 */
export function attendanceBreakdown(
  classes, attendance, term, now = new Date(), overrides = [],
) {
  const rows = new Map();
  for (const c of classes) {
    if (rows.has(c.subject)) continue;
    rows.set(c.subject, {
      subject: c.subject,
      course_code: c.course_code ?? null,
      credits: Number(c.credits ?? 3),
      present: 0,
      absent: 0,
      unmarked: 0,
      expected: 0,
      sessions: [],
    });
  }
  if (!rows.size) return [];

  const bump = (subject, status) => {
    const row = rows.get(subject);
    if (!row) return;
    if (status === "present") row.present += 1;
    else if (status === "absent") row.absent += 1;
    // Anything else — no mark, or the retired "cancelled" status on a row
    // predating its removal — reads as a gap the student can still fill.
    else row.unmarked += 1;
  };

  if (term?.term_start) {
    const status = new Map(
      attendance.map((a) => [
        attendanceKey(a.subject, a.class_date, a.start_time), a.status,
      ]),
    );
    const today = isoDate(now);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (const { cls, date, movedFrom } of expectedSessions(
      classes, term, { from: term.term_start, to: today }, overrides,
    )) {
      // Today's classes join the count only once they have actually ended,
      // matching how unmarkedSessions decides the same question.
      if (date === today && toMinutes(hhmm(cls.end_time)) > nowMinutes) continue;
      const row = rows.get(cls.subject);
      if (!row) continue;
      row.expected += 1;
      const mark = status.get(attendanceKey(cls.subject, date, cls.start_time)) ?? null;
      row.sessions.push({
        date,
        start_time: hhmm(cls.start_time),
        status: mark,
        // Kept for the same reason Edit attendance keeps it: a class pushed onto a
        // date it already meets would otherwise be indistinguishable from
        // the session that was always there.
        movedFrom: movedFrom ?? null,
      });
      bump(cls.subject, mark);
    }
  } else {
    // No calendar: the marks are still true, the gap between them is not
    // knowable. Count what was recorded and admit to the rest.
    for (const a of attendance) bump(a.subject, a.status);
    for (const row of rows.values()) {
      row.unmarked = null;
      row.expected = null;
      row.sessions = null;
    }
  }

  return [...rows.values()]
    .map((r) => {
      const marked = r.present + r.absent;
      return {
        ...r,
        marked,
        pct: marked ? Math.round((r.present / marked) * 100) : null,
        // Newest first, as on the catch-up screen: the recent gap is the one
        // still worth doing something about.
        sessions: r.sessions && [...r.sessions].sort((a, b) =>
          b.date.localeCompare(a.date) ||
          toMinutes(b.start_time) - toMinutes(a.start_time)),
      };
    })
    // Worst first, the same order Profile's budget list uses — a breakdown
    // that buries the course in trouble halfway down is a table, not a
    // warning. Courses with nothing marked yet sort last: they are unstarted,
    // not failing. Alphabetical within a tie, so the order is stable.
    .sort((a, b) =>
      (a.pct ?? 101) - (b.pct ?? 101) || a.subject.localeCompare(b.subject));
}

export async function markAttendance(cls, date, status) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("attendance")
    .upsert(
      {
        user_id: user.id,
        class_id: cls.id,
        subject: cls.subject,
        start_time: hhmm(cls.start_time),
        class_date: date,
        status,
      },
      { onConflict: "user_id,subject,class_date,start_time" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function unmarkAttendance(cls, date) {
  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("subject", cls.subject)
    .eq("class_date", date)
    .eq("start_time", hhmm(cls.start_time));
  if (error) throw error;
}

export async function loadSummary() {
  const { data, error } = await supabase.from("attendance_summary").select("*");
  if (error) throw error;
  return data;
}

/** Minutes after a class starts before its attendance alert fires. */
export async function setAlertAfterMinutes(mins) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("profiles").update({ alert_after_mins: mins }).eq("id", user.id);
}

export async function loadProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data;
}


// ---------- schedule administration ----------

/**
 * The schedule the app should run on.
 *
 * Returns null when nothing has been published, which is the caller's cue to
 * stay on the bundled copy. Errors are swallowed for the same reason: a
 * student who can't reach this table should still get their timetable, not a
 * blank screen.
 */
export async function loadPublishedCatalogue() {
  const { data, error } = await supabase
    .from("catalogues")
    .select("id, payload, label, published_at")
    .eq("is_published", true)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("could not load the published schedule; using the bundled one", error.message);
    return null;
  }
  return data ?? null;
}

/** Every upload, newest first. Admin-only by policy — a student's request
 *  comes back with just the published row, or nothing. */
export async function loadCatalogues() {
  const { data, error } = await supabase
    .from("catalogues")
    .select("id, label, source_name, note, uploaded_at, published_at, is_published")
    .order("uploaded_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Store an uploaded schedule as a draft. Inert until publishCatalogue(). */
export async function uploadCatalogue(payload, { label, sourceName, note } = {}) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("catalogues")
    .insert({
      payload,
      label: label || payload?.term || "Untitled schedule",
      source_name: sourceName ?? null,
      note: note ?? null,
      uploaded_by: user?.id ?? null,
    })
    .select("id, label, uploaded_at")
    .single();
  if (error) throw error;
  return data;
}

/** The single act of going live. Everything it touches moves together. */
export async function publishCatalogue(id) {
  const { data, error } = await supabase.rpc("publish_catalogue", { p_id: id });
  if (error) throw error;
  return data;
}

export async function deleteCatalogue(id) {
  const { error } = await supabase.from("catalogues").delete().eq("id", id);
  if (error) throw error;
}

/** The full payload of one upload, for previewing it against what's live. */
export async function loadCataloguePayload(id) {
  const { data, error } = await supabase
    .from("catalogues").select("payload").eq("id", id).single();
  if (error) throw error;
  return data.payload;
}
