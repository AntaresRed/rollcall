/**
 * What you have sent to a night canteen or a tuck shop — a record of intent,
 * not of dinner.
 *
 * The app hands a written-out order to WhatsApp and the student presses send.
 * Nothing here can see what happened next: whether it was sent at all, whether
 * a line was edited in the thread, whether something was added over the phone,
 * whether the counter had already closed. So this records the message at the
 * moment it was handed over, and the screen says plainly that that is what it
 * is. Calling it "your orders" would be claiming knowledge the app does not
 * have.
 *
 * What is kept is the message itself — the final text, as edited, word for
 * word — rather than the basket it was written from. Once the student can
 * change that text, the basket stops being a faithful account of what was
 * asked for, and a history that disagrees with the WhatsApp thread is worse
 * than none. Alongside it: which shop, when, and what the basket came to that
 * night. That figure is the basket's, not the message's, and is labelled so.
 *
 * Local to the device. That is a real limit — a phone and a laptop keep
 * separate histories, and clearing site data empties both — and it is the
 * reason the export below exists: a copy you keep is the only copy that
 * outlives the browser.
 */

/** Unchanged from when only the night canteen kept a history, so the orders
 *  already on people's phones are still found. */
const STORE = "iimpresent.night.orders";

/**
 * How far back the history reaches.
 *
 * Two months, by date rather than by count. A cap on the number of orders
 * meant a heavy week could push last month off the end, which is the opposite
 * of what a history is for.
 */
export const KEEP_DAYS = 60;

/**
 * A backstop, not the rule. Two months of ordering is nowhere near this; it
 * exists so that a bug elsewhere cannot grow the store without bound.
 */
export const CAP = 400;

/** Two taps on the same message inside this window are one order, not two. */
const SAME_ORDER_MINS = 3;

export const KIND_LABEL = { night: "Night canteen", tuck: "Tuck shop" };

/**
 * The text of an entry.
 *
 * Entries from before the message was recorded hold the basket instead. Those
 * are written back out the way the night canteen's message was then — dishes,
 * then room and registration number — which is what was sent, less any
 * instructions, which were never kept.
 */
export function textOf(entry) {
  if (typeof entry?.message === "string") return entry.message;
  const items = (entry?.items ?? [])
    .filter((l) => l && l.name)
    .map((l) => `${Number(l.qty) || 1} x ${l.name}`);
  if (!items.length) return "";
  const who = [];
  if (entry.room) who.push(`Room: ${entry.room}`);
  if (entry.reg) who.push(`Reg. No: ${entry.reg}`);
  return who.length ? `${items.join("\n")}\n\n${who.join("\n")}` : items.join("\n");
}

/**
 * One message, as it was handed over.
 *
 * The shop's name is copied in rather than looked up later: a shop can be
 * renamed in the spreadsheet, and a history that silently retitles what you
 * ordered last month is worse than one that is a little out of date.
 */
export function entryFor(shop, message, { kind = "night", total = 0, now = new Date() } = {}) {
  return {
    at: now.toISOString(),
    kind: kind === "tuck" ? "tuck" : "night",
    canteen: shop?.id ?? null,
    where: shop?.name ?? "",
    message: String(message ?? "").trim(),
    total: Number(total) || 0,
  };
}

/**
 * The new history, newest first.
 *
 * Pure, so the awkward parts — the cap, and the double tap — are testable
 * without a browser. Returns the list unchanged when there is nothing to
 * record, because an empty message cannot have been an order.
 */
export function appendOrder(history, entry, { cap = CAP, days = KEEP_DAYS } = {}) {
  const list = Array.isArray(history) ? history : [];
  if (!textOf(entry).trim()) return list;

  // Opening WhatsApp and coming back to tap again is one order being sent
  // once, not two dinners. Only the identical message to the same shop
  // within a few minutes collapses; anything else is somebody ordering twice,
  // which people genuinely do.
  if (isRepeat(list[0], entry)) return [entry, ...list.slice(1)];

  return prune([entry, ...list], { cap, days, now: new Date(entry.at) });
}

/** The same message to the same shop, a moment after the last one. */
export function isRepeat(top, entry) {
  if (!top || !entry) return false;
  if ((top.kind ?? "night") !== entry.kind || top.canteen !== entry.canteen) return false;
  if (textOf(top) !== textOf(entry)) return false;
  const gap = (new Date(entry.at) - new Date(top.at)) / 60000;
  return gap >= 0 && gap < SAME_ORDER_MINS;
}

/**
 * Drop anything older than the window.
 *
 * Measured from the newest entry rather than from the clock, so a history
 * read on a device whose date is wrong is not silently emptied.
 */
export function prune(list, { cap = CAP, days = KEEP_DAYS, now = new Date() } = {}) {
  const cutoff = now.getTime() - days * 86400000;
  return (list ?? [])
    .filter((e) => {
      const at = new Date(e?.at).getTime();
      // An unreadable date is kept: losing an order because its timestamp is
      // odd is worse than showing one entry too many.
      return Number.isNaN(at) || at >= cutoff;
    })
    .slice(0, cap);
}

/**
 * The history without one order.
 *
 * Keyed on the timestamp, because that is what actually identifies an entry:
 * two identical messages sent on different nights are different orders, and
 * the same message cannot be recorded twice inside the collapse window above.
 *
 * Whole orders only. An order is the unit that was handed over, and editing
 * one afterwards would leave a record claiming something was sent that never
 * was — which is the one thing this screen exists to promise it does not do.
 */
export function withoutOrder(history, at) {
  if (!at) return Array.isArray(history) ? history : [];
  return (history ?? []).filter((e) => e?.at !== at);
}

// ---------- the device's copy ----------

export function readOrders(now = new Date()) {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "null");
    if (!Array.isArray(raw)) return [];
    // Pruned on the way out as well as on the way in, so a history left
    // untouched for a term still ages out rather than sitting there for ever.
    return prune(raw.filter((e) => e?.at && textOf(e).trim()), { now });
  } catch {
    /* a private window, site data cleared, or storage switched off */
    return [];
  }
}

function write(list) {
  try {
    localStorage.setItem(STORE, JSON.stringify(list));
  } catch {
    /* nothing to be done, and nothing worth interrupting an order for */
  }
  return list;
}

/** Called at the moment the order is handed to WhatsApp. */
export function recordOrder(shop, message, { kind = "night", total = 0, now = new Date() } = {}) {
  return write(appendOrder(readOrders(now), entryFor(shop, message, { kind, total, now })));
}

export const clearOrders = () => write([]);

/** Called when somebody removes one order from the history screen. */
export function removeOrder(at, now = new Date()) {
  return write(withoutOrder(readOrders(now), at));
}

// ---------- reading it back ----------

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * The heading a day gets.
 *
 * Night orders land either side of midnight, so "Today" and "Yesterday" carry
 * most of the weight — an order placed at 1am belongs to the night you think
 * of as yesterday, but naming it as such would be its own kind of wrong. The
 * clock is left to say what it says.
 */
export function dayLabel(iso, now = new Date()) {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.round((midnight(now) - midnight(then)) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return DAY[then.getDay()];
  return `${then.getDate()} ${MONTH[then.getMonth()]}`;
}

export function clockOf(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? "am" : "pm"}`;
}

/** The history in day-sized blocks, newest first, for a screen to walk. */
export function byDay(history, now = new Date()) {
  const out = [];
  for (const entry of history ?? []) {
    const label = dayLabel(entry.at, now);
    const last = out[out.length - 1];
    if (last && last.label === label) last.orders.push(entry);
    else out.push({ label, orders: [entry] });
  }
  return out;
}

// ---------- taking it with you ----------

/** A CSV cell: quoted only when it has to be, so the file stays small and
 *  stays readable in a text editor as well as a spreadsheet. */
const cell = (v) => {
  const t = String(v ?? "");
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

const pad = (n) => String(n).padStart(2, "0");

export const HISTORY_COLUMNS = ["Date", "Time", "Type", "From", "Message", "Basket total"];

/** What the saved file is called. Dated, so exporting twice in a term leaves
 *  two files rather than a puzzle about which is which. */
export function historyFilename(now = new Date(), ext = "csv") {
  const d = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return `food-orders-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${ext}`;
}

/**
 * The history as CSV — one row per order, the message in one cell.
 *
 * A row per order now, where it used to be a row per dish: the record is the
 * message as sent, and splitting somebody's edited text back into dishes
 * would be guessing at it. Spreadsheets keep a quoted multi-line cell whole.
 *
 * Plain text on purpose. It is the lightest export there is — no library, no
 * file handling, no download that an installed app on iOS might refuse — and
 * it pastes straight into a spreadsheet or a message.
 */
export function toCsv(history) {
  const rows = [HISTORY_COLUMNS.join(",")];
  for (const e of history ?? []) {
    const d = new Date(e?.at);
    const ok = !Number.isNaN(d.getTime());
    const date = ok ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "";
    const time = ok ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
    rows.push([
      date, time, KIND_LABEL[e?.kind ?? "night"] ?? "", e?.where ?? "",
      textOf(e), e?.total || "",
    ].map(cell).join(","));
  }
  return rows.join("\n");
}
