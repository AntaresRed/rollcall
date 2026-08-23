/** Data-layer behaviour under bad or edge-case input. */
import {
  toMinutes, hhmm, pretty, inSession, breakOn, skipBudget, courseStats,
  expectedSessions, unmarkedSessions, occurrencesOn, attendanceKey, isoDate, weekdayOf,
} from "../src/lib/api.js";
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
    check("MEOB has 4 meetings", meetings.length === 4);
    check("2 pre_mid, 2 post_mid",
      meetings.filter((m) => m.phase === "pre_mid").length === 2 &&
      meetings.filter((m) => m.phase === "post_mid").length === 2);
    check("course-level phase is full, not pre/post",
      meob.phase === "full");
    check("3 credits / 20 classes since it spans the whole term",
      meob.credits === 3 && meob.total_classes === 20);
    const fri = meetings.filter((m) => m.day === 5);
    check("both Friday meetings distinguished by phase, not deduped",
      fri.length === 2 && fri[0].phase !== fri[1].phase);
  }
} catch (err) {
  fail++; console.log("  FAIL catalogue check -> " + err.message);
}

console.log(`\n${fail === 0 ? "all logic checks passed" : fail + " FAILURES"}`);
process.exit(fail ? 1 : 0);
