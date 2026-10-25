/**
 * The Student Guest Campus Entry Form, as the PDF that goes with the guest
 * entry mail.
 *
 * The leave form is a scanned page with answers typed onto it; this one is
 * drawn whole. Its source is a Word document (kept in rollcall-resources as
 * "Guest Entry Form (template).docx"), and its answers have no fixed room —
 * "Reason(s) for Visit (Please provide the complete disclosure.)" may need
 * several lines — so the page flows: each answer follows its label, wraps
 * under it, and pushes everything below down. Positions, sizes and spacing
 * were measured off the template as Word renders it, so an answer that fits
 * on its line leaves the page exactly as the template lays it out.
 *
 * The declaration's wording is the template's, word for word. It is what the
 * student signs.
 */

import { formWhen, formDate, isoParts } from "./leavepdf.js";
import { timesWidth, wrapText, fitBlock, writePdf, fetchBytes, drawSignature } from "./formpdf.js";
import { guestValues } from "./guestmail.js";

const LEFT = 54;
const RIGHT = 541.3;
const WIDTH = RIGHT - LEFT;
/** Where the page has to end: past this the form would run onto a second
 *  page, which a one-page form must not. */
const BOTTOM = 800;

const DECLARATION = [
  "I hereby declare that all the information provided above is true, accurate, and complete "
    + "to the best of my knowledge and belief. It is expressly understood that guest access to "
    + "student hostels for any institutional/societal/constitutional deviations* is strictly "
    + "prohibited. I further affirm and undertake that my guest(s) will limit their presence on "
    + "campus strictly to the purpose stated herein, and will always adhere to the rules, "
    + "regulations, and guidelines laid down by the Institute.",
  "I also acknowledge that any instance of misconduct, violation, non-compliance, or misuse of "
    + "this policy—whether by my guest(s) or myself—will be considered a breach "
    + "attributable to me as the host. I understand that such breaches may result in "
    + "disciplinary action, as deemed appropriate by the competent authority of the Institute.",
];
const FOOTNOTE = "*Institutional, societal, or constitutional deviations include, but are not "
  + "limited to, acts of violence, possession or distribution of prohibited substances, casual "
  + "dating, damage to institutional property, or any actions that may harm the reputation of "
  + "the institute.";

/** The guest's answers as the form prints them, in its order. `lines` is
 *  the most each may take; the reason can be cut further if the page would
 *  otherwise overflow. */
function guestRows(v, f) {
  return [
    { label: "Name of Guest(s): ", value: v.guests, lines: 2 },
    { label: "Address: ", value: v.address, lines: 3 },
    { label: "Aadhaar Number or any other govt ID: ", value: "Masked copy attached", underline: true },
    { label: "Mobile Number of the Guest(s): ", value: v.mobiles, lines: 2 },
    { label: "Relationship with Student: ", value: v.relationship, lines: 2 },
    { label: "Name of the hostel where the guest will visit: ", value: v.visit, lines: 1 },
    { label: "Date and expected time of Arrival: ", value: formWhen(f.arriveDate, f.arriveTime), lines: 1 },
    { label: "Date and expected time of Departure: ", value: formWhen(f.departDate, f.departTime), lines: 1 },
    { label: "Reason(s) for Visit (Please provide the complete disclosure.): ", value: v.reason, lines: 6, reason: true },
  ];
}

/** Text centred on the page, optionally underlined. */
function centred(out, str, y, size, { bold = false, underline = false } = {}) {
  const w = timesWidth(str, size, bold);
  const x = (LEFT + RIGHT) / 2 - w / 2 + 0.3;
  out.runs.push({ x, y, size, str, bold });
  if (underline) out.rules.push({ x1: x, x2: x + w, y: y + size * 0.12, width: size * 0.055 });
}

/** A paragraph set justified to the margins: every line but the last is
 *  stretched by widening its spaces, as Word does. */
function justified(out, str, y, size, lead) {
  const lines = wrapText(str, [WIDTH], size);
  lines.forEach((line, i) => {
    const spaces = (line.match(/ /g) || []).length;
    const slack = WIDTH - timesWidth(line, size);
    const last = i === lines.length - 1;
    out.runs.push({
      x: LEFT, y: y + i * lead, size, str: line,
      wordSpace: !last && spaces ? slack / spaces : 0,
    });
  });
  return y + (lines.length - 1) * lead;
}

/**
 * Every run, rule and the signature's place on the page, as plain numbers —
 * separate from the drawing so the layout can be tested without a PDF.
 * Steps the reason down a line at a time until the page fits on one page.
 */
export function guestLayout(form) {
  const f = form ?? {};
  const v = guestValues(f);
  for (let reasonLines = 6; ; reasonLines--) {
    const page = layoutOnce(f, v, reasonLines);
    if (page.bottom <= BOTTOM || reasonLines <= 1) return page;
  }
}

function layoutOnce(f, v, reasonLines) {
  // `cut` is whether any answer had to be shortened to fit — the screen
  // says so, since the mail beside it still carries every answer whole.
  const out = { runs: [], rules: [], signature: null, bottom: 0, cut: false };

  centred(out, "INDIAN INSTITUTE OF MANAGEMENT CALCUTTA", 129.3, 14, { bold: true });
  centred(out, "STUDENT GUEST CAMPUS ENTRY FORM", 146.9, 13, { underline: true });
  centred(out, "(To be filled by the student)", 162.3, 11);

  // The questions: 12 pt, a field every 20.875 pt (the template's nine
  // questions span 167 pt), an answer's extra lines 1.21 em apart — Word's
  // single spacing for Times.
  let y = 189.6;
  for (const row of guestRows(v, f)) {
    const labelW = timesWidth(row.label, 12);
    out.runs.push({ x: LEFT, y, size: 12, str: row.label });
    if (row.underline) {
      const x = LEFT + labelW;
      out.runs.push({ x, y, size: 12, str: row.value });
      out.rules.push({ x1: x, x2: x + timesWidth(row.value, 12), y: y + 1.5, width: 0.6 });
    } else if (row.value) {
      // The first line runs on from the label; the rest wrap to the margin.
      // The reason may step down to 10 pt before anything of it is cut: it
      // is the "complete disclosure" the form asks for.
      const max = row.reason ? reasonLines : row.lines;
      const { size, lines } = fitBlock(row.value, [WIDTH - labelW, WIDTH], max, 12, row.reason ? 10 : 12);
      if (lines.length && lines[lines.length - 1].endsWith("…") && !row.value.endsWith("…")) {
        out.cut = true;
      }
      const lead = size * 1.21;
      lines.forEach((str, i) => {
        out.runs.push({ x: i ? LEFT : LEFT + labelW, y: y + i * lead, size, str });
      });
      y += Math.max(0, lines.length - 1) * lead;
    }
    y += 20.875;
  }

  // The declaration, as the template sets it.
  y += 8;
  centred(out, "Self-Declaration", y, 13, { bold: true, underline: true });
  y = justified(out, DECLARATION[0], y + 21.3, 11, 14.6);
  y = justified(out, DECLARATION[1], y + 18.4, 11, 14.6);
  y = justified(out, FOOTNOTE, y + 17.6, 10, 13.3);

  // The signature block. The name in script sits on the line, as a signed
  // form's would; the date beside it is the mail's.
  y += 49.8;
  const line = "______________________________";
  out.runs.push({ x: LEFT, y, size: 12, str: line });
  out.signature = {
    cx: LEFT + timesWidth(line, 12) / 2, baseline: y - 3, size: 17, maxW: timesWidth(line, 12) - 6,
  };
  out.runs.push({ x: 378.1, y, size: 12, str: `Date: ${formDate(f.date)}` });
  y += 16;
  out.runs.push({ x: LEFT, y, size: 12, str: "Signature of the Student" });
  y += 21.8;
  const studentRow = (label, value) => {
    out.runs.push({ x: LEFT, y, size: 12, str: label });
    if (value) {
      const x = LEFT + timesWidth(label, 12);
      // One line: a long name steps down a size rather than wrapping.
      const { size, lines } = fitBlock(value, [RIGHT - x], 1, 12, 9);
      out.runs.push({ x, y, size, str: lines[0] });
    }
  };
  studentRow("Name of the Student: ", v.name);
  y += 20.9;
  studentRow("MBA Registration Number: ", v.reg);
  y += 20.9;
  // Hostel and room share a line, as on the template.
  out.runs.push({ x: LEFT, y, size: 12, str: "Hostel Name: " });
  if (v.hostel) {
    const x = LEFT + timesWidth("Hostel Name: ", 12);
    const { size, lines } = fitBlock(v.hostel, [370 - x], 1, 12, 9);
    out.runs.push({ x, y, size, str: lines[0] });
  }
  out.runs.push({ x: 378.1, y, size: 12, str: `Room No.: ${v.room}` });
  y += 20.8;
  studentRow("Mobile No. of the Student: ", v.phone);

  out.bottom = y;
  return out;
}

/** "Guest Entry - Debjit Sarkar - 03-10-2026.pdf", dated by the arrival. */
export function guestFilename(form) {
  const name = String(form?.name ?? "").trim()
    .replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const m = isoParts(form?.arriveDate);
  return ["Guest Entry", name || null, m ? `${m[3]}-${m[2]}-${m[1]}` : null]
    .filter(Boolean)
    .join(" - ") + ".pdf";
}

/* ---------- in the browser ---------- */

/** The institute's crest, taken from the template document. */
const LOGO_URL = "/guest/logo.jpg";
const LOGO_BOX = { x: 269, y: 54, w: 57, h: 54 };

/** The finished form as a File, ready to attach or save. */
export async function makeGuestPdf(form) {
  const layout = guestLayout(form);
  const logo = await fetchBytes(LOGO_URL);
  const name = String(form?.name ?? "").trim();
  const signature = name ? await drawSignature(name, layout.signature) : null;
  const bytes = writePdf({
    images: [{ jpeg: logo, ...LOGO_BOX }, ...(signature ? [signature] : [])],
    rules: layout.rules,
    runs: layout.runs,
    title: `Guest Entry - ${name}`,
  });
  return new File([bytes], guestFilename(form), { type: "application/pdf" });
}
