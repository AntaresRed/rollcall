/**
 * The leave application form, as the PDF that goes with the leave mail.
 *
 * The office's own form — the blank Student Leave Application Form in
 * public/leave/form.jpg — with the student's answers typed onto it, placed
 * where the jokaUtils printout the office already accepts puts them. The
 * form sits in the same box that printout does, stretched as it is there, so
 * every coordinate below was measured off that printout and still lands on
 * its line. The printout is kept in rollcall-resources as
 * "Leave Application Form (template).pdf".
 *
 * The form image is that printout's background with one change: the
 * "Copy to" list at the foot of the page is painted out, below the last
 * dashed rule. The student emails the form rather than routing paper copies,
 * so the list describes a distribution that doesn't happen.
 *
 * The answers are real text in Times-Roman; the PDF itself is written by
 * hand in formpdf.js, which the guest entry form shares.
 */

import { hostelOf, leavePeriod } from "./leavemail.js";
import {
  PAGE, winAnsi, timesWidth, wrapText, fitBlock, jpegInfo, writePdf, fetchBytes, drawSignature,
} from "./formpdf.js";

// Re-exported: the leave form's tests, and anything written before the
// writer was shared, import these from here.
export { PAGE, winAnsi, timesWidth, wrapText, fitBlock, jpegInfo };

/* ---------- the answers, as the form prints them ---------- */

export const isoParts = (iso) => /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));

/** "30/08/2026" — day first, the way the office writes dates. */
export function formDate(iso) {
  const m = isoParts(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** "30/08/2026 10:30" — the form has room for one short line, so 24-hour. */
export function formWhen(iso, hhmm) {
  const d = formDate(iso);
  const t = /^(\d{2}):(\d{2})/.exec(String(hhmm ?? ""));
  return d && t ? `${d} ${t[1]}:${t[2]}` : "";
}

const text = (v) => String(v ?? "").trim();

/** Every answer the form carries, keyed by where it goes. */
export function formAnswers(form) {
  const f = form ?? {};
  return {
    date: formDate(f.date),
    name: text(f.name),
    reg: text(f.reg),
    hostel: hostelOf(f),
    room: text(f.room),
    departure: formWhen(f.departDate, f.departTime),
    return: formWhen(f.returnDate, f.returnTime),
    period: leavePeriod(f.departDate, f.returnDate),
    address: text(f.address),
    phone: text(f.phone),
    reason: text(f.reason),
    // "Number and nature of enclosures, if any" is where additional info
    // goes — the one free-text box the form has for anything else.
    info: text(f.info),
  };
}

/** "Leave Application - Debjit Sarkar - 30-08-2026.pdf" */
export function formFilename(form) {
  const name = text(form?.name).replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const m = isoParts(form?.departDate);
  return ["Leave Application", name || null, m ? `${m[3]}-${m[2]}-${m[1]}` : null]
    .filter(Boolean)
    .join(" - ") + ".pdf";
}

/* ---------- where each answer goes ---------- */

/** The blank form, in the box the printout gives it (top-left origin). */
export const FORM_BOX = { x: 34.5, y: 34.5, w: 528, h: 769.5 };

/** The form's right edge, which long answers wrap against. */
const RIGHT = 525;

/**
 * Single-line answers: where the baseline starts, and how far the line may
 * run before it meets the next label. Baselines are from the top of the page.
 */
const SLOTS = {
  date: { x: 136.2, y: 225, to: 215 },
  name: { x: 254.7, y: 225, to: RIGHT },
  reg: { x: 141.6, y: 242.25, to: 230 },
  hostel: { x: 265.4, y: 242.25, to: 374 },
  room: { x: 420.5, y: 242.25, to: RIGHT },
  departure: { x: 243.9, y: 259.5, to: RIGHT },
  return: { x: 233.1, y: 276, to: RIGHT },
  period: { x: 184.7, y: 294, to: RIGHT },
  phone: { x: 233.1, y: 348, to: RIGHT },
};

/** Answers that may need more than one line, and the room each has before
 *  the next label. The enclosures box shares its rows with the signature,
 *  so it stops short of it and wraps back under its own label. */
const BLOCKS = {
  address: { x: [163.1], y: 312.75, to: [RIGHT], lead: 10.5, lines: 2 },
  reason: { x: [227.7], y: 366.75, to: [RIGHT], lead: 11, lines: 3 },
  info: { x: [256, 104], y: 402.5, to: [385, 385], lead: 10.5, lines: 4 },
};

/** The signature: centred over the dashes under it, baseline as printed. */
export const SIGNATURE = { cx: 456, y: 410.25, size: 15, maxW: 118 };

/**
 * Every run of text the page carries, as { x, y, size, str } with y from
 * the top. Separate from the drawing so the layout can be tested without a
 * PDF in sight.
 */
export function formLayout(form) {
  const a = formAnswers(form);
  const runs = [];
  for (const [key, s] of Object.entries(SLOTS)) {
    if (!a[key]) continue;
    // One line: shrink rather than run into the next label.
    let size = 9;
    while (size > 6 && timesWidth(a[key], size) > s.to - s.x) size -= 0.5;
    runs.push({ x: s.x, y: s.y, size, str: a[key] });
  }
  for (const [key, b] of Object.entries(BLOCKS)) {
    if (!a[key]) continue;
    const widths = b.to.map((to, i) => to - b.x[Math.min(i, b.x.length - 1)]);
    const { size, lines } = fitBlock(a[key], widths, b.lines);
    lines.forEach((str, i) => {
      runs.push({ x: b.x[Math.min(i, b.x.length - 1)], y: b.y + i * b.lead, size, str });
    });
  }
  return runs;
}

/* ---------- the PDF itself ---------- */

/**
 * Assemble the file: the blank form in its box, the signature over its
 * dashes if there is one, and the answers on top. `signature` is
 * { jpeg, x, y, w, h } in points from the top-left.
 */
export function buildPdf({ form, signature = null, runs, title = "" }) {
  if (!jpegInfo(form)) throw new Error("The form image isn't a JPEG");
  return writePdf({
    images: [{ jpeg: form, ...FORM_BOX }, ...(signature ? [signature] : [])],
    runs,
    title,
  });
}

/* ---------- in the browser ---------- */

const FORM_URL = "/leave/form.jpg";

/** The finished form as a File, ready to save or share. */
export async function makeLeavePdf(form) {
  const formBytes = await fetchBytes(FORM_URL);
  const name = text(form?.name);
  const signature = name
    ? await drawSignature(name, {
      cx: SIGNATURE.cx, baseline: SIGNATURE.y, size: SIGNATURE.size, maxW: SIGNATURE.maxW,
    })
    : null;
  const bytes = buildPdf({
    form: formBytes,
    signature,
    runs: formLayout(form),
    title: `Leave Application - ${name}`,
  });
  return new File([bytes], formFilename(form), { type: "application/pdf" });
}
