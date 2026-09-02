/**
 * How to actually find a room.
 *
 * Hand-written, and deliberately not part of catalogue.json: that file is
 * regenerated wholesale from the institute spreadsheet by
 * scripts/build_catalogue.py, so anything written into it by hand is lost the
 * next time the schedule changes. These directions come from people who know
 * the campus, not from a sheet, so they live where a rebuild can't reach them.
 *
 * Keyed loosely — see `key()` — because the venue string reaching this module
 * comes from a spreadsheet cell that has spelled the same room "L-4", "L4"
 * and "L 4" in different terms, and a wayfinding note going missing over a
 * hyphen is exactly the failure this is meant to prevent.
 */

/** "Amphi (East-150)" and "amphi east 150" both reduce to "amphieast150". */
const key = (venue) => String(venue ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Rooms that share a landing share their directions, written once so a pair
// cannot drift apart. The first-year sections live in these six.
const NAB_FIRST_LEFT =
  "NAB first floor, on your left when you climb up the stairs, right if you come from lift.";
const NAB_SECOND_LEFT =
  "NAB second floor, on your left when you climb up the stairs, right if you come from lift.";
const NAB_SECOND_RIGHT =
  "NAB second floor, on your right when you climb up the stairs, left if you come from lift.";
const NAB_FOURTH =
  "NAB 4th floor, on your left when you climb up the stairs, right if you come up by the lift.";

// Grouped by building, which is the order somebody checking these against the
// campus would walk them in.
const NOTES = new Map([
  // NAB
  ["Amphi (East-150)", "NAB Ground floor, first Amphi towards the side of Auditorium."],
  ["Amphi (West-100)", "NAB second floor, towards the side of the Auditorium."],
  ["N-22", "NAB first floor, on your right when you climb up the stairs, left if you come from lift."],
  ["L-21", NAB_FIRST_LEFT],
  ["L-22", NAB_FIRST_LEFT],
  ["L-31", NAB_SECOND_LEFT],
  ["L-32", NAB_SECOND_LEFT],
  ["N-31", NAB_SECOND_RIGHT],
  ["N-32", NAB_SECOND_RIGHT],
  ["L-51", NAB_FOURTH],
  ["L-52", NAB_FOURTH],
  // OAB
  ["L-4", "OAB Ground floor, keep walking straight from MBA office, cross L1 & L2."],
  ["L-2", "OAB Ground floor, opposite of L1."],
].map(([venue, note]) => [key(venue), note]));

/** The venues these directions were written for, as written — for the test
 *  that checks each one still matches something the catalogue publishes. */
export const NOTED_VENUES = [
  "Amphi (East-150)", "Amphi (West-100)", "N-22",
  "L-21", "L-22", "L-31", "L-32", "N-31", "N-32",
  "L-51", "L-52", "L-4", "L-2",
];

/**
 * Directions to a venue, or null when none have been written for it.
 *
 * Null is the normal case — most rooms have no note, and the chip renders
 * exactly as before for those rather than growing a control that reveals
 * nothing.
 */
export const venueNote = (venue) => (venue ? NOTES.get(key(venue)) ?? null : null);
