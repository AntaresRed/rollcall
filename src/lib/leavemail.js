/**
 * The leave mail: leave of more than a day has to be reported by email to a
 * fixed set of offices, from the student's own institute address.
 *
 * The app writes the mail and addresses it; it never sends it. Sending from a
 * student's account would mean asking Google for permission to send mail as
 * them, which is a consent screen nobody should have to accept for a form
 * letter. So the mail opens in Gmail or the phone's mail app, already
 * written, and the student presses Send — they see exactly what goes out,
 * from which account, before it does.
 */

export const LEAVE_TO = ["saopgp@iimcal.ac.in", "aso@iimcal.ac.in"];
export const LEAVE_CC = [
  "securityofficer@iimcal.ac.in",
  "manager_hostel@iimcal.ac.in",
  "hasecy@email.iimcal.ac.in",
];

/** Chips on the form. "Other" opens a text box rather than forcing a student
 *  who lives somewhere else to pick the nearest wrong answer. */
export const LEAVE_HOSTELS = ["NH", "OH", "LVH", "WH"];

/**
 * Every field, in the order the mail lists them. `label` is what the office
 * reads, so it is spelled out in full rather than as the form's shorthand.
 * `optional` fields are left out of the mail entirely when blank — an
 * "Additional information: —" line invites a reply asking what was meant.
 */
export const LEAVE_FIELDS = [
  { key: "date", label: "Date" },
  { key: "name", label: "Name of student" },
  { key: "reg", label: "Registration number" },
  { key: "phone", label: "Contact number while on leave" },
  { key: "hostel", label: "Hostel" },
  { key: "room", label: "Room number" },
  { key: "departure", label: "Date and expected time of departure" },
  { key: "return", label: "Date and expected time of return" },
  { key: "address", label: "Address during leave" },
  { key: "reason", label: "Reason for leave" },
  { key: "info", label: "Additional information", optional: true },
];

/**
 * What survives between one leave and the next. Who you are and where you go
 * home to do not change; the dates and the reason are this trip's alone, and
 * finding last month's reason already filled in is how a wrong one gets sent.
 */
export const REMEMBERED = ["name", "reg", "phone", "hostel", "hostelOther", "room", "address"];

export const BLANK_LEAVE = {
  date: "", name: "", reg: "", phone: "", hostel: "", hostelOther: "", room: "",
  departDate: "", departTime: "", returnDate: "", returnTime: "",
  address: "", reason: "", info: "",
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * "Friday, 3 October 2026". Written out by hand rather than through
 * toLocaleDateString, whose output depends on the phone's language settings —
 * and this goes to an office, not back to the phone that wrote it.
 */
export function longDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!m) return "";
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1) return "";
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "6:30 PM" from an <input type="time"> value. */
export function clock(hhmm) {
  const m = /^(\d{2}):(\d{2})/.exec(String(hhmm ?? ""));
  if (!m) return "";
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? "AM" : "PM"}`;
}

const when = (date, time) => {
  const d = longDate(date);
  const t = clock(time);
  return d && t ? `${d}, ${t}` : "";
};

const text = (v) => String(v ?? "").trim();

/** The hostel as the mail should name it, "Other" resolved to what was typed. */
export const hostelOf = (form) =>
  (form?.hostel === "Other" ? text(form?.hostelOther) : text(form?.hostel));

/** Each field's final text, keyed as LEAVE_FIELDS. Blank where not filled. */
export function leaveValues(form) {
  const f = form ?? {};
  return {
    date: longDate(f.date),
    name: text(f.name),
    reg: text(f.reg),
    phone: text(f.phone),
    hostel: hostelOf(f),
    room: text(f.room),
    departure: when(f.departDate, f.departTime),
    return: when(f.returnDate, f.returnTime),
    address: text(f.address),
    reason: text(f.reason),
    info: text(f.info),
  };
}

/**
 * What stops the mail being ready, as labels the form can show.
 *
 * A return before the departure is refused rather than warned about: the
 * office would have to write back to ask which one is wrong, and by then the
 * student has left.
 */
export function leaveProblems(form) {
  const v = leaveValues(form);
  const missing = LEAVE_FIELDS
    .filter((fl) => !fl.optional && !v[fl.key])
    .map((fl) => fl.label);
  const problems = missing.length ? [`Still needed: ${missing.join(", ")}.`] : [];
  if (v.departure && v.return) {
    const out = `${form.departDate}T${form.departTime}`;
    const back = `${form.returnDate}T${form.returnTime}`;
    if (back <= out) problems.push("The return is before the departure.");
  }
  return problems;
}

/** "3 Oct" / "3 Oct 2026" — the subject line's short form. */
const shortDate = (iso, withYear) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  if (!m) return "";
  const s = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]?.slice(0, 3) ?? ""}`;
  return withYear ? `${s} ${m[1]}` : s;
};

/**
 * One line the office can file by: who, and for which dates. Whoever opens
 * the inbox sorts by subject, so the name and the dates are the whole point.
 */
export function leaveSubject(form) {
  const v = leaveValues(form);
  const who = v.reg ? `${v.name} (${v.reg})` : v.name;
  const sameYear = String(form?.departDate).slice(0, 4) === String(form?.returnDate).slice(0, 4);
  const from = shortDate(form?.departDate, !sameYear);
  const to = shortDate(form?.returnDate, true);
  return ["Leave application", who, from && to ? `${from} to ${to}` : ""]
    .filter(Boolean)
    .join(" – ");
}

/**
 * The mail itself, as plain text.
 *
 * A labelled list rather than prose, because the reader is checking it
 * against a register, not reading a letter. A multi-line answer — an address,
 * usually — starts on the line below its label, so the lines of the address
 * stay together instead of the first one trailing the label.
 */
export function leaveBody(form) {
  const v = leaveValues(form);
  const lines = LEAVE_FIELDS
    .filter((fl) => !fl.optional || v[fl.key])
    .map((fl) => {
      const value = v[fl.key];
      return value.includes("\n") ? `${fl.label}:\n${value}` : `${fl.label}: ${value}`;
    });
  return [
    "Respected Sir/Madam,",
    "",
    "I am writing to apply for leave from campus. My details are below.",
    "",
    ...lines,
    "",
    "Kindly grant me leave for this period.",
    "",
    "Thanking you,",
    v.name,
    v.reg,
  ].join("\n").replace(/\n+$/, "");
}

/**
 * Opens in whatever mail app the phone uses. Line breaks go as CRLF, which is
 * what RFC 6068 asks for and what the stricter clients insist on.
 */
export function leaveMailto(form) {
  const q = [
    `cc=${encodeURIComponent(LEAVE_CC.join(","))}`,
    `subject=${encodeURIComponent(leaveSubject(form))}`,
    `body=${encodeURIComponent(leaveBody(form).replace(/\n/g, "\r\n"))}`,
  ].join("&");
  return `mailto:${LEAVE_TO.join(",")}?${q}`;
}

/**
 * Gmail's compose window, in the student's institute account.
 *
 * `authuser` is what makes this worth offering over the mailto link: someone
 * signed into a personal Gmail as well lands in the right account without
 * having to notice they weren't. It only picks among accounts already signed
 * in on that browser; it cannot sign anyone in, and needs nothing from us.
 */
export function leaveGmailHref(form, email) {
  const p = new URLSearchParams();
  if (email) p.set("authuser", email);
  p.set("view", "cm");
  p.set("fs", "1");
  p.set("to", LEAVE_TO.join(","));
  p.set("cc", LEAVE_CC.join(","));
  p.set("su", leaveSubject(form));
  p.set("body", leaveBody(form));
  return `https://mail.google.com/mail/?${p.toString()}`;
}

/** Split a form into what is remembered on the device and what is not. */
export function rememberedPart(form) {
  const keep = {};
  for (const k of REMEMBERED) if (form?.[k] != null) keep[k] = form[k];
  return keep;
}

/**
 * The starting form: blank, today's date, the remembered fields, and — only
 * where nothing was remembered — the name from the Google account. A stored
 * name wins because the account name is often a nickname or in the wrong
 * order, and whoever corrected it once should not have to again.
 *
 * `trip` is this session's half-written trip, if the app was reloaded under
 * it — which on a phone is what switching to the mail app and back can do.
 * Only strings are taken from either store, so an older or half-written
 * shape cannot turn a controlled input uncontrolled.
 */
export function startingLeave(today, remembered, trip = null, accountName = "") {
  const pick = (from, keys) => {
    const out = {};
    for (const k of keys) if (typeof from?.[k] === "string" && from[k] !== "") out[k] = from[k];
    return out;
  };
  const tripKeys = Object.keys(BLANK_LEAVE).filter((k) => !REMEMBERED.includes(k));
  return {
    ...BLANK_LEAVE,
    date: today,
    ...(accountName ? { name: accountName } : {}),
    ...pick(remembered, REMEMBERED),
    ...pick(trip, tripKeys),
  };
}

/* Storage, split like the basket's: who you are in localStorage, this trip in
   sessionStorage, which the browser clears when the app closes. The accessor
   is resolved inside the try, because the global itself can throw — or not
   exist at all in the smoke test. */
const WHO = "iimpresent.leave.who";
const TRIP = "iimpresent.leave.trip";

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

export function loadLeave(today, accountName = "") {
  return startingLeave(today, read("local", WHO), read("session", TRIP), accountName);
}

export function saveLeave(form) {
  const trip = {};
  for (const [k, v] of Object.entries(form ?? {})) if (!REMEMBERED.includes(k)) trip[k] = v;
  write("local", WHO, rememberedPart(form));
  write("session", TRIP, trip);
}
