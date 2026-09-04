/**
 * What you have sent to the night canteen — a record of intent, not of dinner.
 *
 * The app hands a written-out order to WhatsApp and the student presses send.
 * Nothing here can see what happened next: whether it was sent at all, whether
 * a line was edited in the thread, whether something was added over the phone,
 * whether the counter had already closed. So this records the basket at the
 * moment it was handed over, and the screen says plainly that that is what it
 * is. Calling it "your orders" would be claiming knowledge the app does not
 * have.
 *
 * Prices are deliberately not kept. A price recorded tonight is wrong the day
 * the canteen reprints its menu, and a stale figure in a history reads as
 * fact — the same reason the order message itself carries no money. What you
 * ordered is durable; what it cost is not.
 *
 * Local to the device, in the same store as the basket. That is a real limit
 * — a phone and a laptop keep separate histories, and clearing site data
 * empties both — and it is the honest cost of holding nobody's dinner habits
 * and room number on a server.
 */

const STORE = "iimpresent.night.orders";

/** Twenty is a season of late nights, and a few kilobytes. */
export const CAP = 20;

/** Two taps on the same basket inside this window are one order, not two. */
const SAME_ORDER_MINS = 3;

/** Just the countable parts. Explicitly rebuilt rather than spread, so a new
 *  field on a cart line can never reach the history without being put here. */
const strip = (lines) =>
  (lines ?? [])
    .filter((l) => l && l.name)
    .map((l) => ({ name: String(l.name), qty: Number(l.qty) || 1 }));

const sameItems = (a, b) =>
  a.length === b.length &&
  a.every((l, i) => l.name === b[i].name && l.qty === b[i].qty);

/**
 * One basket, as it was handed over.
 *
 * The canteen's name is copied in rather than looked up later: a canteen can
 * be renamed in the spreadsheet, and a history that silently retitles what
 * you ordered last month is worse than one that is a little out of date.
 */
export function entryFor(canteen, lines, now = new Date()) {
  return {
    at: now.toISOString(),
    canteen: canteen?.id ?? null,
    where: canteen?.name ?? "",
    items: strip(lines),
  };
}

/**
 * The new history, newest first.
 *
 * Pure, so the awkward parts — the cap, and the double tap — are testable
 * without a browser. Returns the list unchanged when there is nothing to
 * record, because an empty basket cannot have been ordered.
 */
export function appendOrder(history, entry, cap = CAP) {
  const list = Array.isArray(history) ? history : [];
  if (!entry?.items?.length) return list;

  // Opening WhatsApp and coming back to tap again is one order being sent
  // once, not two dinners. Only the identical basket at the same canteen
  // within a few minutes collapses; anything else is somebody ordering twice,
  // which people genuinely do.
  const top = list[0];
  if (top && top.canteen === entry.canteen && sameItems(top.items, entry.items)) {
    const gap = (new Date(entry.at) - new Date(top.at)) / 60000;
    if (gap >= 0 && gap < SAME_ORDER_MINS) return [entry, ...list.slice(1)];
  }

  return [entry, ...list].slice(0, cap);
}

/** Total things, not lines — three momos and a roll is four items. */
export const itemCount = (entry) =>
  (entry?.items ?? []).reduce((n, i) => n + (Number(i.qty) || 0), 0);

// ---------- the device's copy ----------

export function readOrders() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "null");
    return Array.isArray(raw) ? raw.filter((e) => e?.at && e?.items?.length) : [];
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
export function recordOrder(canteen, lines, now = new Date()) {
  return write(appendOrder(readOrders(), entryFor(canteen, lines, now)));
}

export const clearOrders = () => write([]);

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
