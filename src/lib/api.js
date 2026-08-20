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

  const key = (r) => `${r.day_of_week}|${hhmm(r.start_time)}|${r.subject.trim()}`;

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
    course_code: r.course_code ?? null,
    section: r.section ?? null,
    room: r.room?.trim() || null,
    term_phase: r.term_phase || "full",
    confirmed: true,
  }));
  const wantedKeys = new Set(wanted.map(key));

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
  const { data } = await supabase.from("terms").select("*").eq("is_current", true).limit(1);
  return data?.[0] ?? null;
}

export function inSession(phase, date, term) {
  if (!term) return true;
  if (date < term.term_start || date > term.term_end) return false;
  if (phase === "pre_mid") return date < term.midterm_start;
  if (phase === "post_mid") return date > term.midterm_end;
  return !(date >= term.midterm_start && date <= term.midterm_end);
}

// ---------- attendance ----------

export async function loadAttendance(sinceDate) {
  let q = supabase.from("attendance").select("*");
  if (sinceDate) q = q.gte("class_date", sinceDate);
  const { data, error } = await q;
  if (error) throw error;
  // Same HH:MM normalisation as classes, so comparisons line up.
  return data.map((r) => ({ ...r, start_time: hhmm(r.start_time) }));
}

/** Identity of one attendance mark: subject + date + slot. */
export const attendanceKey = (subject, date, startTime) =>
  `${subject}|${date}|${hhmm(startTime)}`;

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