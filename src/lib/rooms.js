import rooms from "../data/rooms.json";

/**
 * How to find a room: J Maps, and the directions behind every venue chip and
 * faculty office in the app.
 *
 * Generated from the rooms workbook by scripts/build_rooms.py, never written
 * here by hand — it is the one place a description lives, so the venue chip
 * on Today and the row in J Maps cannot say different things about one room.
 *
 * Bundled rather than fetched, like the menus: it is small (about 3 KB on the
 * wire), it changes once in a long while, and the moment someone needs it is
 * standing in a corridor.
 */

/** NAB, OAB, CDPO Building, Tata Hall — in the order J Maps shows them. */
export const BUILDINGS = rooms.buildings;

const byId = new Map(BUILDINGS.map((b) => [b.id, b]));

/**
 * "Amphi (East-150)", "amphi east 150" and "AMPHI-EAST-150" all reduce to
 * "amphieast150". The venue strings reaching this module come from a
 * spreadsheet that has spelled one room "L-4", "L4" and "L 4" in different
 * terms, and directions going missing over a hyphen is the failure this is
 * here to prevent.
 */
export const roomKey = (s) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

const listed = new Map();
for (const b of BUILDINGS) {
  for (const r of b.rooms) listed.set(roomKey(r.room), { ...r, building: b });
}

const aliases = new Map(
  Object.entries(rooms.aliases).map(([alias, room]) => [roomKey(alias), roomKey(room)]),
);

// NAB's K and M rooms open off a hallway, and CDPO's E and W rooms off one
// side of the building, so their directions belong to the group: the letter
// and the first digit (the floor, plus one). Any number in the group gets
// them — including faculty offices the room list never named.
const rules = new Map(
  rooms.rules.map((r) => [r.series.toLowerCase() + r.digit, { ...r, building: byId.get(r.building) }]),
);

/** "k504" -> the K-5xx rule. Needs a digit after the floor digit, so OAB's
 *  "L-4" is never read as an NAB room on the third floor. */
function ruleFor(k) {
  const m = /^([a-z])(\d)\d+$/.exec(k);
  return m ? rules.get(m[1] + m[2]) ?? null : null;
}

/**
 * Everything known about a room, or null.
 *
 * `{ room, floor, name, description, building }`, where `building` carries
 * its name and Google Maps link. A room only a rule covers comes back under
 * the name it was asked for, with the rule's floor and description.
 */
export function findRoom(venue) {
  const k = roomKey(venue);
  if (!k) return null;
  const own = listed.get(aliases.get(k) ?? k);
  if (own) return own;
  const rule = ruleFor(k);
  return rule
    ? { room: String(venue).trim(), floor: rule.floor, name: "", description: rule.description,
        building: rule.building }
    : null;
}

/** Just the directions, for the venue chip — null when there are none. */
export const venueNote = (venue) => findRoom(venue)?.description ?? null;

/**
 * Rooms matching a search, grouped by building in J Maps' order:
 * `[{ building, rooms }]`. Empty for a blank query.
 *
 * Every word has to match somewhere — the room number (with or without its
 * punctuation, so "k5" finds K-501), its name, its building, or its
 * directions ("tuck" finds the rooms by the tuck shop). A room number only a
 * rule knows is offered too: "K-504" isn't on any list, but it is in the K5
 * hallway all the same.
 */
export function searchRooms(query) {
  const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const hits = new Map();
  const add = (r) => {
    const id = r.building.id;
    if (!hits.has(id)) hits.set(id, []);
    if (!hits.get(id).some((x) => roomKey(x.room) === roomKey(r.room))) hits.get(id).push(r);
  };

  // The whole query as one room number first, so "K 504" is a room, not two words.
  const whole = findRoom(query);
  if (whole) add(whole);

  for (const r of listed.values()) {
    const k = roomKey(r.room);
    const text = `${r.room} ${r.name} ${r.building.name} ${r.description}`.toLowerCase();
    const matches = words.every((w) => {
      const wk = roomKey(w);
      return (wk && k.startsWith(wk)) || text.includes(w);
    });
    if (matches) add(r);
  }

  return BUILDINGS.filter((b) => hits.has(b.id)).map((b) => ({ building: b, rooms: hits.get(b.id) }));
}

/** The floors of a building that have rooms, ground first, each with its rooms. */
export function floorsOf(building) {
  const floors = new Map();
  for (const r of building?.rooms ?? []) {
    if (!floors.has(r.floor)) floors.set(r.floor, []);
    floors.get(r.floor).push(r);
  }
  return [...floors].map(([floor, list]) => ({ floor, rooms: list }));
}
