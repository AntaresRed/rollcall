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

// ---------- near misses ----------

/**
 * Suggestions for a search that did not quite land.
 *
 * The search itself is a strict substring match, which is right — you type
 * "momo" and get momos. It fails on the two things people actually do at 1am:
 * mistype ("chiken"), and half-remember a name ("manchuria", "schezuan").
 * Both leave you looking at an empty menu that has the dish on it.
 *
 * Character bigrams rather than an edit distance: they cost one pass, they do
 * not care where in the word the mistake is, and a menu is full of long names
 * that differ by one syllable. The whole comparison runs over a few hundred
 * short strings only while somebody is typing, which is nothing.
 */

const letters = (s) => norm(s).replace(/[^a-z0-9]+/g, " ").trim();

/** A word counts as accounted for by the name at about this likeness. */
const accountedFor = (score) => score >= 0.5;

function bigrams(s) {
  const out = new Map();
  for (let i = 0; i < s.length - 1; i += 1) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Dice coefficient: shared bigrams over total bigrams, 0 to 1. */
function dice(a, b) {
  let total = 0;
  for (const n of a.values()) total += n;
  for (const n of b.values()) total += n;
  if (!total) return 0;
  let shared = 0;
  for (const [g, n] of a) shared += Math.min(n, b.get(g) ?? 0);
  return (2 * shared) / total;
}

/**
 * How alike two names are, 0 to 1.
 *
 * A substring is a whole match — "roll" is not merely similar to "Veg Roll".
 * A shared word beginning is worth a bonus on top of the raw score, because
 * on a menu that is nearly always the same dish: chicken/chiken,
 * manchurian/manchuria, paneer/paner.
 */
export function similarity(query, name) {
  const q = letters(query);
  const n = letters(name);
  if (!q || !n) return 0;
  if (n.includes(q)) return 1;

  // Whole-string first, then the best single word against the best single
  // word. Menu names carry a lot of scaffolding — "Special Cold Coffee" is
  // mostly not the word you typed — and comparing the whole thing buries one
  // near-miss word under all the others. Words shorter than four letters are
  // left out of that pass: "S/C", "Veg" and "Hot" match everything faintly
  // and nothing usefully.
  let best = dice(bigrams(q), bigrams(n));
  const qs = q.split(" ").filter((w) => w.length >= 4);
  const ns = n.split(" ").filter((w) => w.length >= 4);
  let covered = 0;
  for (const a of qs) {
    let mine = 0;
    for (const b of ns) {
      const d = dice(bigrams(a), bigrams(b));
      if (d > mine) mine = d;
    }
    if (accountedFor(mine)) covered += 1;
    if (mine > best) best = mine;
  }

  // How much of what was typed the name actually accounts for. Without it
  // every chicken dish on the card ties for "buttar chiken", and the one the
  // student obviously meant is buried among its cousins by alphabet alone.
  if (qs.length > 1) best += 0.12 * (covered / qs.length);

  // A shared word beginning is worth a little more on top: on a menu that is
  // nearly always the same dish — chicken/chiken, manchurian/manchuria.
  let bonus = 0;
  for (const a of q.split(" ")) {
    if (a.length < 3) continue;
    for (const b of n.split(" ")) {
      // Both sides have to be a real word. Without this, the lone "C" in
      // "Chicken S/C Soup" handed a bonus to every query starting with c,
      // and that soup outranked Butter Chicken for "buttar chiken".
      if (b.length < 3) continue;
      if (b.startsWith(a) || a.startsWith(b)) bonus = 0.15;
    }
  }
  return Math.min(1, best + bonus);
}

/**
 * Tuned against the real menus rather than guessed: below this, "chicken"
 * starts dragging in every fried rice on the card, which is worse than
 * showing nothing — a suggestion list you have to filter yourself is just
 * more menu.
 */
export const SIMILAR_ENOUGH = 0.45;

/**
 * Items close to what was typed, minus the ones already on screen.
 *
 * Diet is honoured exactly as the main list honours it. A suggestion is still
 * the app putting a dish in front of somebody, and quietly slipping chicken
 * past a vegetarian filter because it was only a suggestion would be the
 * worst bug on this screen.
 */
export function similarItems(canteen, query, { diet = "all", exclude = [], limit = 6 } = {}) {
  const q = letters(query);
  if (q.length < 3) return [];

  const seen = new Set(exclude.map((n) => norm(n)));
  const rule = DIET_FILTERS.find((f) => f.id === diet) ?? DIET_FILTERS[0];
  const out = [];

  for (const cat of canteen?.categories ?? []) {
    for (const item of cat.items) {
      if (seen.has(norm(item.name))) continue;
      if (!rule.keep(item.diet)) continue;
      const score = similarity(query, item.name);
      if (score >= SIMILAR_ENOUGH) out.push({ ...item, category: cat.name, score });
    }
  }

  // Ties broken by name so the list does not reshuffle between renders.
  out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return out.slice(0, limit);
}
