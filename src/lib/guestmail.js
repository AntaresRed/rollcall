/**
 * The guest entry mail: a visitor to a student hostel has to be reported to
 * the institute's offices ahead of time, by mail, with the Student Guest
 * Campus Entry Form and a masked copy of the guest's government ID.
 *
 * Built the way the leave mail is (leavemail.js): the app writes and
 * addresses the mail and makes the form, and the student sends it from
 * their own institute account — as a Gmail draft with both attachments in
 * it where Google allows, or the usual way, attaching them by hand.
 */

import { LEAVE_HOSTELS, longDate, clock } from "./leavemail.js";
import { readStudent, writeStudent, STUDENT_KEYS } from "./student.js";
import { mailtoHref, gmailComposeHref, gmailAppHref } from "./mailhref.js";

/** All in To, nobody in CC — the list the office gave for this form. */
export const GUEST_TO = [
  "saopgp@iimcal.ac.in",
  "aso@iimcal.ac.in",
  "securityofficer@iimcal.ac.in",
  "hasecy@email.iimcal.ac.in",
  "manager_hostel@iimcal.ac.in",
];
export const GUEST_CC = [];

/** The same hostels as the leave mail's chips, and "Other". */
export const GUEST_HOSTELS = LEAVE_HOSTELS;

/**
 * The guest's side of the form, in the order the mail lists it. Single
 * fields, as the paper form has them: several guests go in one box, names
 * and numbers separated by commas.
 */
export const GUEST_FIELDS = [
  { key: "guests", label: "Name of guest(s)" },
  { key: "address", label: "Address" },
  { key: "mobiles", label: "Mobile number of the guest(s)" },
  { key: "relationship", label: "Relationship with student" },
  { key: "visit", label: "Hostel to be visited" },
  { key: "arrival", label: "Date and expected time of arrival" },
  { key: "departure", label: "Date and expected time of departure" },
  { key: "reason", label: "Reason(s) for visit" },
];

/** The student's side, which the form asks under the declaration. Checked
 *  for, but in the mail it is the signature block rather than a list. */
export const STUDENT_FIELDS = [
  { key: "name", label: "Name of student" },
  { key: "reg", label: "MBA registration number" },
  { key: "hostel", label: "Student's hostel" },
  { key: "room", label: "Room number" },
  { key: "phone", label: "Mobile number of student" },
];

/**
 * What comes back next time: the student's details (shared with the leave
 * mail, see student.js) and the reason — the same visit, usually, from the
 * same family. The guest's own details, the dates and the ID copy do not:
 * the ID never leaves the screen it was picked on, except into the draft.
 */
export const GUEST_REMEMBERED = ["reason"];

export const BLANK_GUEST = {
  date: "", guestNames: "", guestAddress: "", guestMobiles: "", relationship: "",
  visitHostel: "", visitHostelOther: "",
  arriveDate: "", arriveTime: "", departDate: "", departTime: "",
  reason: "",
  name: "", reg: "", phone: "", hostel: "", hostelOther: "", room: "",
};

const text = (v) => String(v ?? "").trim();

const when = (date, time) => {
  const d = longDate(date);
  const t = clock(time);
  return d && t ? `${d}, ${t}` : "";
};

/** A hostel as it should be named, "Other" resolved to what was typed. */
const hostelName = (pick, other) => (pick === "Other" ? text(other) : text(pick));

/** Each answer's final text. Blank where not filled. */
export function guestValues(form) {
  const f = form ?? {};
  return {
    date: longDate(f.date),
    guests: text(f.guestNames),
    address: text(f.guestAddress),
    mobiles: text(f.guestMobiles),
    relationship: text(f.relationship),
    visit: hostelName(f.visitHostel, f.visitHostelOther),
    arrival: when(f.arriveDate, f.arriveTime),
    departure: when(f.departDate, f.departTime),
    reason: text(f.reason),
    name: text(f.name),
    reg: text(f.reg),
    hostel: hostelName(f.hostel, f.hostelOther),
    room: text(f.room),
    phone: text(f.phone),
  };
}

/** Ten digits or more in each number of a list — "98765 43210, +91 91234
 *  56789" is two good numbers; "98765" is not one. */
export function numbersLookComplete(str) {
  const parts = String(str ?? "").split(/[,;/&]|\band\b/i).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((p) => p.replace(/\D/g, "").length >= 10);
}

/**
 * What stops the mail being ready, as lines the form can show. `hasId` is
 * whether a copy of the guest's ID has been picked: the form says one is
 * attached, so a mail without it would say something untrue.
 */
export function guestProblems(form, { hasId = true } = {}) {
  const v = guestValues(form);
  const missing = [...GUEST_FIELDS, ...STUDENT_FIELDS]
    .filter((fl) => !v[fl.key])
    .map((fl) => fl.label);
  if (!hasId) missing.push("Guest ID");
  const problems = missing.length ? [`Still needed: ${missing.join(", ")}.`] : [];
  if (v.mobiles && !numbersLookComplete(v.mobiles)) {
    problems.push("A guest's mobile number looks incomplete.");
  }
  if (v.phone && v.phone.replace(/\D/g, "").length < 10) {
    problems.push("Your mobile number looks incomplete.");
  }
  if (v.arrival && v.departure) {
    const come = `${form.arriveDate}T${form.arriveTime}`;
    const go = `${form.departDate}T${form.departTime}`;
    if (go <= come) problems.push("The departure has to be after the arrival.");
  }
  return problems;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso, withYear) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!m) return "";
  const s = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ""}`;
  return withYear ? `${s} ${m[1]}` : s;
};

/** Who is hosting, and when — what the office files the request under. A
 *  visit within one day names the day once. */
export function guestSubject(form) {
  const v = guestValues(form);
  const who = v.reg ? `${v.name} (${v.reg})` : v.name;
  const a = form?.arriveDate;
  const d = form?.departDate;
  let dates = "";
  if (short(a) && short(d)) {
    dates = a === d ? short(a, true)
      : `${short(a, String(a).slice(0, 4) !== String(d).slice(0, 4))} to ${short(d, true)}`;
  }
  return ["Guest campus entry", who, dates].filter(Boolean).join(" – ");
}

/**
 * The mail itself, as plain text: the guest's details as a labelled list,
 * then the student's own, as a signature. A multi-line answer starts on the
 * line below its label, so an address's lines stay together.
 */
export function guestBody(form) {
  const v = guestValues(form);
  const lines = GUEST_FIELDS.map((fl) => {
    const value = v[fl.key];
    return value.includes("\n") ? `${fl.label}:\n${value}` : `${fl.label}: ${value}`;
  });
  const where = [v.hostel, v.room ? `Room ${v.room}` : ""].filter(Boolean).join(", ");
  return [
    "Respected Sir/Madam,",
    "",
    "I am writing to inform you regarding the campus entry of my guest(s). The "
      + "guest entry form and a masked copy of the guest's ID are attached.",
    "",
    ...lines,
    "",
    "Thanking you,",
    v.name,
    v.reg,
    where,
    v.phone,
  ].join("\n").replace(/\n+$/, "");
}

const mail = (form) => ({
  to: GUEST_TO, cc: GUEST_CC, subject: guestSubject(form), body: guestBody(form),
});
export const guestMailto = (form) => mailtoHref(mail(form));
export const guestGmailHref = (form, email) => gmailComposeHref({ ...mail(form), email });
export const guestGmailAppHref = (form) => gmailAppHref(mail(form));

/* ---------- what is remembered ---------- */

const pad = (n) => String(n).padStart(2, "0");
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The starting form. The student's details come from the shared record (or
 * the Google account's name, for a first visit); the reason from last time.
 * The visit is to the student's own hostel unless they say otherwise, and
 * the guest arrives today unless they say otherwise — both the likeliest
 * answers, and both one tap to change.
 *
 * `trip` is this session's half-written form, kept as the leave mail keeps
 * its own and only on the day it was written. The mail's date is never
 * taken back: it is the day the mail is sent.
 */
export function startingGuest(now, { student = {}, remembered = null, trip = null, accountName = "" } = {}) {
  const pick = (from, keys) => {
    const out = {};
    for (const k of keys) if (typeof from?.[k] === "string" && from[k] !== "") out[k] = from[k];
    return out;
  };
  const today = isoDay(now);
  const tripKeys = Object.keys(BLANK_GUEST)
    .filter((k) => !STUDENT_KEYS.includes(k) && !GUEST_REMEMBERED.includes(k) && k !== "date");
  const own = pick(student, STUDENT_KEYS);
  const form = {
    ...BLANK_GUEST,
    date: today,
    arriveDate: today,
    ...(accountName ? { name: accountName } : {}),
    ...own,
    ...pick(remembered, GUEST_REMEMBERED),
    ...(trip?.savedOn === today ? pick(trip, tripKeys) : {}),
  };
  if (!form.visitHostel && own.hostel) {
    form.visitHostel = own.hostel;
    form.visitHostelOther = own.hostelOther ?? "";
  }
  return form;
}

/* Storage: the student's details in the shared record, the reason in this
   form's own, and the half-written visit in sessionStorage, which the
   browser clears when the app closes. */
const WHO = "iimpresent.guest.who";
const TRIP = "iimpresent.guest.trip";

const store = (which) => {
  try {
    return which === "session" ? sessionStorage : localStorage;
  } catch {
    return null;
  }
};
const read = (which, key) => {
  try {
    return JSON.parse(store(which)?.getItem(key) || "null");
  } catch {
    return null;
  }
};
const write = (which, key, value) => {
  try {
    store(which)?.setItem(key, JSON.stringify(value));
  } catch {
    /* a private window: the form still works, it just won't be prefilled */
  }
};

export function loadGuest(now, accountName = "") {
  return startingGuest(now, {
    student: readStudent(),
    remembered: read("local", WHO),
    trip: read("session", TRIP),
    accountName,
  });
}

export function saveGuest(form, now = new Date()) {
  const kept = {};
  for (const k of GUEST_REMEMBERED) if (typeof form?.[k] === "string") kept[k] = form[k];
  const trip = { savedOn: isoDay(now) };
  for (const [k, v] of Object.entries(form ?? {})) {
    if (!STUDENT_KEYS.includes(k) && !GUEST_REMEMBERED.includes(k)) trip[k] = v;
  }
  write("local", WHO, kept);
  writeStudent(form);
  write("session", TRIP, trip);
}
