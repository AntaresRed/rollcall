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

export async function loadClasses() {
  const { data, error } = await supabase
    .from("classes")
    .select("*")
    .order("day_of_week")
    .order("start_time");
  if (error) throw error;
  return data;
}

/** Replaces the whole timetable — students re-upload when their term changes. */
export async function saveTimetable(rows) {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("classes").delete().eq("user_id", user.id);

  const payload = rows.map((r) => ({
    user_id: user.id,
    day_of_week: r.day_of_week,
    start_time: r.start_time,
    end_time: r.end_time || SLOT_ENDS[r.start_time] || r.start_time,
    subject: r.subject.trim(),
    course_code: r.course_code ?? null,
    section: r.section ?? null,
    room: r.room?.trim() || null,
    term_phase: r.term_phase || "full",
    confirmed: true,
  }));

  const { data, error } = await supabase.from("classes").insert(payload).select();
  if (error) throw error;
  return data;
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
  return data;
}

export async function markAttendance(classId, date, status) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("attendance")
    .upsert(
      { user_id: user.id, class_id: classId, class_date: date, status },
      { onConflict: "class_id,class_date" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function unmarkAttendance(classId, date) {
  const { error } = await supabase
    .from("attendance")
    .delete()
    .eq("class_id", classId)
    .eq("class_date", date);
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
