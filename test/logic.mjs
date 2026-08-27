/** Data-layer behaviour under bad or edge-case input. */
import {
  toMinutes, hhmm, pretty, inSession, breakOn, skipBudget, courseStats,
  expectedSessions, unmarkedSessions, occurrencesOn, attendanceKey, isoDate, weekdayOf,
} from "../src/lib/api.js";
import { facultyDirectory, facultyCount } from "../src/lib/directory.js";
import { buildTimetableIcs, exportSequence, icsFilename } from "../src/lib/ics.js";
import catalogue from "../src/data/catalogue.json";

let fail = 0;
const check = (name, cond) => {
  if (!cond) { fail++; console.log("  FAIL " + name); }
  else console.log("  ok   " + name);
};
const survives = (name, fn) => {
  try { fn(); check(name, true); }
  catch (e) { fail++; console.log("  FAIL " + name + " -> " + e.message); }
};

const term = {
  term_start: "2026-08-24", pre_mid_end: "2026-09-27",
  post_mid_start: "2026-10-05", term_end: "2026-11-22",
  breaks: [{ from_date: "2026-10-19", to_date: "2026-10-25", label: "Puja" }],
};

console.log("time helpers");
for (const v of [undefined, null, "", "xx", 5, {}, [], NaN])
  survives("toMinutes(" + JSON.stringify(v) + ")", () => toMinutes(v));
for (const v of [undefined, null, "", "xx", {}])
  survives("pretty(" + JSON.stringify(v) + ")", () => pretty(v));
check("hhmm strips seconds", hhmm("18:00:00") === "18:00");
check("toMinutes NaN on junk", Number.isNaN(toMinutes("nope")));

console.log("\nterm windows");
survives("inSession with null term", () => inSession("full", "2026-09-01", null));
survives("inSession with term lacking breaks", () =>
  inSession("full", "2026-09-01", { ...term, breaks: undefined }));
check("Puja excluded", inSession("full", "2026-10-21", term) === false);
check("gap between windows excluded", inSession("full", "2026-10-02", term) === false);

console.log("\nbudget");
check("3cr => 5 skips", skipBudget({ total_classes: 20, min_pct: 75 }).allowedAbsences === 5);
check("1.5cr => 2 skips", skipBudget({ total_classes: 10, min_pct: 80 }).allowedAbsences === 2);
survives("skipBudget()", () => skipBudget());
survives("skipBudget(null)", () => skipBudget(null ?? undefined));
check("zero total doesn't divide by zero",
  skipBudget({ total_classes: 0, min_pct: 75 }).allowedAbsences === 0);

console.log("\ncourseStats");
survives("empty", () => courseStats([], []));
survives("class with no credit fields", () => courseStats([{ id: "a", subject: "X" }], []));
survives("attendance for an unknown subject", () =>
  courseStats([{ id: "a", subject: "X", total_classes: 20, min_pct: 75 }],
              [{ subject: "Ghost", status: "present" }]));
const st = courseStats(
  [{ id: "a", subject: "X", total_classes: 20, min_pct: 75, credits: 3 }],
  [{ subject: "X", status: "present" }, { subject: "X", status: "absent" },
   { subject: "X", status: "cancelled" }]);
check("cancelled excluded from pct", st[0].pct === 50);
check("cancelled doesn't spend a skip", st[0].skipsLeft === 4);

console.log("\noccurrences");
const cls = [
  { id: "w", subject: "W", day_of_week: 1, start_time: "10:15", end_time: "11:30", term_phase: "full" },
  { id: "d", subject: "D", session_date: "2026-09-10", day_of_week: 4, start_time: "16:15", end_time: "17:45", term_phase: "full" },
];
survives("empty classes", () => expectedSessions([], term, { from: "2026-09-01", to: "2026-09-30" }));
survives("null overrides", () => expectedSessions(cls, term, { from: "2026-09-01", to: "2026-09-30" }, undefined));
survives("override pointing at a deleted class", () =>
  expectedSessions(cls, term, { from: "2026-09-01", to: "2026-09-30" },
    [{ class_id: "gone", original_date: "2026-09-07", new_date: "2026-09-08", new_start: "10:15" }]));
survives("from after to", () => expectedSessions(cls, term, { from: "2026-09-30", to: "2026-09-01" }));
const moved = expectedSessions(cls, term, { from: "2026-09-01", to: "2026-09-30" },
  [{ class_id: "w", original_date: "2026-09-07", new_date: "2026-09-09", new_start: "14:30", new_end: "15:45" }]);
check("vacated date empty", !moved.some(o => o.date === "2026-09-07"));
check("lands on new date/time",
  moved.some(o => o.date === "2026-09-09" && hhmm(o.cls.start_time) === "14:30"));
check("every occurrence has a cls", moved.every(o => o.cls && o.cls.subject));
check("every occurrence has usable times",
  moved.every(o => !Number.isNaN(toMinutes(hhmm(o.cls.start_time)))));

console.log("\ncatch-up");
survives("no classes", () => unmarkedSessions([], [], term, new Date("2026-09-10")));
survives("attendance with missing fields", () =>
  unmarkedSessions(cls, [{ subject: null, class_date: null, start_time: null }], term, new Date("2026-09-10")));
const um = unmarkedSessions(cls, [], term, new Date("2026-09-10T23:00:00"), 28, []);
check("catch-up entries are occurrences", um.every(o => o.cls && o.date));

console.log("\nkeys");
check("attendanceKey normalises seconds",
  attendanceKey("X", "2026-09-10", "16:15:00") === attendanceKey("X", "2026-09-10", "16:15"));




console.log("\nper-meeting phase (catalogue)");
try {
  const meob = catalogue.courses.find((c) => c.code === "MEOB");
  check("MEOB exists", Boolean(meob));
  if (meob) {
    const meetings = meob.sections.A;
    // Thu (post-mid only), Fri (unmarked in the grid -> applies both
    // halves, so one entry rather than a duplicate per phase), Sat
    // (pre-mid only). Auto-detected from the grid's own phase markers,
    // not a hand-written override.
    check("MEOB has 3 meetings", meetings.length === 3);
    check("exactly one pre_mid and one post_mid tagged meeting",
      meetings.filter((m) => m.phase === "pre_mid").length === 1 &&
      meetings.filter((m) => m.phase === "post_mid").length === 1);
    check("the Friday meeting carries no phase (runs all term)",
      meetings.find((m) => m.day === 5)?.phase === undefined);
    check("course-level phase is full, not pre/post",
      meob.phase === "full");
    check("3 credits / 20 classes since it spans the whole term",
      meob.credits === 3 && meob.total_classes === 20);
  }
} catch (err) {
  fail++; console.log("  FAIL catalogue check -> " + err.message);
}

console.log("\nfaculty directory");
survives("no arguments at all", () => facultyDirectory());
survives("junk query", () => facultyDirectory([], "((("));
survives("classes missing course_code", () => facultyDirectory([{ subject: "Bare" }], ""));
check("empty query returns everybody", facultyDirectory([], "").length === facultyCount);
check("every person has at least one office",
  facultyDirectory([], "").every((p) => p.offices.length > 0));
// Merged rather than listed twice: the sheet carries this person under their
// own name and again under their dean's title, with a different room, a
// different extension and a role address.
check("a dean's two rows collapse to one entry with two offices", (() => {
  const hits = facultyDirectory([], "manish thakur");
  return hits.length === 1 && hits[0].offices.length === 2 && hits[0].title === "Dean NIER";
})());
check("search finds a room typed without its hyphen",
  facultyDirectory([], "k208").some((p) => p.name === "Abhipsa Pal"));
check("search finds an extension", facultyDirectory([], "2080").length >= 1);
check("every query token has to match",
  facultyDirectory([], "abhipsa zzzznotathing").length === 0);
check("unknown query is empty, not everybody",
  facultyDirectory([], "zzzznotathing").length === 0);
// The catalogue's instructor emails came from a confident directory match in
// build_faculty.py, so the join back to a person here is exact.
check("a picked course tags its instructor", (() => {
  const code = catalogue.courses.find((c) => (c.instructors ?? []).some((i) => i.email))?.code;
  const rows = facultyDirectory([{ subject: "Some Course", course_code: code }], "");
  return rows.some((p) => p.courses.includes("Some Course"));
})());
check("mineOnly with no picked courses shows nobody",
  facultyDirectory([], "", true).length === 0);

console.log("");
console.log("calendar export (.ics)");
{
  const icsClasses = [
    { id: "c1", subject: "Consumption, Culture & Markets", course_code: "CCM", section: "A",
      day_of_week: 1, start_time: "10:15", end_time: "11:45", room: "Amphi (East-150)",
      term_phase: "full", session_date: null },
  ];
  const built = buildTimetableIcs(icsClasses, term, [], new Date("2026-09-10T12:00:00Z"));
  const ics = built.ics;

  survives("no classes", () => buildTimetableIcs([], term, []));
  survives("no term", () => buildTimetableIcs(icsClasses, null, []));
  check("no term yields no file", buildTimetableIcs(icsClasses, null, []).ics === null);
  check("wrapped in VCALENDAR",
    ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.trimEnd().endsWith("END:VCALENDAR"));
  check("every line ends CRLF", !/[^\r]\n/.test(ics));
  check("VEVENT count matches the reported count",
    (ics.match(/BEGIN:VEVENT/g) || []).length === built.count);
  check("every VEVENT is closed",
    (ics.match(/BEGIN:VEVENT/g) || []).length === (ics.match(/END:VEVENT/g) || []).length);
  check("carries the timezone it dates events in",
    ics.includes("BEGIN:VTIMEZONE") && ics.includes("TZID:Asia/Kolkata"));
  check("events are dated in that zone", ics.includes("DTSTART;TZID=Asia/Kolkata:"));
  // Only classes: breaks and the mid-term gap decide which dates exist, they
  // are never events themselves.
  check("Puja week produces no event",
    !/DTSTART;TZID=Asia\/Kolkata:2026101[9]|DTSTART;TZID=Asia\/Kolkata:2026102[0-5]/.test(ics));
  check("the gap between teaching windows produces no event",
    !/DTSTART;TZID=Asia\/Kolkata:2026100[1-4]/.test(ics));
  check("nothing falls outside the term",
    [...ics.matchAll(/DTSTART;TZID=Asia\/Kolkata:(\d{8})/g)]
      .every((m) => m[1] >= "20260824" && m[1] <= "20261122"));
  // A comma in a course name is a field separator in iCalendar until escaped.
  check("commas in a summary are escaped",
    ics.includes("SUMMARY:Consumption\\, Culture & Markets"));
  check("the venue rides along", ics.includes("LOCATION:Amphi (East-150)"));
  check("no line exceeds 75 octets", ics.split("\r\n").every(
    (l) => new TextEncoder().encode(l).length <= 75));

  // The point of a stable UID: exporting again after moving a class has to
  // edit the event the calendar already holds, not add a second one.
  const uidOn = (text, dt) => {
    const events = text.split("BEGIN:VEVENT").slice(1);
    const hit = events.find((e) => e.includes(`DTSTART;TZID=Asia/Kolkata:${dt}`));
    return hit && hit.match(/UID:(\S+)/)[1];
  };
  const original = uidOn(ics, "20260907T101500");
  const movedIcs = buildTimetableIcs(icsClasses, term,
    [{ class_id: "c1", original_date: "2026-09-07", new_date: "2026-09-09",
       new_start: "14:30", new_end: "16:00" }],
    new Date("2026-09-10T12:00:00Z")).ics;
  check("a moved class keeps the UID it was exported under",
    Boolean(original) && uidOn(movedIcs, "20260909T143000") === original);
  check("and vacates its original slot", !uidOn(movedIcs, "20260907T101500"));
  check("moving doesn't change the event count",
    (movedIcs.match(/BEGIN:VEVENT/g) || []).length === built.count);
  check("SEQUENCE rises between exports",
    exportSequence(new Date("2026-09-10T13:00:00Z")) >
    exportSequence(new Date("2026-09-10T12:00:00Z")));
  // Folding is counted in octets, and the catalogue really does carry en
  // dashes and curly quotes — a fold placed by character count can both
  // overrun the limit and split a multi-byte sequence in half.
  const longName = "Inside Storytelling – Theories and Praxis for Communication and Management";
  const foldedIcs = buildTimetableIcs(
    [{ ...icsClasses[0], subject: longName }], term, [], new Date("2026-09-10T12:00:00Z"),
  ).ics;
  check("a long name is folded within the octet limit",
    foldedIcs.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75));
  check("and unfolds back to exactly what went in",
    foldedIcs.replace(/\r\n /g, "").includes(`SUMMARY:${longName}`));
  check("folding did not break the multi-byte character", foldedIcs.includes("�") === false);
  check("the filename is safe to write to disk",
    /^[a-z0-9-]+\.ics$/.test(icsFilename(term)));

  // Two events sharing a UID is how you get a calendar that silently keeps
  // only one of them.
  const uids = [...ics.matchAll(/UID:(\S+)/g)].map((m) => m[1]);
  check("every event has its own UID", new Set(uids).size === uids.length);
  const spans = ics.split("BEGIN:VEVENT").slice(1).map((e) => ({
    start: e.match(/DTSTART;TZID=Asia\/Kolkata:(\d{8}T\d{6})/)?.[1],
    end: e.match(/DTEND;TZID=Asia\/Kolkata:(\d{8}T\d{6})/)?.[1],
  }));
  check("every event has a start and an end",
    spans.length === built.count && spans.every((s) => s.start && s.end));
  check("no event ends before it starts", spans.every((s) => s.end > s.start));
}


console.log(`\n${fail === 0 ? "all logic checks passed" : fail + " FAILURES"}`);
process.exit(fail ? 1 : 0);
