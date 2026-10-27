import CAMPUS from "../data/campus.json";

/**
 * Medical help, shops, food, facilities and each hostel's staff — the campus
 * info sheet, built by scripts/build_campus.py.
 *
 * The reps, night messes and tuck shops in it are copies of por.json,
 * night-menu.json and tuck.json taken at build time; test/logic.mjs holds
 * the two sides together.
 */

export const MEDICAL = CAMPUS.medical;
export const PLACES = CAMPUS.places;
export const HOSTELS = CAMPUS.hostels;

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** The weekday's name as the doctor's schedule writes it. */
export const dayName = (now) => DAYS[now.getDay()];

/**
 * Which hostel tab to open on, from the hostel the mail forms remember.
 * The forms say "Tagore" where the info sheet says WH. Annexe has no tab of
 * its own, and neither does a hostel nobody has typed yet: both open on the
 * first tab rather than guessing.
 */
export function hostelTab(saved) {
  const h = String(saved ?? "").trim().toUpperCase();
  const id = h === "TAGORE" ? "WH" : h;
  return HOSTELS.some((x) => x.id === id) ? id : HOSTELS[0]?.id ?? null;
}
