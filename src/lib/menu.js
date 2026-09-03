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
 * One hostel's week, starting from today and wrapping round.
 *
 * All seven days are always there — the week reads forwards from today rather
 * than being trimmed — but the day you are actually standing in comes first,
 * because the question this screen answers most often is "what is there
 * tonight". Today is also marked, so it is findable at a glance once you have
 * scrolled past it.
 */
export function weekOf(hostel, now = new Date()) {
  const days = ORDER.map((name) => (hostel?.days ?? []).find((d) => d.day === name))
    .filter(Boolean);
  const start = days.findIndex((d) => d.day === todayName(now));
  if (start <= 0) return days;
  return [...days.slice(start), ...days.slice(0, start)];
}
