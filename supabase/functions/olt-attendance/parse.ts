// ============================================================
// Reading OLT's pages, without a DOM.
//
// OLT's markup is ASP.NET WebForms output: the same controls, by the same ids,
// on every load. So the few things this needs — the form's fields, one select,
// one GridView — are found by name or id rather than by walking a document
// tree, and this file imports nothing. That is what lets test/logic.mjs run
// it in node against literal fixtures; a DOM library would have tied it to
// Deno.
//
// Names below were read off the saved Attendance page (2026-10-13). If OLT
// changes one, the step using it fails with its own error code rather than
// reading the wrong thing.
// ============================================================

export const TERM_SELECT = "ctl00$Main$DropDownList1";
export const GRID_ID = "ctl00_Main_GridView1";
export const USERNAME = "ctl00$Login1$LoginView1$UserName";
export const LOGIN_BUTTON = "ctl00$Login1$LoginView1$ButtonLogin";
export const LOGOFF_BUTTON = "ctl00$Login1$LoginView1$ButtonLogOff";

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s: string): string {
  return String(s ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** Text as a reader sees it: tags gone, entities decoded, spaces collapsed. */
export const textOf = (html: string) =>
  decodeEntities(String(html ?? "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

/** The attributes of one opening tag. Bare attributes (`selected`) map to "". */
export function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const body = String(tag ?? "").replace(/^<\w+/, "").replace(/\/?>$/, "");
  for (const m of body.matchAll(/([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return out;
}

export interface Option { value: string; text: string; selected: boolean }

function optionsIn(inner: string): Option[] {
  const out: Option[] = [];
  // Closing tags are optional for <option>, so each runs to the next one.
  for (const m of inner.matchAll(/(<option\b[^>]*>)([\s\S]*?)(?=<option\b|<\/select>|$)/gi)) {
    const a = attrsOf(m[1]);
    const text = textOf(m[2].replace(/<\/option>[\s\S]*$/i, ""));
    out.push({ value: "value" in a ? a.value : text, text, selected: "selected" in a });
  }
  return out;
}

/** The options of the select with this name, or null if the page has none. */
export function selectOptions(html: string, name: string): Option[] | null {
  for (const m of String(html ?? "").matchAll(/(<select\b[^>]*>)([\s\S]*?)<\/select>/gi)) {
    if (attrsOf(m[1]).name === name) return optionsIn(m[2]);
  }
  return null;
}

/**
 * Every field the page's form would submit, as a browser builds it. Buttons
 * are left out: a postback names its trigger in __EVENTTARGET, and a stray
 * submit value would read as a second click.
 */
export function formFields(html: string): [string, string][] {
  const src = String(html ?? "");
  const out: [string, string][] = [];

  for (const m of src.matchAll(/<input\b[^>]*>/gi)) {
    const a = attrsOf(m[0]);
    if (!a.name) continue;
    const type = (a.type || "text").toLowerCase();
    if (["submit", "button", "image", "reset", "file"].includes(type)) continue;
    if ((type === "checkbox" || type === "radio") && !("checked" in a)) continue;
    out.push([a.name, a.value ?? ""]);
  }
  for (const m of src.matchAll(/(<select\b[^>]*>)([\s\S]*?)<\/select>/gi)) {
    const name = attrsOf(m[1]).name;
    if (!name) continue;
    const opts = optionsIn(m[2]);
    const chosen = opts.find((o) => o.selected) ?? opts[0];
    if (chosen) out.push([name, chosen.value]);
  }
  for (const m of src.matchAll(/(<textarea\b[^>]*>)([\s\S]*?)<\/textarea>/gi)) {
    const name = attrsOf(m[1]).name;
    if (name) out.push([name, decodeEntities(m[2])]);
  }
  return out;
}

/**
 * The fields of the page's form posted back as if `target` had been clicked:
 * everything the page handed out, with `set` laid over it, and the two event
 * fields naming the click. Only those two are replaced — __EVENTVALIDATION
 * shares their prefix but is the page's own state, and posting without it
 * makes ASP.NET reject the click with a 500.
 */
export function postBackFields(
  html: string,
  target: string,
  set: Record<string, string> = {},
): [string, string][] {
  const fields = formFields(html).filter(([k]) =>
    !(k in set) && k !== "__EVENTTARGET" && k !== "__EVENTARGUMENT"
  );
  fields.push(...Object.entries(set), ["__EVENTTARGET", target], ["__EVENTARGUMENT", ""]);
  return fields;
}

export function formAction(html: string, pageUrl: string): string {
  const tag = String(html ?? "").match(/<form\b[^>]*>/i)?.[0];
  const action = tag ? attrsOf(tag).action : "";
  return new URL(action || pageUrl, pageUrl).toString();
}

/** Whether a sign-in form is on the page — i.e. we are not signed in. */
export const hasPasswordBox = (html: string) =>
  [...String(html ?? "").matchAll(/<input\b[^>]*>/gi)]
    .some((m) => (attrsOf(m[0]).type ?? "").toLowerCase() === "password");

/** A field asking for a one-time code. The shared stylesheet styles one;
 *  nothing says students are shown it, but if they are, say so. */
export const hasOtpField = (html: string) =>
  [...String(html ?? "").matchAll(/<input\b[^>]*>/gi)]
    .some((m) => /otp/i.test(attrsOf(m[0]).name ?? ""));

/**
 * OLT's attendance GridView: its heading row and every data row as text.
 * A row whose cell count differs from the heading — the "no records" row a
 * GridView draws across every column — is not data and is dropped.
 */
export function readGrid(html: string, id = GRID_ID): { columns: string[]; rows: string[][] } | null {
  // Opening tags first, then the body: OLT draws the grid inside layout
  // tables, and a single open-to-close match starting at the outer table
  // swallows the grid's own opening tag. The grid itself never nests one, so
  // its body runs to the next close.
  const src = String(html ?? "");
  const open = [...src.matchAll(/<table\b[^>]*>/gi)].find((m) => attrsOf(m[0]).id === id);
  if (!open) return null;
  const from = open.index! + open[0].length;
  const to = src.slice(from).search(/<\/table>/i);
  const inner = to < 0 ? src.slice(from) : src.slice(from, from + to);

  const trs = [...inner.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  const cells = (tr: string, tag: string) =>
    [...tr.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))].map((m) => textOf(m[1]));

  const headIdx = trs.findIndex((tr) => /<th\b/i.test(tr));
  if (headIdx < 0) return null;
  const columns = cells(trs[headIdx], "th");

  const rows = trs.slice(headIdx + 1)
    .map((tr) => cells(tr, "td"))
    .filter((r) => r.length === columns.length && r.some(Boolean));

  return { columns, rows };
}

/** "Term-V", "TERM 5" and "term 5" are the same term. */
export function termKey(s: string): string {
  const roman: Record<string, string> = {
    i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10",
  };
  return String(s ?? "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\b(i{1,3}|iv|v|vi{1,3}|ix|x)\b/g, (r) => roman[r] ?? r);
}
