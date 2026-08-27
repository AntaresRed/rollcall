import { expectedSessions, hhmm, toMinutes, SLOT_ENDS, venueOf } from "./api";

/**
 * The timetable as an iCalendar file.
 *
 * One VEVENT per class meeting rather than a weekly RRULE with exceptions.
 * The term has two teaching windows with a gap, institute-wide break weeks
 * inside them, courses that run only one half, block courses on fixed dates,
 * and per-student reschedules on top of all of it. Every one of those is
 * already resolved correctly by expectedSessions(), and expressing the same
 * thing as recurrence rules plus EXDATEs would be re-deriving it in a second
 * notation that calendar clients then disagree about. A few hundred plain
 * events cannot be misread.
 *
 * Classes only. Term breaks and the mid-term gap decide which dates produce
 * an event; they are never events themselves.
 */

const PRODID = "-//IIMPresent//RollCall Timetable//EN";
const UID_DOMAIN = "rollcall.iimpresent";

// India has never observed DST, so the whole zone definition is one fixed
// offset — worth including so the file stays unambiguous if a student opens
// it on a laptop set to another timezone, which floating times would not.
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Asia/Kolkata",
  "X-LIC-LOCATION:Asia/Kolkata",
  "BEGIN:STANDARD",
  "DTSTART:19700101T000000",
  "TZOFFSETFROM:+0530",
  "TZOFFSETTO:+0530",
  "TZNAME:IST",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** RFC 5545 §3.3.11: backslash, semicolon and comma are escaped; a newline
 *  becomes a literal \n. */
const esc = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

/**
 * Fold to 75 octets per line, continuing with a leading space.
 *
 * Counted in UTF-8 bytes rather than characters, because course names carry
 * en dashes and curly quotes — splitting on a character count can leave a
 * line over the octet limit, and splitting mid-sequence would corrupt it.
 */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const out = [];
  let start = 0;
  let limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Never cut inside a multi-byte character: 10xxxxxx is a continuation.
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(new TextDecoder().decode(bytes.slice(start, end)));
    start = end;
    limit = 74;   // continuation lines carry a leading space
  }
  return out.join("\r\n ");
}

const pad = (n) => String(n).padStart(2, "0");

/** "2026-09-10" + "16:15" -> "20260910T161500", local to the TZID above. */
function localStamp(date, time) {
  const t = hhmm(time);
  return `${String(date).replace(/-/g, "")}T${t.replace(":", "")}00`;
}

function utcStamp(d) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * A number that rises with every export, so a re-import updates the events
 * already on the calendar instead of sitting alongside them.
 *
 * SEQUENCE is how iCalendar says "this is a newer revision of the event with
 * this UID"; a client that sees the same UID with a higher SEQUENCE replaces
 * what it holds. Minutes since 2020 keeps it monotonic, well inside the
 * 32-bit range for the next few thousand years, and doesn't require storing
 * anything between exports.
 */
const EPOCH_2020 = Date.UTC(2020, 0, 1);
export const exportSequence = (now = new Date()) =>
  Math.max(0, Math.floor((now.getTime() - EPOCH_2020) / 60000));

/**
 * The UID is the class row plus the date the meeting was *originally* due,
 * never the date it ended up on.
 *
 * That is what makes a reschedule an edit rather than a second event: move
 * Thursday's class to Saturday, export again, and the calendar recognises the
 * UID it already holds and shifts it. Keying on the new date would leave the
 * Thursday event behind on every calendar that had already imported it.
 */
const uidFor = (cls, originalDate) => `${cls.id}-${originalDate}@${UID_DOMAIN}`;

/**
 * Build the whole term's timetable as an iCalendar string.
 *
 * The window defaults to the term's own dates. `expectedSessions` needs a
 * bounded range, and a term is the natural one — a student re-exports next
 * term rather than carrying an unbounded calendar forward.
 */
export function buildTimetableIcs(classes, term, overrides = [], now = new Date()) {
  const from = term?.term_start;
  const to = term?.term_end;
  if (!from || !to) return { ics: null, count: 0, from: null, to: null };

  const sessions = expectedSessions(classes, term, { from, to }, overrides)
    .sort((a, b) =>
      a.date === b.date
        ? toMinutes(hhmm(a.cls.start_time)) - toMinutes(hhmm(b.cls.start_time))
        : a.date.localeCompare(b.date));

  const stamp = utcStamp(now);
  const seq = exportSequence(now);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(term.label ? `${term.label} timetable` : "Class timetable")}`,
    "X-WR-TIMEZONE:Asia/Kolkata",
    ...VTIMEZONE,
  ];

  for (const { cls, date, movedFrom } of sessions) {
    const start = hhmm(cls.start_time);
    const end = hhmm(cls.end_time) || SLOT_ENDS[start] || start;
    const detail = [cls.course_code, cls.section && `Section ${cls.section}`]
      .filter(Boolean)
      .join(" · ");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${uidFor(cls, movedFrom ?? date)}`,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${seq}`,
      `DTSTART;TZID=Asia/Kolkata:${localStamp(date, start)}`,
      `DTEND;TZID=Asia/Kolkata:${localStamp(date, end)}`,
      fold(`SUMMARY:${esc(cls.subject)}`),
    );

    const venue = venueOf(cls);
    if (venue) lines.push(fold(`LOCATION:${esc(venue)}`));
    if (detail) lines.push(fold(`DESCRIPTION:${esc(detail)}`));
    // A moved meeting is still the meeting the timetable published; saying so
    // explains the odd-looking date to whoever reads the calendar later.
    if (movedFrom) lines.push(fold(`COMMENT:${esc(`Rescheduled from ${movedFrom}`)}`));

    lines.push("TRANSP:OPAQUE", "END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return { ics: `${lines.join("\r\n")}\r\n`, count: sessions.length, from, to };
}

export const icsFilename = (term) =>
  `${(term?.label || "timetable").replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.ics`;

/**
 * Hand the file to the student.
 *
 * The share sheet is tried first because this is installed to the Home Screen
 * on iOS more often than not, and there a downloaded blob lands in Files with
 * no obvious route into Calendar — whereas the share sheet offers Calendar
 * directly. Everywhere else `canShare` is false for files and it falls
 * straight through to an ordinary download.
 */
export async function deliverIcs(filename, text) {
  const type = "text/calendar";

  try {
    const file = new File([text], filename, { type });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: filename });
      return "shared";
    }
  } catch (err) {
    // Dismissing the sheet is a decision, not a failure — don't then shove a
    // download at someone who just backed out of it.
    if (err?.name === "AbortError") return "cancelled";
  }

  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked late: Safari reads the blob after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return "downloaded";
}
