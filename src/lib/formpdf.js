/**
 * One-page PDFs of the institute's forms, written by hand.
 *
 * Shared by the leave form (leavepdf.js) and the guest entry form
 * (guestpdf.js). Each form is a page of JPEGs, ruled lines and text in the
 * two Times faces every PDF reader carries, so nothing has to be embedded for
 * the words — a couple of hundred lines here rather than a PDF library that
 * would be the bulk of either feature's weight.
 *
 * The signature is the exception: it is drawn onto a canvas in a script face
 * and placed as an image, because embedding a font by hand is where a
 * hand-written PDF stops being small.
 *
 * Coordinates are in points from the top-left of the page, the way the forms
 * were measured; the writer turns them into PDF's bottom-left ones.
 */

/** A4, in points. */
export const PAGE = { w: 595.28, h: 841.89 };

/* ---------- text in Times ---------- */

/**
 * Unicode to the one-byte WinAnsi encoding the Times faces are read in.
 * Latin-1 maps straight across; the curly quotes, dashes and the rest a
 * phone keyboard substitutes live in 128–159. Anything else — an address
 * typed in Bengali, an emoji — has no glyph in the font and becomes "?", and
 * the mail itself still carries it exactly as typed.
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

/** Advance widths, per 1000 em, for WinAnsi codes 32–255, from the standard
 *  font metrics; 0 where the code has no character. */
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

const TIMES_BOLD = [
  250, 333, 555, 500, 500, 1000, 833, 278, 333, 333, 500, 570, 250, 333, 250, 278,
  500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 570, 570, 570, 500,
  930, 722, 667, 722, 722, 667, 611, 778, 778, 389, 500, 778, 667, 944, 722, 778,
  611, 778, 722, 556, 667, 722, 722, 1000, 722, 722, 667, 333, 278, 333, 581, 500,
  333, 500, 556, 444, 556, 444, 333, 500, 556, 278, 333, 556, 278, 833, 556, 500,
  556, 556, 444, 389, 333, 556, 500, 722, 500, 500, 444, 394, 220, 394, 520, 0,
  500, 0, 333, 500, 500, 1000, 500, 500, 333, 1000, 556, 333, 1000, 0, 667, 0,
  0, 333, 333, 500, 500, 350, 500, 1000, 333, 1000, 389, 333, 722, 0, 444, 722,
  250, 333, 500, 500, 500, 500, 220, 500, 333, 747, 300, 500, 570, 333, 747, 333,
  400, 570, 300, 300, 333, 556, 540, 250, 333, 300, 330, 500, 750, 750, 750, 500,
  722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 389, 389, 389, 389,
  722, 722, 778, 778, 778, 778, 778, 570, 778, 722, 722, 722, 722, 722, 611, 556,
  500, 500, 500, 500, 500, 500, 722, 444, 444, 444, 444, 444, 278, 278, 278, 278,
  500, 556, 500, 500, 500, 500, 500, 570, 500, 556, 556, 556, 556, 500, 556, 500,
];

/** Width in points of a string set in Times-Roman (or Times-Bold) at `size`. */
export function timesWidth(str, size, bold = false) {
  const table = bold ? TIMES_BOLD : TIMES;
  let units = 0;
  for (const c of winAnsi(str)) units += table[c - 32] || 500;
  return (units * size) / 1000;
}

/**
 * A paragraph's break points: each word, and within a word each piece after
 * a dash, which is where Word breaks "policy—whether" too. `glued` pieces
 * follow the one before with no space. Split without a lookbehind, which
 * older iPhones can't parse.
 */
function pieces(para) {
  const out = [];
  for (const word of para.split(/\s+/).filter(Boolean)) {
    const parts = word.split(/([–—])/);
    let first = true;
    for (let i = 0; i < parts.length; i += 2) {
      const text = parts[i] + (parts[i + 1] ?? "");
      if (!text) continue;
      out.push({ text, glued: !first });
      first = false;
    }
  }
  return out;
}

/**
 * Break text into lines no wider than `widths[i]` for line i (the last
 * width repeats). Breaks at spaces and after dashes; a single word longer
 * than a whole line is cut. The student's own line breaks are kept — an
 * address typed over three lines is three lines on the form, if it fits.
 */
export function wrapText(str, widths, size, bold = false) {
  const lines = [];
  const width = () => widths[Math.min(lines.length, widths.length - 1)];
  const w = (s) => timesWidth(s, size, bold);
  for (const para of String(str ?? "").split(/\r?\n/)) {
    let line = "";
    for (const { text: word, glued } of pieces(para)) {
      const next = line ? `${line}${glued ? "" : " "}${word}` : word;
      if (w(next) <= width()) { line = next; continue; }
      if (line) { lines.push(line); line = ""; }
      let rest = word;
      while (w(rest) > width()) {
        let cut = rest.length - 1;
        while (cut > 1 && w(rest.slice(0, cut)) > width()) cut--;
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

/* ---------- the file ---------- */

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
 * Assemble a one-page PDF.
 *
 *   images  [{ jpeg, x, y, w, h }]   drawn first, in order
 *   rules   [{ x1, x2, y, width }]   horizontal lines — underlines, signature lines
 *   runs    [{ x, y, size, str, bold?, wordSpace? }]   text; y is the baseline.
 *           `wordSpace` widens each space, which is how a justified line
 *           reaches the margin.
 *
 * Only the fonts actually used get an object. Everything but the image
 * streams is ASCII, so the byte offsets the cross-reference table needs are
 * just string lengths.
 */
export function writePdf({ images = [], rules = [], runs = [], title = "" }) {
  const top = (y) => PAGE.h - y;
  const pics = images.map((img) => {
    const info = jpegInfo(img.jpeg);
    if (!info) throw new Error("An image on the form isn't a JPEG");
    return { ...img, info };
  });
  const usesBold = runs.some((r) => r.bold);

  const draw = [];
  pics.forEach((p, i) => {
    draw.push("q", `${num(p.w)} 0 0 ${num(p.h)} ${num(p.x)} ${num(top(p.y + p.h))} cm`,
      `/Im${i} Do`, "Q");
  });
  if (rules.length) {
    draw.push("0 G");
    for (const r of rules) {
      draw.push(`${num(r.width ?? 0.6)} w`, `${num(r.x1)} ${num(top(r.y))} m`,
        `${num(r.x2)} ${num(top(r.y))} l`, "S");
    }
  }
  if (runs.length) {
    draw.push("BT", "0 g");
    let spacing = 0;
    for (const r of runs) {
      const ws = r.wordSpace ?? 0;
      if (ws !== spacing) { draw.push(`${num(ws)} Tw`); spacing = ws; }
      draw.push(`/${r.bold ? "F2" : "F1"} ${num(r.size)} Tf`,
        `1 0 0 1 ${num(r.x)} ${num(top(r.y))} Tm`, `${pdfString(winAnsi(r.str))} Tj`);
    }
    draw.push("ET");
  }
  const content = draw.join("\n");

  // Numbered as they are pushed: catalog 1, pages 2, page 3, then the rest.
  const objects = [];
  const add = (parts) => { objects.push(parts); return objects.length; };
  add(["<< /Type /Catalog /Pages 2 0 R >>"]);
  add(["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  const pageAt = objects.push(null) - 1;          // filled in once the rest are numbered
  const f1 = add(["<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>"]);
  const f2 = usesBold
    ? add(["<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>"])
    : null;
  const imageRefs = pics.map((p) => add([
    `<< /Type /XObject /Subtype /Image /Width ${p.info.width} /Height ${p.info.height}`
      + ` /ColorSpace ${p.info.components === 1 ? "/DeviceGray" : "/DeviceRGB"}`
      + ` /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
    p.jpeg,
    "\nendstream",
  ]));
  const contents = add([`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
  const info = add([`<< /Title ${pdfString(winAnsi(title))} /Producer (IIMPresent) >>`]);

  const fonts = `/F1 ${f1} 0 R${f2 ? ` /F2 ${f2} 0 R` : ""}`;
  const xobjects = imageRefs.map((ref, i) => `/Im${i} ${ref} 0 R`).join(" ");
  objects[pageAt] = [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE.w)} ${num(PAGE.h)}]`
    + ` /Resources << /Font << ${fonts} >>${xobjects ? ` /XObject << ${xobjects} >>` : ""} >>`
    + ` /Contents ${contents} 0 R >>`];

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
  put(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${info} 0 R >>\n`
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

const SIGNATURE_FONT = "/leave/Yesteryear-Regular.ttf";
const SIGNATURE_FAMILY = "IIMPresentSignature";

const fetched = new Map();
let fontReady = null;

/** A file from public/, fetched once a page and held. */
export async function fetchBytes(url) {
  if (!fetched.has(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    fetched.set(url, new Uint8Array(await res.arrayBuffer()));
  }
  return fetched.get(url);
}

/**
 * The student's name in a brush script, as a JPEG on white, sized in points
 * for a signature line: centred on `cx`, sitting on `baseline`, shrunk to fit
 * `maxW`. Yesteryear stands in for the leave printout's Brush Script MT,
 * which is Windows' own and can't be shipped; it is the closest free face to
 * it, under the SIL Open Font License (public/leave/OFL-*.txt).
 */
export async function drawSignature(name, { cx, baseline, size: start = 15, maxW }) {
  if (!fontReady) {
    const face = new FontFace(SIGNATURE_FAMILY, `url(${SIGNATURE_FONT})`);
    fontReady = face.load().then((f) => { document.fonts.add(f); });
    fontReady.catch(() => { fontReady = null; });
  }
  await fontReady;

  // Eight pixels a point: sharp when printed, and a few kilobytes as a JPEG.
  const k = 8;
  let size = start;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const font = () => `${size * k}px ${SIGNATURE_FAMILY}`;
  ctx.font = font();
  let m = ctx.measureText(name);
  while (m.width / k > maxW && size > 9) {
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

  canvas.width = left + right;
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
    x: cx - w / 2,
    y: baseline - ascent / k,
    w,
    h: canvas.height / k,
  };
}
