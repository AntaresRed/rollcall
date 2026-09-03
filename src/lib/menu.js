import menu from "../data/menu.json";

/**
 * The day mess menu, one week per hostel.
 *
 * Bundled rather than fetched: it is small, it changes about once a term, and
 * the one moment a student wants it most is standing in a corridor with three
 * bars of signal.
 */

export const MEALS = menu.meals;
export const HOSTELS = menu.hostels;

/** Monday-first, matching the sheets and the rest of the app. */
const ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday",
               "Friday", "Saturday", "Sunday"];

export const hostelById = (id) =>
  HOSTELS.find((h) => h.id === id) ?? HOSTELS[0] ?? null;

/** Today's weekday name, in the same vocabulary the sheets use. */
export const todayName = (now = new Date()) => ORDER[(now.getDay() + 6) % 7];

/**
 * One hostel's week, Monday to Sunday.
 *
 * This used to start on today and wrap, on the reasoning that a menu answers
 * "what is there now". It read badly: opening it on a Wednesday put Monday
 * and Tuesday at the very bottom, so the page looked like a week with a
 * strange beginning rather than a week. A menu is also something people scan
 * ahead in — "what is Friday dinner" — and that wants the calendar order
 * everyone already holds in their head.
 *
 * Today is marked instead, which finds it without reordering anything.
 */
export function weekOf(hostel) {
  const days = hostel?.days ?? [];
  return ORDER.map((name) => days.find((d) => d.day === name)).filter(Boolean);
}
