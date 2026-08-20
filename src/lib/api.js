import { supabase } from "./supabase";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_LONG = {
  1: "Monday", 2: "Tuesday", 3: "Wednesday",
  4: "Thursday", 5: "Friday", 6: "Saturday", 7: "Sunday",
};

export const SLOT_STARTS = ["08:30", "10:15", "12:00", "14:30", "16:15", "18:00"];
export const SLOT_ENDS = {
  "08:30": "09:45", "10:15": "11:30", "12:00": "13:15",
  "14:30": "15:45", "16:15": "17:30", "18:00": "19:15",
};

export const PHASE_LABEL = {
  full: null,
  pre_mid: "Pre-mid",
  post_mid: "Post-mid",
};

/** Postgres `time` comes back as "18:00:00"; every lookup key here is "18:00". */
export const hhmm = (t) => String(t ?? "").slice(0, 5);

export const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function pretty(t) {
  const h = Number(t.slice(0, 2));
  return `${((h + 11) % 12) + 1}:${t.slice(3, 5)} ${h < 12 ? "am" : "pm"}`;
}

export const isoDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** JS Sunday-first weekday -> Monday-first 1..7 */
export const weekdayOf = (d = new Date()) => ((d.getDay() + 6) % 7) + 1;

// ---------- parsing ----------

export async function parseTimetableImage(file) {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });

  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-timetable`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ image: base64, mimeType: file.type || "image/png" }),
    },
  );

  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Couldn't read the timetable.");
  return body.classes;
}

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

/** Replaces the whole timetable — students re-upload when their term changes. */
/**
 * Reconcile rather than replace. Deleting every row and reinserting would mint
 * new class ids on each save, orphaning attendance and — before the schema
 * fix — cascading it into oblivion. So: keep identical rows untouched, insert
 * what's new, delete only what the student actually dropped.
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

  if (toDelete.length) {
    const { error } = await supabase.from("classes").delete().in("id", toDelete);
    if (error) throw error;
  }
  if (toInsert.length) {
    const { error } = await supabase.from("classes").insert(toInsert);
    if (error) throw error;
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
  if (!term) return true;
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
 * Cancelled sessions are not absences, so they never eat into the budget.
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
      ...skipBudget(c),
      present: 0,
      absent: 0,
      cancelled: 0,
      muted: Boolean(c.muted),
    });
  }

  for (const a of attendance) {
    const row = bySubject.get(a.subject);
    if (!row) continue;
    if (a.status === "present") row.present += 1;
    else if (a.status === "absent") row.absent += 1;
    else if (a.status === "cancelled") row.cancelled += 1;
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
  const existing = await supabase
    .from("attendance")
    .select("*")
    .eq("subject", cls.subject)
    .eq("class_date", originalDate)
    .eq("start_time", hhmm(cls.start_time))
    .maybeSingle();

  if (existing.data) {
    if (newDate) {
      await supabase
        .from("attendance")
        .update({ class_date: newDate, start_time: start ?? hhmm(cls.start_time) })
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

/** Past sessions with no attendance mark, newest first. */
export function unmarkedSessions(classes, attendance, term, now = new Date(), lookbackDays = 28, overrides = []) {
  if (!classes.length) return [];

  const marked = new Set(
    attendance.map((a) => attendanceKey(a.subject, a.class_date, a.start_time)),
  );

  const to = isoDate(now);
  const fromDate = new Date(now.getTime() - lookbackDays * DAY_MS);
  const from = term?.term_start && term.term_start > isoDate(fromDate)
    ? term.term_start
    : isoDate(fromDate);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const today = isoDate(now);

  return expectedSessions(classes, term, { from, to }, overrides)
    .filter(({ cls, date }) => {
      // Today's classes only count once they've actually finished.
      if (date === today && toMinutes(hhmm(cls.end_time)) > nowMinutes) return false;
      return !marked.has(attendanceKey(cls.subject, date, cls.start_time));
    })
    .sort((a, b) =>
      a.date === b.date
        ? toMinutes(hhmm(a.cls.start_time)) - toMinutes(hhmm(b.cls.start_time))
        : b.date.localeCompare(a.date),
    );
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

export async function setLeadMinutes(mins) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("profiles").update({ lead_mins: mins }).eq("id", user.id);
}

export async function loadProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data;
}
