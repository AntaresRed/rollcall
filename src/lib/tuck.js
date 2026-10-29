import tuck from "../data/tuck.json";
import { DIET_FILTERS } from "./nightmenu";

/**
 * The tuck shops — one flat list each, without prices, which change too often
 * to keep up with. The photographed card is where a price is read.
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

/** Everywhere a tuck shop will walk to, in the order the workbook names them. */
export const LOCATIONS = tuck.locations ?? [];

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

/** Does this item pass the diet filter and the search? */
const matches = (item, rule, terms) => {
  if (!rule.keep(item.diet)) return false;
  if (!terms.length) return true;
  const hay = norm(item.name);
  return terms.every((t) => hay.includes(t));
};

const ruleFor = (diet) => DIET_FILTERS.find((f) => f.id === diet) ?? DIET_FILTERS[0];
const termsOf = (query) => norm(query).split(/\s+/).filter(Boolean);

/** One shop's list, filtered by diet and by a search. */
export function filterItems(shop, { diet = "all", query = "" } = {}) {
  const rule = ruleFor(diet);
  const terms = termsOf(query);
  return (shop?.items ?? []).filter((i) => matches(i, rule, terms));
}

/**
 * Whether this shop's running order has been read into sections.
 *
 * Not every card has been. A shop without them keeps the single flat list it
 * has always had, which is the honest rendering of a card nobody has grouped
 * yet — better than inventing one heading called "Everything".
 */
export const hasCategories = (shop) => (shop?.categories?.length ?? 0) > 0;

/**
 * The same filter, but kept in its sections.
 *
 * Null — not an empty array — for a shop with no sections, so the screen can
 * tell "grouped, and nothing matched" apart from "this shop is not grouped".
 *
 * Empty sections are dropped rather than left as headings with nothing under
 * them, the same way the night canteens do it: a heading that opens onto
 * nothing reads as a loading bug.
 */
export function filterGrouped(shop, { diet = "all", query = "" } = {}) {
  if (!hasCategories(shop)) return null;
  const rule = ruleFor(diet);
  const terms = termsOf(query);

  const out = [];
  for (const cat of shop.categories) {
    const items = (cat.items ?? []).filter((i) => matches(i, rule, terms));
    if (items.length) out.push({ name: cat.name, items });
  }
  return out;
}

/** The first callable number, the same rule the night canteens use. */
export const shopPhone = (shop) => {
  const digits = String(shop?.phone ?? "").split("/")[0].replace(/\D/g, "");
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
};

/** Every callable number, for the header. Orders still go to the first. */
export const shopPhones = (shop) =>
  String(shop?.phone ?? "").split("/")
    .map((p) => p.replace(/\D/g, ""))
    .filter((d) => /^[6-9]\d{9}$/.test(d));

// ---------- the basket ----------

/**
 * The basket's lines and how many things are in it.
 *
 * One line per dish. A basket saved while prices were still shown could hold
 * the same dish twice, once at each printed price; those fold into one line
 * here, since nothing on screen could tell them apart any more.
 */
export function basketFor(lines) {
  const items = [];
  for (const { name, qty } of lines ?? []) {
    const at = items.find((i) => i.name === name);
    if (at) at.qty += qty;
    else items.push({ name, qty });
  }
  return { items, count: items.reduce((n, i) => n + i.qty, 0) };
}

/** The order, for somebody at the counter to read. */
export const itemLine = (i) => `${i.qty} x ${i.name}`;

export function orderText(lines, { place = "", notes = "" } = {}) {
  const blocks = [basketFor(lines).items.map(itemLine).join("\n")];
  if (notes.trim()) blocks.push(`Instructions: ${notes.trim()}`);
  if (place.trim()) blocks.push(`Deliver to: ${place.trim()}`);
  return blocks.join("\n\n");
}
