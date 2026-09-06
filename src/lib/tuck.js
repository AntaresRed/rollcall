import tuck from "../data/tuck.json";
import { DIET_FILTERS } from "./nightmenu";

/**
 * The tuck shops — one flat priced list each.
 *
 * Not categorised like the night canteens, because the card on the counter
 * isn't: it is one numbered run from sandwiches to Maggi. Sections invented
 * here would be a shape the shop does not have.
 *
 * The diet filter is borrowed from the night menu rather than redefined, so
 * "Veg only" means the same strict thing on both screens. It only appears
 * when somebody has actually filled the Diet column in — see `hasDiet`.
 */

export const SHOPS = tuck.shops;

/** Everywhere a tuck shop will walk to, in the order the tariff names them. */
export const LOCATIONS = tuck.locations ?? [];

/**
 * What this shop charges to carry an order to that corner of campus.
 *
 * Two shapes, because the two shops genuinely differ. Tagore charges one flat
 * rate wherever it goes; Mohan Da charges by distance — fifteen across most
 * of campus, twenty out to LVH, MDC and the family quarters. A shop with a
 * tariff and no location chosen yet charges nothing, because nobody has said
 * where it is going.
 */
export function deliveryFor(shop, location) {
  const zones = shop?.zones ?? [];
  if (!zones.length) return Number(shop?.delivery) || 0;
  return zones.find((z) => z.location === location)?.fee ?? 0;
}

/** Whether this shop's price depends on where it is going. */
export const chargesByPlace = (shop) => (shop?.zones?.length ?? 0) > 0;

export const shopById = (id) => SHOPS.find((s) => s.id === id) ?? SHOPS[0] ?? null;

const norm = (s) => String(s ?? "").toLowerCase();

/**
 * Whether this shop's card has been diet-checked at all.
 *
 * All-unknown means nobody has been through it yet, and a filter offering to
 * narrow by something nobody has recorded is a control that does nothing. It
 * appears by itself once the spreadsheet's Diet column is filled in.
 */
export const hasDiet = (shop) =>
  (shop?.items ?? []).some((i) => i.diet && i.diet !== "unknown");

/** One shop's list, filtered by diet and by a search. */
export function filterItems(shop, { diet = "all", query = "" } = {}) {
  const rule = DIET_FILTERS.find((f) => f.id === diet) ?? DIET_FILTERS[0];
  const terms = norm(query).split(/\s+/).filter(Boolean);

  return (shop?.items ?? []).filter((i) => {
    if (!rule.keep(i.diet)) return false;
    if (!terms.length) return true;
    const hay = norm(i.name);
    return terms.every((t) => hay.includes(t));
  });
}

/** The first callable number, the same rule the night canteens use. */
export const shopPhone = (shop) => {
  const digits = String(shop?.phone ?? "").split("/")[0].replace(/\D/g, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
};

// ---------- the basket ----------

/**
 * The prices an item can be ordered at.
 *
 * Twenty-five of these sixty-three items are printed with more than one
 * price: "40 / 60" for without and with cheese, "45 (65)" the same idea in
 * brackets, "50 / 70 / 75 / 75" for four fillings. A basket has to know which
 * one you meant before it can add anything up.
 *
 * Only the numbers are read. The tempting next step — splitting the NAME on
 * its slashes to label each price — is guessing, and it is wrong often enough
 * to matter: "Pav Bhaji / Extra Pav" is two different dishes, "Paneer Masala
 * Patty / with cheese" is one dish twice, and "Chicken / Veg Steamed Momos"
 * is two dishes at one price. So the name is kept whole and the price is what
 * distinguishes the line. The counter reads both and knows exactly what to
 * make.
 */
export function priceOptions(item) {
  const found = String(item?.price ?? "").match(/\d+/g) ?? [];
  const seen = [];
  for (const n of found.map(Number)) {
    if (Number.isFinite(n) && !seen.includes(n)) seen.push(n);
  }
  return seen;
}

/** A basket line is an item AT a price — the same dish twice at two prices is
 *  two lines, because it is two different things to cook. */
export const lineKey = (name, price) => `${name}@@${price}`;

/**
 * The bill, including whatever the shop charges to bring it over.
 *
 * The charge rides on the shop rather than the basket: Tagore adds six rupees
 * and Mohan Da adds nothing, and somebody choosing between the two should see
 * that before they decide. It is only ever added to a basket with something
 * in it — an empty basket costs nothing, not the delivery fee on its own.
 */
export function billFor(shop, lines, place = "") {
  const items = (lines ?? []).map((l) => ({ ...l, total: l.price * l.qty }));
  const subtotal = items.reduce((n, i) => n + i.total, 0);
  const delivery = deliveryFor(shop, place);
  return {
    items,
    count: items.reduce((n, i) => n + i.qty, 0),
    subtotal,
    delivery: subtotal > 0 ? delivery : 0,
    total: subtotal + (subtotal > 0 ? delivery : 0),
  };
}

/**
 * The order, for somebody at the counter to read.
 *
 * The price rides along on every line here, unlike the night canteen's
 * message where it was dropped. It is not decoration: on a card where a third
 * of the items are printed at two prices, the number is the only thing that
 * says which one was ordered. The total is included because it is what gets
 * paid.
 */
export function orderText(shop, lines, { place = "", notes = "" } = {}) {
  const bill = billFor(shop, lines, place);
  const out = bill.items.map((i) => `${i.qty} x ${i.name} — Rs ${i.total}`);
  // The breakdown only appears when there is something to break down. A
  // subtotal that equals the total is a line that makes the reader check.
  const sum = bill.delivery
    ? `Subtotal: Rs ${bill.subtotal}\nDelivery: Rs ${bill.delivery}\nTotal: Rs ${bill.total}`
    : `Total: Rs ${bill.total}`;
  const blocks = [out.join("\n"), sum];
  if (notes.trim()) blocks.push(`Instructions: ${notes.trim()}`);
  if (place.trim()) blocks.push(`Deliver to: ${place.trim()}`);
  return blocks.join("\n\n");
}

// ---------- paying ----------

/** A UPI address: something@bank. Deliberately strict — a malformed one sends
 *  money nowhere useful, and a guessed one sends it to a stranger. */
export const VPA = /^[a-z0-9.\-_]{2,}@[a-z]{2,}$/i;

export const shopUpi = (shop) => {
  const vpa = String(shop?.upi ?? "").trim();
  return VPA.test(vpa) ? vpa : null;
};

/**
 * A UPI request, as a link the phone's own apps answer.
 *
 * This app never touches the money. The link opens whichever UPI app the
 * student already uses, with the shop and the amount filled in, and they
 * approve it there. Nothing here can tell whether it went through.
 *
 * Null when the shop has no UPI address on file. There is no way to derive
 * one from a phone number — an address is registered, not calculated — and
 * inventing something that looks plausible would send real money to whoever
 * happens to own it.
 */
export function upiHref(shop, { amount = 0, note = "" } = {}) {
  const pa = shopUpi(shop);
  if (!pa) return null;
  const q = [
    `pa=${encodeURIComponent(pa)}`,
    `pn=${encodeURIComponent(shop.name ?? "Tuck shop")}`,
    "cu=INR",
  ];
  if (amount > 0) q.push(`am=${encodeURIComponent(amount.toFixed(2))}`);
  if (note.trim()) q.push(`tn=${encodeURIComponent(note.trim().slice(0, 50))}`);
  return `upi://pay?${q.join("&")}`;
}


/** The shop's own printed QR, if one has been added. */
export const shopQr = (shop) => shop?.qr ?? null;

/**
 * A warning to show above the pay buttons.
 *
 * Exists for one situation: the address on file is a stand-in, and money sent
 * to it reaches the wrong person. That is not a thing to leave implicit in a
 * spreadsheet cell — whoever is looking at the screen is about to pay.
 */
export const payNote = (shop) => {
  const note = String(shop?.pay_note ?? "").trim();
  return note || null;
};
