import students from "../data/students.json";

/**
 * The cohort's own contact list.
 *
 * Deliberately its own module, and imported only by the Student contacts
 * screen — which App loads lazily. That keeps four hundred-odd phone numbers
 * out of the chunk every student downloads on first paint, and out of the one
 * that renders their timetable.
 *
 * Kept separate from ./directory for the same reason those two build scripts
 * are separate: the faculty directory is the institute's published office
 * contacts, this is a list the cohort collected itself, and they change on
 * completely different cycles.
 */

const lower = (s) => String(s ?? "").toLowerCase();

/** "0446/62" and "9038 112791" search as "044662" and "9038112791", so a
 *  registration number typed without its slash, or a number typed with the
 *  spaces it is displayed with, both still find the person. */
const squash = (s) => lower(s).replace(/[^a-z0-9]/g, "");

// Built once at module load. The search box fires on every keystroke and the
// list is static, so there is nothing to gain from rebuilding it per query.
const STUDENTS = students.map((p) => {
  const text = [p.name, p.reg, p.phone].filter(Boolean).join(" ");
  return { ...p, _text: lower(text), _squashed: squash(text) };
});

export const studentCount = STUDENTS.length;

/** How many have no number on file — surfaced on the screen so a blank field
 *  reads as a known gap rather than a rendering fault. */
export const studentsMissingPhone = STUDENTS.filter((p) => !p.phone).length;

// Shared with the POR contact screen, and living in ./phone so that neither
// screen's data is dragged into the other's chunk by the import.
export { prettyPhone, telHref, whatsAppHref } from "./phone";

/**
 * Search by name, registration number or phone.
 *
 * Every token has to match something, so "agrawal 021" narrows rather than
 * returning everyone called Agrawal plus everyone whose number starts 021.
 */
export function searchStudents(query = "") {
  const tokens = lower(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return STUDENTS;

  return STUDENTS.filter((p) =>
    tokens.every((t) => {
      // A token of pure punctuation squashes to "", and every string contains
      // the empty string — so without this guard a query of "(((" matched the
      // entire batch instead of nobody.
      const flat = squash(t);
      return p._text.includes(t) || (flat !== "" && p._squashed.includes(flat));
    }));
}
