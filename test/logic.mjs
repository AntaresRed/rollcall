/** Data-layer behaviour under bad or edge-case input. */
import {
  toMinutes, hhmm, pretty, inSession, breakOn, skipBudget, courseStats,
  expectedSessions, unmarkedSessions, occurrencesOn, attendanceKey, isoDate, weekdayOf,
  catalogueDrift, currentSlotOf, attendanceBreakdown, markableSessions,
} from "../src/lib/api.js";
import { facultyDirectory, facultyCount } from "../src/lib/directory.js";
import { buildTimetableIcs, exportSequence, icsFilename } from "../src/lib/ics.js";
import { venueNote, NOTED_VENUES } from "../src/lib/venues.js";
import { validateCatalogue, diffCatalogues, setActiveCatalogue, activeCatalogue } from "../src/lib/catalogue.js";
import { POR_MENU, nodeAt, trailOf, countUnder, searchPor, porTotal, porSize } from "../src/lib/por.js";
import catalogue from "../src/data/catalogue.json";
import porJson from "../src/data/por.json";
import cataloguePgp1 from "../src/data/catalogue-pgp1.json";

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

// Scope is the term calendar, not a rolling window. On 20 Oct the 28-day
// window would start 22 Sep, so everything in August is the part that used to
// be silently unreachable — and unfixable, since nothing else in the app can
// write attendance for a past date.
const wholeTerm = unmarkedSessions(cls, [], term, new Date("2026-10-20T23:00:00"), 28, []);
check("catch-up reaches back to the first day of term",
  wholeTerm.some(o => o.date === "2026-08-24"));
check("catch-up spans the whole term, not four weeks",
  wholeTerm.filter(o => o.date < "2026-09-22").length === 6);
check("catch-up still excludes the mid-term gap",
  !wholeTerm.some(o => o.date === "2026-09-28"));
check("catch-up still excludes break weeks",
  !wholeTerm.some(o => o.date === "2026-10-19"));
check("catch-up never reaches before the term began",
  wholeTerm.every(o => o.date >= term.term_start));

// A marked session stays out of the list however old it is.
const oldMarked = unmarkedSessions(cls,
  [{ subject: "W", class_date: "2026-08-24", start_time: "10:15", status: "present" }],
  term, new Date("2026-10-20T23:00:00"), 28, []);
check("an old session that was marked is not asked about again",
  !oldMarked.some(o => o.date === "2026-08-24") &&
  oldMarked.length === wholeTerm.length - 1);

// Without a calendar there is no term to scope by, so the rolling window is
// still the fallback — and it must stay bounded.
const noTerm = unmarkedSessions(cls, [], null, new Date("2026-10-20T23:00:00"), 28, []);
check("with no term the fallback window still applies",
  noTerm.every(o => o.date >= "2026-09-22"));

console.log("\neditable sessions");
survives("no classes", () => markableSessions([], [], term, new Date("2026-09-10")));
survives("null term", () => markableSessions(cls, [], null, new Date("2026-09-10")));

// "W" runs Mondays 10:15-11:30. Monday 7 Sep, checked at three moments.
const beforeIt = markableSessions(cls, [], term, new Date("2026-09-07T09:00:00"), 28, []);
const during   = markableSessions(cls, [], term, new Date("2026-09-07T10:45:00"), 28, []);
const afterIt  = markableSessions(cls, [], term, new Date("2026-09-07T12:00:00"), 28, []);
const onDate = (rows) => rows.filter(o => o.date === "2026-09-07").length;

check("a class that has not started cannot be marked", onDate(beforeIt) === 0);
check("a class in session can be marked", onDate(during) === 1);
check("a finished class can be marked", onDate(afterIt) === 1);

// The badge is narrower: it must not nag about a class you are sitting in.
check("the badge ignores a class still running",
  unmarkedSessions(cls, [], term, new Date("2026-09-07T10:45:00"), 28, [])
    .filter(o => o.date === "2026-09-07").length === 0);
check("and counts it once it has ended",
  unmarkedSessions(cls, [], term, new Date("2026-09-07T12:00:00"), 28, [])
    .filter(o => o.date === "2026-09-07").length === 1);

// Nothing beyond today, whatever the clock says.
const upToNow = markableSessions(cls, [], term, new Date("2026-09-10T23:00:00"), 28, []);
check("never lists a future date", upToNow.every(o => o.date <= "2026-09-10"));
check("spans the term, not a window", upToNow.some(o => o.date === "2026-08-24"));

// Existing marks come back on the session, which is what lets the screen show
// the current state and offer to change it.
const marks = [
  { subject: "W", class_date: "2026-08-24", start_time: "10:15", status: "present" },
  { subject: "W", class_date: "2026-08-31", start_time: "10:15", status: "cancelled" },
];
const withMarks = markableSessions(cls, marks, term, new Date("2026-09-10T23:00:00"), 28, []);
const at = (d) => withMarks.find(o => o.date === d);
check("a marked session carries its mark", at("2026-08-24").status === "present");
check("cancelled is carried through too", at("2026-08-31").status === "cancelled");
check("an unmarked session reports null", at("2026-09-07").status === null);
check("marked sessions are still listed, not filtered out",
  withMarks.length === upToNow.length);
check("newest first",
  withMarks.every((x, i, a) => i === 0 || a[i - 1].date >= x.date));

// The badge is the subset of these with no mark.
const badge = unmarkedSessions(cls, marks, term, new Date("2026-09-10T23:00:00"), 28, []);
check("the badge counts exactly the unmarked ones",
  badge.length === withMarks.filter(o => o.status === null).length);
check("and every one it counts really is unmarked",
  badge.every(o => o.status === null));

// With no term calendar the scope comes from the timetable instead of a
// rolling window: the old 28-day cut-off meant that in the one situation where
// the app knows least, it also stopped anyone fixing a mark after four weeks.
{
  const picked = (created_at) => [{ id: "w2", subject: "W", day_of_week: 1,
    start_time: "10:15", end_time: "11:30", term_phase: "full", created_at }];
  const seesFirstDay = (when, classes) =>
    markableSessions(classes, [], null, new Date(when), 28, [])
      .some(o => o.date === "2026-08-24");

  const onTime = picked("2026-08-24T08:00:00Z");
  check("no calendar: still editable well past four weeks",
    seesFirstDay("2026-09-23T12:00:00", onTime));
  check("no calendar: still editable months later",
    seesFirstDay("2026-12-22T12:00:00", onTime));
  check("no calendar: never reaches before the course was picked",
    markableSessions(onTime, [], null, new Date("2026-12-22T12:00:00"), 28, [])
      .every(o => o.date >= "2026-08-24"));

  // Re-picking courses for a new term moves the floor with them, which is what
  // stands in for a term boundary when there is no calendar to declare one.
  check("no calendar: a re-picked timetable drops the old term",
    !seesFirstDay("2027-01-15T12:00:00", picked("2026-12-07T08:00:00Z")));

  // A dropped course generates no sessions, so there is nothing to edit.
  check("no calendar: a dropped course has nothing to edit",
    markableSessions([], [], null, new Date("2026-10-23T12:00:00"), 28, []).length === 0);

  // A floor that cannot be read is worse than a conservative one.
  for (const bad of [undefined, null, "", "not-a-date"]) {
    check(`no calendar: ${JSON.stringify(bad)} created_at falls back to the window`,
      seesFirstDay("2026-09-13T12:00:00", picked(bad)) &&
      !seesFirstDay("2026-09-23T12:00:00", picked(bad)));
  }
  // A timestamp in the future is a clock disagreeing with itself.
  check("no calendar: a future created_at is ignored",
    seesFirstDay("2026-09-13T12:00:00", picked("2099-01-01T00:00:00Z")) &&
    !seesFirstDay("2026-09-23T12:00:00", picked("2099-01-01T00:00:00Z")));

  // And a corrupt one must not become a walk over twenty thousand days.
  const epoch = markableSessions(picked("1970-01-01T00:00:00Z"), [], null,
    new Date("2026-10-23T12:00:00"), 28, []);
  check("no calendar: an epoch created_at is clamped, not walked",
    epoch.length > 0 && epoch.length < 100 &&
    epoch.every(o => o.date >= "2025-09-18"));
}

console.log("\nattendance breakdown");
survives("empty", () => attendanceBreakdown([], [], term, new Date("2026-09-10")));
survives("null term", () => attendanceBreakdown(cls, [], null, new Date("2026-09-10")));
survives("attendance with missing fields", () =>
  attendanceBreakdown(cls, [{ subject: null, class_date: null, start_time: null }],
    term, new Date("2026-09-10")));

// Mondays from term_start to 2026-09-10: Aug 24/31, Sep 7 -> three "W"
// sessions. "D" is a fixed-date course on Sep 10 at 16:15, and the clock
// below is 23:00, so it has finished and counts too.
const bdNow = new Date("2026-09-10T23:00:00");
const bd = attendanceBreakdown(cls, [
  { subject: "W", class_date: "2026-08-24", start_time: "10:15", status: "present" },
  { subject: "W", class_date: "2026-08-31", start_time: "10:15", status: "absent" },
  { subject: "D", class_date: "2026-09-10", start_time: "16:15", status: "present" },
], term, bdNow, []);
const bdW = bd.find(r => r.subject === "W");
const bdD = bd.find(r => r.subject === "D");
check("every chosen course appears", bd.length === 2);
check("present counted", bdW.present === 1);
check("absent counted", bdW.absent === 1);
check("the unmarked session is the remainder", bdW.unmarked === 1);
check("buckets sum to the sessions held",
  bdW.present + bdW.absent + bdW.unmarked === bdW.expected);
check("percentage is of what was marked", bdW.pct === 50);
check("fixed-date course counted once", bdD.expected === 1 && bdD.present === 1);
check("worst first", bd[0].subject === "W");

// A class still to come today must not be reported as unmarked - at 09:00 the
// 10:15 Monday session has not happened yet.
const bdEarly = attendanceBreakdown(cls, [], term, new Date("2026-09-07T09:00:00"), []);
check("today's later class is not yet unmarked",
  bdEarly.find(r => r.subject === "W").expected === 2);

// A mark left behind on a session that was moved away belongs to no meeting.
const bdMoved = attendanceBreakdown(cls, [
  { subject: "W", class_date: "2026-08-31", start_time: "10:15", status: "present" },
], term, bdNow,
  [{ class_id: "w", original_date: "2026-08-31", new_date: "2026-09-14", new_start: "10:15" }]);
check("a mark on a vacated date is not counted",
  bdMoved.find(r => r.subject === "W").present === 0);

// Cancelled is reported, but stays out of the three-way split.
const bdCancelled = attendanceBreakdown(cls, [
  { subject: "W", class_date: "2026-08-24", start_time: "10:15", status: "cancelled" },
], term, bdNow, []);
const bdC = bdCancelled.find(r => r.subject === "W");
// "cancelled" can no longer be set, but a row written before it was retired
// can still arrive. It must read as a gap the student can fill — never as an
// absence, which would cost them a class they did attend or never had.
check("a retired cancelled row is not an absence", bdC.absent === 0);
check("a retired cancelled row is not counted as attended", bdC.present === 0);
check("a retired cancelled row reads as did-not-mark", bdC.unmarked === 3);

// Without a calendar the gap is unknowable, and must not be printed as zero.
const bdNoTerm = attendanceBreakdown(cls, [
  { subject: "W", class_date: "2026-08-24", start_time: "10:15", status: "present" },
], null, bdNow, []);
check("no term still counts the marks",
  bdNoTerm.find(r => r.subject === "W").present === 1);
check("no term reports unmarked as unknown, not zero",
  bdNoTerm.every(r => r.unmarked === null && r.expected === null));

// The per-session list is the evidence for the counts, so it has to agree
// with them rather than be a second walk that can drift.
check("sessions are listed", Array.isArray(bdW.sessions) && bdW.sessions.length === 3);
check("one session per counted meeting", bdW.sessions.length === bdW.expected);
check("session statuses match the buckets",
  bdW.sessions.filter(x => x.status === "present").length === bdW.present &&
  bdW.sessions.filter(x => x.status === "absent").length === bdW.absent &&
  bdW.sessions.filter(x => x.status === null).length === bdW.unmarked);
check("an unmarked session is null, not undefined or a string",
  bdW.sessions.some(x => x.status === null));
check("sessions are newest first",
  bdW.sessions.every((x, i, a) => i === 0 || a[i - 1].date >= x.date));
check("every session carries a usable date and time",
  bdW.sessions.every(x => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(x.date) &&
    !Number.isNaN(toMinutes(x.start_time))));
check("the cancelled session appears in the list as cancelled",
  bdC.sessions.filter(x => x.status === "cancelled").length === 1);
check("a moved session is flagged as moved",
  attendanceBreakdown(cls, [], term, bdNow,
    [{ class_id: "w", original_date: "2026-08-31", new_date: "2026-09-14", new_start: "10:15" }])
    .find(r => r.subject === "W").sessions.every(x => x.date !== "2026-08-31"));
check("no term means no session list to show",
  bdNoTerm.every(r => r.sessions === null));

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
// Punctuation squashes to "", and every string contains "" — this used to
// return the whole directory.
check("a query of pure punctuation matches nobody",
  facultyDirectory([], "(((").length === 0);
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

console.log("");
console.log("venue directions");
survives("no venue", () => venueNote(null));
survives("unknown venue", () => venueNote("Somewhere else"));
check("an unknown venue has no note", venueNote("Tata Hall (East-West Conference room)") === null);
check("every noted venue resolves", NOTED_VENUES.every((v) => venueNote(v)));
// The directions are keyed loosely on purpose: the source sheet has spelled
// the same room several ways across terms, and a note silently vanishing over
// a hyphen is the failure this guards against.
check("punctuation and case don't matter",
  venueNote("l4") === venueNote("L-4") &&
  venueNote("AMPHI EAST 150") === venueNote("Amphi (East-150)"));
check("similar room numbers stay distinct",
  venueNote("L-4") !== venueNote("L-51") && venueNote("L-5") === null);
// Deliberately shared — the two rooms are the same climb. Asserted so that
// editing one of them later can't silently leave the pair disagreeing.
check("L-51 and L-52 share their directions",
  venueNote("L-51") !== null && venueNote("L-51") === venueNote("L-52"));
check("both amphis are noted, and separately",
  venueNote("Amphi (West-100)") !== null &&
  venueNote("Amphi (West-100)") !== venueNote("Amphi (East-150)"));
// A note pointing at a room no course meets in is a note nobody will ever
// see — most likely the catalogue renamed the venue underneath it.
{
  // Both catalogues: the first-year rooms are on its grid, not the second
  // years'. A room is published either as a course-level venue (electives) or
  // on a meeting (sections, where the room follows the section).
  const published = new Set();
  for (const cat of [catalogue, cataloguePgp1]) {
    for (const c of cat.courses) {
      if (c.venue) published.add(c.venue);
      for (const list of Object.values(c.sections ?? {})) {
        for (const m of list ?? []) if (m.room) published.add(m.room);
      }
    }
  }
  const orphans = NOTED_VENUES.filter((v) => ![...published].some((p) => venueNote(p) === venueNote(v)));
  if (orphans.length) console.log("       orphaned: " + orphans.join(", "));
  check("every noted venue is one the catalogue actually uses", orphans.length === 0);
}

console.log("");
console.log("stale catalogue data on saved rows");
{
  // The exact shape that fired "Managing Global Cities" alerts in August: the
  // catalogue says post-mid, the row saved months ago still says full, and the
  // alert sweep reads only the row.
  const saved = { day_of_week: 3, end_time: "12:00:00", course_code: "MGC", section: "A",
    room: "Amphi (East-150)", term_phase: "full", credits: "1.5", total_classes: 10, min_pct: 80 };
  const fromCatalogue = { day_of_week: 3, end_time: "12:00", course_code: "MGC", section: "A",
    room: "Amphi (East-150)", term_phase: "post_mid", credits: 1.5, total_classes: 10, min_pct: 80 };

  const patch = catalogueDrift(saved, fromCatalogue);
  check("a stale term_phase is caught", patch.term_phase === "post_mid");
  check("and nothing else is dragged along with it", Object.keys(patch).length === 1);

  // Every one of these differences is a formatting artefact of the round trip
  // through Postgres, not a real change. Treating them as drift would rewrite
  // every row on every save.
  check("a row that already agrees needs no patch",
    Object.keys(catalogueDrift(fromCatalogue, fromCatalogue)).length === 0);
  check("seconds on a time are not a difference",
    catalogueDrift({ ...fromCatalogue, end_time: "12:00:00" }, fromCatalogue).end_time === undefined);
  check("a numeric returned as a string is not a difference",
    catalogueDrift({ ...fromCatalogue, credits: "1.5" }, fromCatalogue).credits === undefined);
  check("empty string and null both mean nothing on file",
    catalogueDrift({ ...fromCatalogue, section: "" }, { ...fromCatalogue, section: null }).section === undefined);

  check("a corrected venue is caught too",
    catalogueDrift({ ...fromCatalogue, room: "L-51" }, fromCatalogue).room === "Amphi (East-150)");
  check("corrected credit rules are caught",
    Object.keys(catalogueDrift(
      { ...fromCatalogue, credits: 3, total_classes: 20, min_pct: 75 }, fromCatalogue,
    )).length === 3);
  // These belong to the student, not the catalogue, and a re-save must not
  // reach in and reset them.
  check("the student's own mute setting is never touched",
    catalogueDrift({ ...fromCatalogue, muted: true }, { ...fromCatalogue, muted: false }).muted === undefined);
  survives("junk rows", () => catalogueDrift(null, undefined));
}

console.log("");
console.log("no term loaded");
// Fails closed: a half-term course can't be placed without the calendar, and
// guessing "yes" is what fired post-mid alerts from the first week of term.
check("a post-mid course is held", inSession("post_mid", "2026-08-28", null) === false);
check("a pre-mid course is held", inSession("pre_mid", "2026-08-28", null) === false);
check("a full-term course still runs", inSession("full", "2026-08-28", null) === true);
// With the calendar present nothing changes.
check("post-mid stays out of the pre-mid window", inSession("post_mid", "2026-08-28", term) === false);
check("post-mid runs once its half starts", inSession("post_mid", "2026-10-06", term) === true);
check("pre-mid runs in the pre-mid window", inSession("pre_mid", "2026-08-28", term) === true);
{
  // Catch up must not invent sessions for a course that isn't running: marking
  // one writes an attendance row for a class that never happened.
  const postMid = [{ id: "pm", subject: "Managing Global Cities", day_of_week: 5,
    start_time: "12:00", end_time: "13:30", term_phase: "post_mid" }];
  const asked = unmarkedSessions(postMid, [], null, new Date("2026-08-28T23:00:00"), 28, []);
  check("catch-up asks about nothing when the term is unknown", asked.length === 0);
}

console.log("");
console.log("finding the mark that belongs to a rescheduled meeting");
{
  const cls = { id: "c1", subject: "W", start_time: "10:15" };

  // Never moved: the meeting is where the timetable put it.
  const fresh = currentSlotOf(cls, "2026-09-07", null);
  check("an untouched meeting sits at its published slot",
    fresh.date === "2026-09-07" && fresh.start === "10:15");
  check("no override row is the same as none at all",
    currentSlotOf(cls, "2026-09-07", undefined).date === "2026-09-07");

  // Moved once. The attendance row went with it, so a second move has to look
  // for it there — this is the case that used to strand the mark.
  const moved = currentSlotOf(cls, "2026-09-07",
    { new_date: "2026-09-09", new_start: "14:30" });
  check("a moved meeting is looked for where it was moved to",
    moved.date === "2026-09-09" && moved.start === "14:30");
  check("and not at the date it was originally due", moved.date !== "2026-09-07");

  // Postgres hands times back with seconds.
  check("seconds on the override time are stripped",
    currentSlotOf(cls, "2026-09-07",
      { new_date: "2026-09-09", new_start: "14:30:00" }).start === "14:30");

  // Cancelled: new_date is null, so the meeting is back at its published slot.
  const cancelled = currentSlotOf(cls, "2026-09-07",
    { new_date: null, new_start: null });
  check("a cancelled meeting resolves to its published slot",
    cancelled.date === "2026-09-07" && cancelled.start === "10:15");

  survives("junk everywhere", () => currentSlotOf(null, "2026-09-07", null));
}

console.log("");
console.log("schedule upload validation");
{
  // The real deployed catalogue must always be publishable, or the admin
  // screen would refuse the very file the app is running on.
  const real = validateCatalogue(catalogue);
  if (!real.ok) console.log("       " + real.errors.join("; "));
  check("the live catalogue passes its own validator", real.ok);
  check("and is summarised correctly",
    real.summary.courses === catalogue.courses.length && real.summary.meetings > 0);

  for (const junk of [null, undefined, 42, "text", [], {}])
    survives("junk input " + JSON.stringify(junk), () => validateCatalogue(junk));
  check("an empty object is rejected", validateCatalogue({}).ok === false);
  check("a bare array is rejected", validateCatalogue([]).ok === false);

  const base = () => JSON.parse(JSON.stringify(catalogue));

  check("no courses is rejected", validateCatalogue({ ...base(), courses: [] }).ok === false);

  // Each of these would fail silently rather than loudly if it reached the
  // database, which is the whole reason the check exists.
  const noSections = base();
  noSections.courses[0].sections = {};
  check("a course nobody could pick is rejected", validateCatalogue(noSections).ok === false);

  const dupe = base();
  dupe.courses.push({ ...dupe.courses[0] });
  check("a duplicate course code is rejected", validateCatalogue(dupe).ok === false);

  const badDay = base();
  Object.values(badDay.courses[0].sections)[0][0].day = 9;
  check("a weekday outside 1-7 is rejected", validateCatalogue(badDay).ok === false);

  const badTime = base();
  Object.values(badTime.courses[0].sections)[0][0].start = "noon";
  check("a start time that isn't HH:MM is rejected", validateCatalogue(badTime).ok === false);

  const overlap = base();
  overlap.calendar.post_mid_start = overlap.calendar.pre_mid_end;
  check("overlapping teaching windows are rejected", validateCatalogue(overlap).ok === false);

  const backwards = base();
  backwards.calendar.breaks = [{ label: "X", from: "2026-10-25", to: "2026-10-19" }];
  check("a break that ends before it starts is rejected", validateCatalogue(backwards).ok === false);

  const noCal = base();
  delete noCal.calendar;
  check("a missing calendar is rejected", validateCatalogue(noCal).ok === false);
  check("every problem is reported, not just the first",
    validateCatalogue({ courses: [{}, {}] }).errors.length > 1);
}

console.log("");
console.log("what publishing would change");
{
  const base = () => JSON.parse(JSON.stringify(catalogue));
  const same = diffCatalogues(catalogue, base());
  check("an identical file changes nothing",
    !same.added.length && !same.removed.length && !same.changed.length &&
    !same.meetingsMoved.length && !same.calendarChanged.length);

  const next = base();
  next.courses[0].venue = "Somewhere else";
  const venueOnly = diffCatalogues(catalogue, next);
  check("a corrected venue shows as a change",
    venueOnly.changed.length === 1 && venueOnly.changed[0].fields.includes("venue"));
  check("and is not mistaken for a moved meeting", venueOnly.meetingsMoved.length === 0);

  const phased = base();
  phased.courses[0].phase = phased.courses[0].phase === "full" ? "post_mid" : "full";
  check("a corrected phase shows as a change",
    diffCatalogues(catalogue, phased).changed[0].fields.includes("phase"));

  // The case publishing cannot repair: saved rows are matched on day and
  // start time, so a moved meeting matches nothing.
  const moved = base();
  Object.values(moved.courses[0].sections)[0][0].start = "18:00";
  const movedDiff = diffCatalogues(catalogue, moved);
  check("a moved meeting is called out separately",
    movedDiff.meetingsMoved.includes(catalogue.courses[0].code));

  const dropped = base();
  const goneCode = dropped.courses.pop().code;
  check("a dropped course is listed", diffCatalogues(catalogue, dropped).removed.includes(goneCode));

  const addedCat = base();
  addedCat.courses.push({ ...addedCat.courses[0], code: "ZZNEW", name: "New" });
  check("a new course is listed", diffCatalogues(catalogue, addedCat).added.includes("ZZNEW"));

  const shifted = base();
  shifted.calendar.term_end = "2026-11-30";
  check("changed term dates are listed",
    diffCatalogues(catalogue, shifted).calendarChanged.includes("term_end"));

  survives("diffing junk", () => diffCatalogues(null, undefined));
}

console.log("");
console.log("swapping the live schedule");
{
  check("starts on the bundled copy", activeCatalogue().term === catalogue.term);
  // A failed fetch must not leave the app with no courses at all.
  setActiveCatalogue(null);
  check("null falls back to the bundled copy", activeCatalogue().courses.length > 0);
  setActiveCatalogue({ courses: [] });
  check("an empty catalogue falls back too", activeCatalogue().courses.length > 0);
  setActiveCatalogue({ term: "Term VI", courses: [{ code: "X", name: "X", sections: {} }] });
  check("a real payload takes effect", activeCatalogue().term === "Term VI");
  setActiveCatalogue(null);   // leave the module as we found it
  check("and can be put back", activeCatalogue().term === catalogue.term);
}

console.log("");
console.log("POR details");
{
  // The six placement reps are listed twice on purpose — under CDPO, and
  // again on the Student Council where they also sit. Two copies of a phone
  // number is exactly the thing that drifts, so it is asserted rather than
  // trusted: same name, same number, both places.
  const groups = JSON.parse(JSON.stringify(porJson));
  const people = (id) => groups[id].sections.flatMap((s) => s.people);

  const reps = people("placement-representatives");
  const council = people("student-council");
  const crossListed = council.filter((p) => p.role === "Placement Representative");

  check("the placement reps list is intact", reps.length === 12);
  check("six of them are cross-listed on the Student Council",
    crossListed.length === 6);
  check("every cross-listed rep is a real placement rep",
    crossListed.every((c) => reps.some((r) => r.name === c.name)));
  check("and carries the same number in both places",
    crossListed.every((c) => {
      const match = reps.filter((r) => r.name === c.name);
      return match.length === 1 && match[0].phone === c.phone;
    }));
  check("nobody is cross-listed twice",
    new Set(crossListed.map((c) => c.name)).size === crossListed.length);
  check("every cross-listed rep has a usable number",
    crossListed.every((c) => /^[6-9]\d{9}$/.test(c.phone ?? "")));
  // "Abhishek Kumar" is also a SIG head on a different number; the one on the
  // council must be the placement rep's.
  check("the right Abhishek Kumar was cross-listed",
    crossListed.find((c) => c.name === "Abhishek Kumar")?.phone === "7605026267");
}

{
  // The menu is the hierarchy the council describes, not the workbook's tabs.
  check("four options at the top", POR_MENU.length === 4);
  check("in the order asked for",
    POR_MENU.map((n) => n.id).join(",") ===
    "student-council,cdpo,cultural-bodies,sports-council");
  check("CDPO opens two", nodeAt(["cdpo"]).children.length === 2);
  check("Cultural Bodies opens three", nodeAt(["cultural-bodies"]).children.length === 3);
  // A node either opens a menu or shows people, never both — the screen picks
  // which to render on exactly that distinction.
  const walk = (nodes) => nodes.flatMap((n) => [n, ...walk(n.children ?? [])]);
  check("no node is both a menu and a list",
    walk(POR_MENU).every((n) => Boolean(n.children) !== Boolean(n.dataset)));
  check("every leaf resolves to people",
    walk(POR_MENU).filter((n) => n.dataset).every((n) => porSize(n.dataset) > 0));

  check("paths resolve", nodeAt(["cultural-bodies", "clubs"]).dataset === "clubs");
  check("a path that does not resolve is null", nodeAt(["nope", "clubs"]) === null);
  survives("no path at all", () => nodeAt());
  check("the trail names each step",
    trailOf(["cultural-bodies", "clubs"]).map((n) => n.label).join(" / ") ===
    "Cultural Bodies / Clubs");

  check("a branch counts everyone beneath it",
    countUnder(nodeAt(["cdpo"])) ===
    porSize("preparation-committee") + porSize("placement-representatives"));
  check("the total is every list added up",
    porTotal === POR_MENU.reduce((n, x) => n + countUnder(x), 0) && porTotal > 300);

  // Sports Council carries its captains in the same sheet, under a divider.
  const sports = searchPor("sports-council", "");
  check("sports keeps council and captains apart",
    sports.length === 2 && sports[0].label === "Sports Council" &&
    sports[1].label === "Sports Captains");

  // Two sheets, one screen — but a SIG is still tellable from a Chapter.
  const sigs = searchPor("sigs-chapters", "");
  check("SIGs and Chapters are merged but still tagged",
    sigs.some((s) => s.kind === "SIG") && sigs.some((s) => s.kind === "Chapter"));

  check("clubs keep one section per club", searchPor("clubs", "").length === 20);

  // Searching, including by the section name itself.
  const byName = searchPor("student-council", "Tushar");
  check("finds a person by name",
    byName.reduce((n, s) => n + s.people.length, 0) === 1);
  check("finds by post", searchPor("student-council", "treasurer").length >= 1);
  check("finds by role email", searchPor("student-council", "president@").length === 1);
  check("finds a whole club by its name", (() => {
    const hits = searchPor("clubs", "hult prize");
    return hits.length === 0;   // Hult Prize is a Chapter, not a Club
  })());
  check("and finds it on the screen that has it", (() => {
    const hits = searchPor("sigs-chapters", "hult");
    return hits.length === 1 && hits[0].people.length === 6;
  })());
  check("finds by phone number", (() => {
    const hits = searchPor("student-council", "7252895480");
    return hits.reduce((n, s) => n + s.people.length, 0) === 1;
  })());

  // Empty sections are dropped, so no heading is ever left over nothing.
  check("a search never leaves an empty section",
    searchPor("clubs", "avinash").every((s) => s.people.length > 0));
  check("every token has to match",
    searchPor("clubs", "avinash zzzznotathing").length === 0);
  check("a query of pure punctuation matches nobody",
    searchPor("clubs", "(((").length === 0);
  survives("an unknown dataset", () => searchPor("nope", "x"));
  check("an unknown dataset is empty", searchPor("nope", "").length === 0);

  // Data integrity across every list.
  const everyone = Object.keys({
    "student-council": 1, "preparation-committee": 1, "placement-representatives": 1,
    clubs: 1, "sigs-chapters": 1, "cultural-cell": 1, "sports-council": 1,
  }).flatMap((id) => searchPor(id, "").flatMap((s) => s.people));
  check("every entry has a name", everyone.every((p) => p.name && p.name.trim()));
  check("every number on file is ten digits",
    everyone.every((p) => p.phone === null || /^[6-9]\d{9}$/.test(p.phone)));
  check("no sheet title was read as a person",
    !everyone.some((p) => /^(placement representatives|cultural cell|sports captains)$/i.test(p.name)));
  // The four corrections the build script applies.
  const sank = everyone.find((p) => /sankeerthana/i.test(p.name));
  check("the nine-digit number was corrected", sank?.phone === "6303444607");
  const algeria = everyone.find((p) => /algeria/i.test(p.name));
  const sourav = everyone.find((p) => p.name === "Sourav Deb");
  check("the swapped pair was put back",
    algeria?.phone === "8787415552" && sourav?.phone === "7449382453");
}


console.log(`\n${fail === 0 ? "all logic checks passed" : fail + " FAILURES"}`);
process.exit(fail ? 1 : 0);
