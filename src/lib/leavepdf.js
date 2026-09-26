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
 * Written by hand rather than through a PDF library. The file is one page:
 * two JPEGs and a dozen lines of Times, which is a couple of hundred lines to
 * write and none to download — a library would be the bulk of this feature's
 * weight for the sake of a single form.
 *
 * The answers are real text in Times-Roman, one of the fonts every PDF
 * reader carries, so nothing has to be embedded for them. The signature is
 * the exception: it is drawn onto a canvas in a script face and placed as an
 * image, because embedding a font by hand is where a hand-written PDF stops
 * being small.
 */

import { hostelOf, leavePeriod } from "./leavemail.js";

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

/* ---------- text in Times-Roman ---------- */

/**
 * Unicode to the one-byte WinAnsi encoding Times-Roman is read in. Latin-1
 * maps straight across; the curly quotes, dashes and the rest a phone
 * keyboard substitutes live in 128–159. Anything else — an address typed in
 * Bengali, an emoji — has no glyph in the font and becomes "?", and the mail
 * itself still carries it exactly as typed.
 */
const WIN_ANSI_HIGH = {
  8364: 128, 8218: 130, 402: 131, 8222: 132, 8230: 133, 8224: 134, 8225: 135,
  710: 136, 8240: 137, 352: 138, 8249: 139, 338: 140, 381: 142, 8216: 145,
  8217: 146, 8220: 147, 8221: 148, 8226: 149, 8211: 150, 8212: 151, 732: 152,
  8482: 153, 353: 154, 8250: 155, 339: 156, 382: 158, 376: 159,
};

export function winAnsi(str) {
  const out = [];
  for (const ch of String(str ?? "")) {
    const c = ch.codePointAt(0);
    if (c === 9) out.push(32);
    else if ((c >= 32 && c <= 126) || (c >= 160 && c <= 255)) out.push(c);
    else if (WIN_ANSI_HIGH[c]) out.push(WIN_ANSI_HIGH[c]);
    else if (c === 0x20b9) out.push(82, 115);      // ₹ -> "Rs"
    else out.push(63);                              // ?
  }
  return out;
}

/** Times-Roman advance widths, per 1000 em, for WinAnsi codes 32–255.
 *  From the standard font metrics; 0 where the code has no character. */
const TIMES = [
  250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278,
  500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444,
  921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722,
  556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500,
  333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500,
  500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541, 0,
  500, 0, 333, 500, 444, 1000, 500, 500, 333, 1000, 556, 333, 889, 0, 611, 0,
  0, 333, 333, 444, 444, 350, 500, 1000, 333, 980, 389, 333, 722, 0, 444, 722,
  250, 333, 500, 500, 500, 500, 200, 500, 333, 760, 276, 500, 564, 333, 760, 333,
  400, 564, 300, 300, 333, 500, 453, 250, 333, 300, 310, 500, 750, 750, 750, 444,
  722, 722, 722, 722, 722, 722, 889, 667, 611, 611, 611, 611, 333, 333, 333, 333,
  722, 722, 722, 722, 722, 722, 722, 564, 722, 722, 722, 722, 722, 722, 556, 500,
  444, 444, 444, 444, 444, 444, 667, 444, 444, 444, 444, 444, 278, 278, 278, 278,
  500, 500, 500, 500, 500, 500, 500, 564, 500, 500, 500, 500, 500, 500, 500, 500,
];

/** Width in points of a string set in Times-Roman at `size`. */
export function timesWidth(str, size) {
  let units = 0;
  for (const c of winAnsi(str)) units += TIMES[c - 32] || 500;
  return (units * size) / 1000;
}

/**
 * Break text into lines no wider than `widths[i]` for line i (the last
 * width repeats). Breaks at spaces; a single word longer than a whole line
 * is cut. The student's own line breaks are kept — an address typed over
 * three lines is three lines on the form, if it fits.
 */
export function wrapText(str, widths, size) {
  const lines = [];
  const width = () => widths[Math.min(lines.length, widths.length - 1)];
  for (const para of String(str ?? "").split(/\r?\n/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (timesWidth(next, size) <= width()) { line = next; continue; }
      if (line) { lines.push(line); line = ""; }
      let rest = word;
      while (timesWidth(rest, size) > width()) {
        let cut = rest.length - 1;
        while (cut > 1 && timesWidth(rest.slice(0, cut), size) > width()) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Fit a block into at most `maxLines` lines, stepping the size down before
 * giving up. What still doesn't fit is cut with an ellipsis: the form is a
 * form, and the full text is in the mail it travels with.
 */
export function fitBlock(str, widths, maxLines, size = 9, min = 7) {
  for (let s = size; s >= min; s -= 0.5) {
    const lines = wrapText(str, widths, s);
    if (lines.length <= maxLines) return { size: s, lines };
  }
  const lines = wrapText(str, widths, min).slice(0, maxLines);
  const last = lines.length - 1;
  const w = widths[Math.min(last, widths.length - 1)];
  while (lines[last] && timesWidth(`${lines[last]}…`, min) > w) {
    lines[last] = lines[last].slice(0, -1);
  }
  if (last >= 0) lines[last] = `${lines[last].trimEnd()}…`;
  return { size: min, lines };
}

/* ---------- where each answer goes ---------- */

/** A4, in points. */
export const PAGE = { w: 595.28, h: 841.89 };

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

/** Width, height and colour components of a baseline or progressive JPEG,
 *  read from its frame header. Null if the bytes aren't a JPEG. */
export function jpegInfo(bytes) {
  if (!bytes || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    // SOF0–SOF15, except the three that aren't frames (DHT, JPG, DAC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return {
        height: (bytes[i + 5] << 8) | bytes[i + 6],
        width: (bytes[i + 7] << 8) | bytes[i + 8],
        components: bytes[i + 9],
      };
    }
    i += 2 + len;
  }
  return null;
}

const num = (n) => String(Math.round(n * 100) / 100);

/** A PDF string literal from WinAnsi bytes: printable ASCII as is, the
 *  three special characters escaped, everything else as octal. */
const pdfString = (codes) => `(${codes.map((c) => {
  if (c === 40 || c === 41 || c === 92) return `\\${String.fromCharCode(c)}`;
  if (c >= 32 && c <= 126) return String.fromCharCode(c);
  return `\\${c.toString(8).padStart(3, "0")}`;
}).join("")})`;

/**
 * Assemble the file.
 *
 * `form` is the background JPEG's bytes; `signature`, if there is one, is
 * { jpeg, x, y, w, h } in points from the top-left. `runs` come from
 * formLayout. Everything but the two image streams is ASCII, so the
 * byte offsets the cross-reference table needs are just string lengths.
 */
export function buildPdf({ form, signature = null, runs, title = "" }) {
  const bg = jpegInfo(form);
  if (!bg) throw new Error("The form image isn't a JPEG");
  const sig = signature ? jpegInfo(signature.jpeg) : null;
  const colour = (info) => (info.components === 1 ? "/DeviceGray" : "/DeviceRGB");
  const top = (y) => PAGE.h - y;

  const draw = [
    "q",
    `${num(FORM_BOX.w)} 0 0 ${num(FORM_BOX.h)} ${num(FORM_BOX.x)} ${num(top(FORM_BOX.y + FORM_BOX.h))} cm`,
    "/Form Do",
    "Q",
  ];
  if (sig) {
    draw.push(
      "q",
      `${num(signature.w)} 0 0 ${num(signature.h)} ${num(signature.x)} ${num(top(signature.y + signature.h))} cm`,
      "/Sig Do",
      "Q",
    );
  }
  draw.push("BT", "0 g");
  for (const r of runs) {
    draw.push(`/F1 ${num(r.size)} Tf`, `1 0 0 1 ${num(r.x)} ${num(top(r.y))} Tm`,
      `${pdfString(winAnsi(r.str))} Tj`);
  }
  draw.push("ET");
  const content = draw.join("\n");

  const image = (name, info, bytes) => [
    `<< /Type /XObject /Subtype /Image /Width ${info.width} /Height ${info.height}`
      + ` /ColorSpace ${colour(info)} /BitsPerComponent 8 /Filter /DCTDecode`
      + ` /Length ${bytes.length} >>\nstream\n`,
    bytes,
    "\nendstream",
  ];

  const xobjects = `/Form 5 0 R${sig ? " /Sig 6 0 R" : ""}`;
  const objects = [
    ["<< /Type /Catalog /Pages 2 0 R >>"],
    ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"],
    [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE.w)} ${num(PAGE.h)}]`
      + ` /Resources << /Font << /F1 4 0 R >> /XObject << ${xobjects} >> >> /Contents 7 0 R >>`],
    ["<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>"],
    image("Form", bg, form),
    // Object 6 exists either way so the numbering never shifts; without a
    // signature it is an empty dictionary nothing refers to.
    sig ? image("Sig", sig, signature.jpeg) : ["<< >>"],
    [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`],
    [`<< /Title ${pdfString(winAnsi(title))} /Producer (IIMPresent) >>`],
  ];

  const chunks = [];
  let length = 0;
  const put = (part) => {
    const bytes = typeof part === "string" ? latin1(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  put("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const offsets = [];
  objects.forEach((parts, i) => {
    offsets.push(length);
    put(`${i + 1} 0 obj\n`);
    parts.forEach(put);
    put("\nendobj\n");
  });
  const xref = length;
  put(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const o of offsets) put(`${String(o).padStart(10, "0")} 00000 n \n`);
  put(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\n`
    + `startxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

/** Bytes of an all-ASCII (or deliberately Latin-1) string. */
function latin1(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

/* ---------- in the browser ---------- */

const FORM_URL = "/leave/form.jpg";
const SIGNATURE_FONT = "/leave/Yesteryear-Regular.ttf";
const SIGNATURE_FAMILY = "IIMPresentSignature";

let formBytes = null;
let fontReady = null;

/**
 * The student's name in a brush script, as a JPEG on white, sized in points
 * for the signature line. Yesteryear stands in for the printout's Brush
 * Script MT, which is Windows' own and can't be shipped; it is the closest
 * free face to it, under the SIL Open Font License (public/leave/OFL-*.txt).
 */
async function drawSignature(name) {
  if (!fontReady) {
    const face = new FontFace(SIGNATURE_FAMILY, `url(${SIGNATURE_FONT})`);
    fontReady = face.load().then((f) => { document.fonts.add(f); });
    fontReady.catch(() => { fontReady = null; });
  }
  await fontReady;

  // Eight pixels a point: sharp when printed, and a few kilobytes as a JPEG.
  const k = 8;
  let size = SIGNATURE.size;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = () => `${size * k}px ${SIGNATURE_FAMILY}`;
  ctx.font = font();
  let m = ctx.measureText(name);
  while (m.width / k > SIGNATURE.maxW && size > 9) {
    size -= 0.5;
    ctx.font = font();
    m = ctx.measureText(name);
  }
  // Script faces overhang their advance width on both sides, so the box is
  // the ink's, not the advance's.
  const ascent = Math.ceil(m.actualBoundingBoxAscent ?? size * k * 0.8) + 2 * k;
  const descent = Math.ceil(m.actualBoundingBoxDescent ?? size * k * 0.3) + k;
  const left = Math.max(0, Math.ceil(m.actualBoundingBoxLeft ?? 0)) + k;
  const right = Math.ceil(Math.max(m.width, m.actualBoundingBoxRight ?? 0)) + k;
  const width = left + right;

  canvas.width = width;
  canvas.height = ascent + descent;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  ctx.font = font();
  ctx.textBaseline = "alphabetic";
  ctx.fillText(name, left, ascent);

  const blob = await new Promise((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("no signature image"))), "image/jpeg", 0.92));
  const w = canvas.width / k;
  return {
    jpeg: new Uint8Array(await blob.arrayBuffer()),
    x: SIGNATURE.cx - w / 2,
    y: SIGNATURE.y - ascent / k,
    w,
    h: canvas.height / k,
  };
}

/** The finished form as a File, ready to save or share. */
export async function makeLeavePdf(form) {
  if (!formBytes) {
    const res = await fetch(FORM_URL);
    if (!res.ok) throw new Error(`form image: ${res.status}`);
    formBytes = new Uint8Array(await res.arrayBuffer());
  }
  const name = text(form?.name);
  const signature = name ? await drawSignature(name) : null;
  const bytes = buildPdf({
    form: formBytes,
    signature,
    runs: formLayout(form),
    title: `Leave Application - ${name}`,
  });
  return new File([bytes], formFilename(form), { type: "application/pdf" });
}
