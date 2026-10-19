import menu from "../data/menu.json";
import { withLive } from "./live";

/**
 * The day mess menu, one week per hostel.
 *
 * Bundled, and then overlaid with whatever a mess secretary has published
 * from the POR dashboard. The bundle stays because the one moment a student
 * wants this most is standing in a corridor with three bars of signal; the
 * overlay is fetched once at boot, so this screen never waits on the network.
 */

export const MEALS = menu.meals;

/** Every hostel, each one its published menu if it has one. A function, not
 *  a constant, because what is live can change after this module loads. */
export const hostels = () => withLive("day-mess", menu.hostels);

/** The hostel as the build left it, before anything was published over it. */
export const bundledHostel = (id) => menu.hostels.find((h) => h.id === id) ?? null;

/** Monday-first, matching the sheets and the rest of the app. */
const ORDER = ["Monday", "Tuesday", "Wednesday", "Thursday",
               "Friday", "Saturday", "Sunday"];

export const hostelById = (id) => {
  const all = hostels();
  return all.find((h) => h.id === id) ?? all[0] ?? null;
};

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
