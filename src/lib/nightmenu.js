import night from "../data/night-menu.json";

/**
 * The night canteens: a priced list per hostel, the same every night.
 *
 * Nothing like the day mess, which is a week. These are shops — you read them
 * to decide what to order at 1am, so the useful operations are "show me only
 * the vegetarian things" and "find the thing I want".
 */

export const CANTEENS = night.hostels;

export const canteenById = (id) =>
  CANTEENS.find((c) => c.id === id) ?? CANTEENS[0] ?? null;

/**
 * What the diet filters mean.
 *
 * "Veg" is strict — no egg — because that is what the word means to the people
 * who need the filter. "No meat" is the looser one for people who eat egg.
 *
 * An item whose diet could not be determined passes every filter and is marked
 * on screen. Hiding it from "Veg" would lose it; including it silently would
 * be telling somebody it is vegetarian when nobody has checked.
 */
export const DIET_FILTERS = [
  { id: "all", label: "Everything", keep: () => true },
  { id: "veg", label: "Veg only", keep: (d) => d === "veg" || d === "unknown" },
  { id: "nomeat", label: "No meat", keep: (d) => d !== "non-veg" },
];

export const DIET_LABEL = {
  veg: "Veg", egg: "Egg", "non-veg": "Non-veg", unknown: "Unconfirmed",
};

const norm = (s) => String(s ?? "").toLowerCase();

/**
 * One canteen's menu, filtered by diet and by a search.
 *
 * Empty categories are dropped rather than left as headings with nothing
 * under them — an empty section reads as a loading bug.
 */
export function filterMenu(canteen, { diet = "all", query = "" } = {}) {
  const rule = DIET_FILTERS.find((f) => f.id === diet) ?? DIET_FILTERS[0];
  const terms = norm(query).split(/\s+/).filter(Boolean);

  const out = [];
  for (const cat of canteen?.categories ?? []) {
    const items = cat.items.filter((i) => {
      if (!rule.keep(i.diet)) return false;
      if (!terms.length) return true;
      const hay = `${norm(i.name)} ${norm(cat.name)}`;
      return terms.every((t) => hay.includes(t));
    });
    if (items.length) out.push({ name: cat.name, items });
  }
  return out;
}

// ---------- the cart ----------

/**
 * A cart belongs to one canteen. You cannot order half from Tagore and half
 * from Ramanujan, so switching canteen with something in the basket has to
 * ask rather than quietly merge two menus into one order.
 */

const money = (p) => (typeof p === "number" ? p : Number(String(p).split("/")[0]) || 0);

/** Line totals and the bill, with the room-service charge the canteens add. */
export function billFor(canteen, lines) {
  const items = lines.map((l) => ({ ...l, total: money(l.price) * l.qty }));
  const subtotal = items.reduce((n, i) => n + i.total, 0);
  const delivery = Number(canteen?.room_service) || 0;
  return {
    items,
    count: items.reduce((n, i) => n + i.qty, 0),
    subtotal,
    delivery,
    total: subtotal + (subtotal > 0 ? delivery : 0),
  };
}

/**
 * The order, written out for a human to read.
 *
 * Deliberately short: quantities and names, then who and where. No prices —
 * the counter has its own, and a figure sent from here would be a second
 * source of truth that goes stale the moment the menu changes, inviting an
 * argument about what was quoted. No greeting line either; it lands in a
 * WhatsApp thread that already says who it is from.
 *
 * The bill still exists for the basket on screen. What a student is deciding
 * to spend and what the kitchen needs to read are different questions.
 */
export function orderText(canteen, lines, { reg = "", room = "", notes = "" } = {}) {
  const out = billFor(canteen, lines).items.map((i) => `${i.qty} x ${i.name}`);
  const blocks = [out.join("\n")];
  // Above the address, because it is about the food: whoever is cooking reads
  // to the end of the dishes and straight on into how to cook them.
  if (notes.trim()) blocks.push(`Instructions: ${notes.trim()}`);
  const who = [];
  if (room.trim()) who.push(`Room: ${room.trim()}`);
  if (reg.trim()) who.push(`Reg. No: ${reg.trim()}`);
  if (who.length) blocks.push(who.join("\n"));
  return blocks.join("\n\n");
}

/** How many items a filter would show, for the count line. */
export const countItems = (categories) =>
  categories.reduce((n, c) => n + c.items.length, 0);
