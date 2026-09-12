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
 * What is kept: the items and quantities, what each line cost, which canteen,
 * when, and the room and registration number the order was placed under. The
 * price is the figure the basket worked out that night, not today's — which
 * is the point of a record, and the reason it should be read as history
 * rather than as a current price list.
 *
 * Local to the device. That is a real limit — a phone and a laptop keep
 * separate histories, and clearing site data empties both — and it is the
 * reason the export below exists: a copy you keep is the only copy that
 * outlives the browser.
 */

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

/** Two taps on the same basket inside this window are one order, not two. */
const SAME_ORDER_MINS = 3;

/** Explicitly rebuilt rather than spread, so a new field on a cart line can
 *  never reach the history without being put here on purpose. */
const strip = (lines) =>
  (lines ?? [])
    .filter((l) => l && l.name)
    .map((l) => ({
      name: String(l.name),
      qty: Number(l.qty) || 1,
      // The line total as the basket worked it out, not the printed price:
      // that is the figure the order was actually placed at.
      price: Number(l.total ?? l.price) || 0,
    }));

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
export function entryFor(canteen, lines, { room = "", reg = "", now = new Date() } = {}) {
  const items = strip(lines);
  return {
    at: now.toISOString(),
    canteen: canteen?.id ?? null,
    where: canteen?.name ?? "",
    items,
    total: items.reduce((n, i) => n + i.price, 0),
    room: String(room ?? "").trim(),
    reg: String(reg ?? "").trim(),
  };
}

/**
 * The new history, newest first.
 *
 * Pure, so the awkward parts — the cap, and the double tap — are testable
 * without a browser. Returns the list unchanged when there is nothing to
 * record, because an empty basket cannot have been ordered.
 */
export function appendOrder(history, entry, { cap = CAP, days = KEEP_DAYS } = {}) {
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

  return prune([entry, ...list], { cap, days, now: new Date(entry.at) });
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
 * two identical baskets sent on different nights are different orders, and
 * the same basket cannot be recorded twice inside the collapse window above.
 *
 * Whole orders only, never lines within one. An order is the unit that was
 * handed over, and letting somebody delete three of its four dishes would
 * leave a record claiming something was sent that never was — which is the
 * one thing this screen exists to promise it does not do.
 *
 * Pure, and separate from the write below, for the same reason `appendOrder`
 * is: the rule is worth testing without a browser.
 */
export function withoutOrder(history, at) {
  if (!at) return Array.isArray(history) ? history : [];
  return (history ?? []).filter((e) => e?.at !== at);
}

/** Total things, not lines — three momos and a roll is four items. */
export const itemCount = (entry) =>
  (entry?.items ?? []).reduce((n, i) => n + (Number(i.qty) || 0), 0);

// ---------- the device's copy ----------

export function readOrders(now = new Date()) {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "null");
    if (!Array.isArray(raw)) return [];
    // Pruned on the way out as well as on the way in, so a history left
    // untouched for a term still ages out rather than sitting there for ever.
    return prune(raw.filter((e) => e?.at && e?.items?.length), { now });
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
export function recordOrder(canteen, lines, { room = "", reg = "", now = new Date() } = {}) {
  return write(appendOrder(readOrders(now), entryFor(canteen, lines, { room, reg, now })));
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

export const HISTORY_COLUMNS = [
  "Date", "Time", "Mess", "Item", "Qty", "Price", "Order total", "Room", "Reg No",
];

/** What the saved file is called. Dated, so exporting twice in a term leaves
 *  two files rather than a puzzle about which is which. */
export function historyFilename(now = new Date(), ext = "csv") {
  const d = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  return `night-orders-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.${ext}`;
}

/**
 * The history as CSV — one row per item, order details repeated.
 *
 * A row per item rather than per order because that is the shape anything
 * else can read: a spreadsheet can group it back up, but it cannot split a
 * cell holding four dishes.
 *
 * Plain text on purpose. It is the lightest export there is — no library, no
 * file handling, no download that an installed app on iOS might refuse — and
 * it pastes straight into a spreadsheet or a message.
 */
export function toCsv(history) {
  const rows = [HISTORY_COLUMNS.join(",")];
  for (const e of history ?? []) {
    const d = new Date(e?.at);
    const date = Number.isNaN(d.getTime())
      ? "" : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const time = Number.isNaN(d.getTime()) ? "" : `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    for (const i of e?.items ?? []) {
      rows.push([
        date, time, e.where ?? "", i.name, i.qty, i.price,
        e.total ?? "", e.room ?? "", e.reg ?? "",
      ].map(cell).join(","));
    }
  }
  return rows.join("\n");
}
