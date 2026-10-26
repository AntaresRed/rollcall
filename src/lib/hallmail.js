/**
 * The guest house booking mail: a student asking the offices to approve a
 * stay for a relative at the MDC or Tata Hall guest house, with the guest's
 * photo ID attached.
 *
 * Built like the other two mails (leavemail.js, guestmail.js) — written and
 * addressed here, sent from the student's own Gmail — but with no form of its
 * own: the mail is the request. Its wording is the one the student body
 * uses, kept word for word, bold and italics included; so the Gmail draft is
 * a formatted mail (hallHtml), with the plain text (hallBody) beside it for
 * the copy button and the mail apps that can't take formatting.
 */

import { readStudent, writeStudent, STUDENT_KEYS } from "./student.js";
import { mailtoHref, gmailComposeHref, gmailAppHref } from "./mailhref.js";

export const HALL_TO = ["admin_mdp@iimcal.ac.in", "saopgp@iimcal.ac.in"];
export const HALL_CC = [];

/** The two guest houses, as the subject and the request name them. */
export const HALLS = ["MDC", "Tata Hall"];

/** What the form asks, as the "still needed" list names it. */
export const HALL_FIELDS = [
  { key: "hall", label: "Guest house" },
  { key: "guestName", label: "Name of guest" },
  { key: "relation", label: "Relation to the guest" },
  { key: "checkIn", label: "Check in date" },
  { key: "checkOut", label: "Check out date" },
  { key: "name", label: "Name of student" },
  { key: "reg", label: "Roll number" },
  { key: "phone", label: "Contact number" },
];

/** The student's details ride along whole, shown or not: the shared record
 *  is saved from every form, and a hostel this form doesn't ask about must
 *  not come back blank in the others. */
export const BLANK_HALL = {
  hall: "", guestName: "", relation: "", checkIn: "", checkOut: "",
  name: "", reg: "", phone: "", hostel: "", hostelOther: "", room: "",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "27 October 2026" — a date the office can't misread either way. */
export function hallDate(iso) {
  const m = ISO.exec(String(iso ?? ""));
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Nights from check-in to check-out: "1 night", "3 nights". Blank until
 *  both dates are in and the second is later. UTC, so a clock change can't
 *  make a night 23 hours long. */
export function hallNights(checkIn, checkOut) {
  const a = ISO.exec(String(checkIn ?? ""));
  const b = ISO.exec(String(checkOut ?? ""));
  if (!a || !b) return "";
  const n = Math.round((Date.UTC(b[1], b[2] - 1, b[3]) - Date.UTC(a[1], a[2] - 1, a[3])) / 86_400_000);
  if (n < 1) return "";
  return n === 1 ? "1 night" : `${n} nights`;
}

const text = (v) => String(v ?? "").trim();

/** Each answer's final text. Blank where not filled. */
export function hallValues(form) {
  const f = form ?? {};
  return {
    hall: HALLS.includes(f.hall) ? f.hall : "",
    guestName: text(f.guestName),
    relation: text(f.relation),
    checkIn: hallDate(f.checkIn),
    checkOut: hallDate(f.checkOut),
    nights: hallNights(f.checkIn, f.checkOut),
    name: text(f.name),
    reg: text(f.reg),
    phone: text(f.phone),
  };
}

/**
 * What stops the mail being ready, as lines the form can show. `hasId` is
 * whether a photo ID has been picked: the mail says one is attached.
 */
export function hallProblems(form, { hasId = true } = {}) {
  const v = hallValues(form);
  const missing = HALL_FIELDS.filter((fl) => !v[fl.key]).map((fl) => fl.label);
  if (!hasId) missing.push("Guest ID");
  const problems = missing.length ? [`Still needed: ${missing.join(", ")}.`] : [];
  if (v.checkIn && v.checkOut && !v.nights) {
    problems.push("The check-out has to be after the check-in.");
  }
  if (v.phone && v.phone.replace(/\D/g, "").length < 10) {
    problems.push("Your contact number looks incomplete.");
  }
  return problems;
}

export const hallSubject = (form) =>
  `Request for ${hallValues(form).hall} Guest House Booking Approval`;

/**
 * The request, line by line, each with how it is set: "italic", "bold"
 * (the label up to its colon), or plain. hallBody and hallHtml are both
 * read off this, so the plain and formatted mails can't say different
 * things.
 */
function hallLines(form) {
  const v = hallValues(form);
  return [
    ["", "Dear Offices,"],
    ["", ""],
    ["", `I am ${v.name} (${v.reg}), writing to request permission for booking the ${v.hall} `
      + `Guest House for my relative from ${v.checkIn} to ${v.checkOut}. I have attached the `
      + "photo ID for your verification and validation."],
    ["", ""],
    ["italic", "Booking summary"],
    ["", "The guest details-->"],
    ["bold", "Name of guest", v.guestName],
    ["bold", "Relation to the guest", v.relation],
    ["", ""],
    ["", "Booking details-->"],
    ["bold", "Stay being booked", v.nights],
    ["bold", "Check in date", v.checkIn],
    ["bold", "Check out date", v.checkOut],
    ["", ""],
    ["", "I would be grateful if you could kindly approve the booking request."],
    ["", ""],
    ["", "Best Regards,"],
    ["", v.name],
    ["", v.reg],
    ["", v.phone],
  ];
}

/** The plain mail: the same words, without the formatting marks. */
export function hallBody(form) {
  return hallLines(form)
    .map(([style, a, b]) => (style === "bold" ? `${a}: ${b}` : a))
    .join("\n");
}

const escape = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The formatted mail: labels in bold, the summary heading in italics, one
 *  line per line — a blank line is a break, as in the plain text. */
export function hallHtml(form) {
  const lines = hallLines(form).map(([style, a, b]) => {
    if (style === "italic") return `<i>${escape(a)}</i>`;
    if (style === "bold") return `<b>${escape(a)}</b>: ${escape(b)}`;
    return escape(a);
  });
  return `<div dir="ltr">${lines.join("<br>\n")}</div>`;
}

const mail = (form) => ({
  to: HALL_TO, cc: HALL_CC, subject: hallSubject(form), body: hallBody(form),
});
export const hallMailto = (form) => mailtoHref(mail(form));
export const hallGmailHref = (form, email) => gmailComposeHref({ ...mail(form), email });
export const hallGmailAppHref = (form) => gmailAppHref(mail(form));

/* ---------- what is remembered ---------- */

const pad = (n) => String(n).padStart(2, "0");
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The starting form: the student's details from the shared record (or the
 * Google account's name, for a first visit), and nothing else — the guest,
 * the hall and the dates differ every time. A half-written booking comes
 * back on the day it was written, as the other mails' do.
 */
export function startingHall(now, { student = {}, trip = null, accountName = "" } = {}) {
  const pick = (from, keys) => {
    const out = {};
    for (const k of keys) if (typeof from?.[k] === "string" && from[k] !== "") out[k] = from[k];
    return out;
  };
  const tripKeys = Object.keys(BLANK_HALL).filter((k) => !STUDENT_KEYS.includes(k));
  return {
    ...BLANK_HALL,
    ...(accountName ? { name: accountName } : {}),
    ...pick(student, STUDENT_KEYS),
    ...(trip?.savedOn === isoDay(now) ? pick(trip, tripKeys) : {}),
  };
}

const TRIP = "iimpresent.hall.trip";

const session = () => {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
};

export function loadHall(now, accountName = "") {
  let trip = null;
  try {
    trip = JSON.parse(session()?.getItem(TRIP) || "null");
  } catch {
    trip = null;
  }
  return startingHall(now, { student: readStudent(), trip, accountName });
}

export function saveHall(form, now = new Date()) {
  const trip = { savedOn: isoDay(now) };
  for (const [k, v] of Object.entries(form ?? {})) if (!STUDENT_KEYS.includes(k)) trip[k] = v;
  writeStudent(form);
  try {
    session()?.setItem(TRIP, JSON.stringify(trip));
  } catch {
    /* a private window: the form still works, it just won't come back */
  }
}
