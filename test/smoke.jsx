/**
 * Render every screen with realistic props and fail if any of them throws.
 *
 * The bugs that have actually reached production here were shape mismatches —
 * an occurrence passed where a class row was expected — which type-free static
 * analysis cannot see and a successful build says nothing about. Rendering is
 * the only thing that catches them.
 */
import { renderToStaticMarkup } from "react-dom/server";

import Today from "../src/screens/Today";
import Timetable from "../src/screens/Timetable";
import CatchUp from "../src/screens/CatchUp";
import Stats from "../src/screens/Stats";
import Profile from "../src/screens/Profile";
import Reschedule from "../src/screens/Reschedule";
import TermCalendar from "../src/screens/TermCalendar";
import Faculty from "../src/screens/Faculty";
import CalendarExport from "../src/screens/CalendarExport";
import ScheduleAdmin from "../src/screens/ScheduleAdmin";
import StudentContacts from "../src/screens/StudentContacts";
import PorDetails from "../src/screens/PorDetails";
import Utils from "../src/screens/Utils";
import AttendanceBreakdown from "../src/screens/AttendanceBreakdown";
import CoursePicker from "../src/screens/CoursePicker";
import SignIn from "../src/screens/SignIn";
import Splash from "../src/screens/Splash";

import { occurrencesOn, isoDate } from "../src/lib/api";

const now = new Date("2026-09-10T16:20:00");

const term = {
  id: "t1", label: "Term V",
  term_start: "2026-08-24", pre_mid_end: "2026-09-27",
  post_mid_start: "2026-10-05", term_end: "2026-11-22",
  breaks: [{ label: "Puja vacation", from_date: "2026-10-19", to_date: "2026-10-25" }],
};

const classes = [
  { id: "c1", subject: "Consumption Culture & Markets", course_code: "CCM", section: "A",
    day_of_week: 4, start_time: "16:15", end_time: "17:30", room: "L-4",
    term_phase: "full", credits: 3, total_classes: 20, min_pct: 75, muted: false,
    session_date: null, confirmed: true },
  { id: "c2", subject: "Consumption Culture & Markets", course_code: "CCM", section: "A",
    day_of_week: 4, start_time: "18:00", end_time: "19:15", room: "L-4",
    term_phase: "full", credits: 3, total_classes: 20, min_pct: 75, muted: true,
    session_date: null, confirmed: true },
  { id: "c3", subject: "Bank Management", course_code: "BM", section: "A",
    day_of_week: 4, start_time: "16:15", end_time: "17:45", room: "N-22",
    term_phase: "full", credits: 3, total_classes: 20, min_pct: 75, muted: false,
    session_date: "2026-09-10", confirmed: true },
  { id: "c4", subject: "Analytics in Practice", course_code: "AIP", section: "A",
    day_of_week: 5, start_time: "10:15", end_time: "11:30", room: null,
    term_phase: "pre_mid", credits: 1.5, total_classes: 10, min_pct: 80, muted: false,
    session_date: null, confirmed: true },
];

const attendance = [
  { id: "a1", subject: "Consumption Culture & Markets", class_id: "c1",
    class_date: "2026-09-03", start_time: "16:15", status: "present" },
  { id: "a2", subject: "Consumption Culture & Markets", class_id: "c2",
    class_date: "2026-09-03", start_time: "18:00", status: "absent" },
  { id: "a3", subject: "Analytics in Practice", class_id: "c4",
    class_date: "2026-09-04", start_time: "10:15", status: "cancelled" },
];

const overrides = [
  { id: "o1", class_id: "c1", original_date: "2026-09-17", new_date: "2026-09-18",
    new_start: "14:30", new_end: "15:45", note: null },
  { id: "o2", class_id: "c4", original_date: "2026-09-11", new_date: null,
    new_start: null, new_end: null, note: null },
];

const noop = () => {};
const occ = occurrencesOn(classes, term, isoDate(now), overrides);

// Each case is rendered on its own so one failure doesn't mask the rest.
const cases = [
  ["Splash", <Splash key="s" />],
  ["SignIn", <SignIn key="si" error={null} />],
  ["SignIn / rejected domain", <SignIn key="si2" error={{ kind: "domain", message: "Nope." }} />],
  ["Today", <Today key="t" occurrences={occ} attendance={attendance} now={now} onMark={noop} />],
  ["Today / empty", <Today key="te" occurrences={[]} attendance={[]} now={now} onMark={noop} />],
  ["Timetable", <Timetable key="tt" classes={classes} now={now} term={term} overrides={overrides} onShowCalendar={noop} onReschedule={noop} />],
  ["Timetable / all four actions", <Timetable key="tta" classes={classes} now={now} term={term}
      overrides={overrides} onShowCalendar={noop} onReschedule={noop} onShowBreakdown={noop}
      onShowCatchUp={noop} pendingCount={3} />],
  ["Timetable / empty", <Timetable key="tte" classes={[]} now={now} term={term} />],
  ["Timetable / during a break", <Timetable key="ttb" classes={classes} now={new Date("2026-10-21T10:00:00")} term={term} overrides={[]} />],
  ["CatchUp", <CatchUp key="cu" classes={classes} attendance={attendance} term={term} overrides={overrides} now={now} onMark={noop} />],
  ["CatchUp / no classes", <CatchUp key="cue" classes={[]} attendance={[]} term={term} now={now} onMark={noop} />],
  // All three of its return paths render the back button now that it is a
  // sub-screen; the empty ones are the easy ones to forget.
  ["CatchUp / with a way back", <CatchUp key="cub" classes={classes} attendance={attendance}
      term={term} overrides={overrides} now={now} onMark={noop} onBack={noop} />],
  ["CatchUp / nothing outstanding", <CatchUp key="cun" classes={classes}
      attendance={occurrencesOn(classes, term, isoDate(now), overrides).map(({ cls, date }) => ({
        subject: cls.subject, class_date: date, start_time: cls.start_time, status: "present",
      }))} term={term} overrides={overrides} now={new Date("2026-08-24T09:00:00")}
      onMark={noop} onBack={noop} />],
  ["Stats", <Stats key="st" classes={classes} attendance={attendance} onToggleMute={noop} />],
  ["Stats / nothing marked", <Stats key="ste" classes={classes} attendance={[]} onToggleMute={noop} />],
  ["Stats / over budget", <Stats key="sto" classes={classes} attendance={
      Array.from({ length: 9 }, (_, i) => ({
        id: `x${i}`, subject: "Consumption Culture & Markets", class_id: "c1",
        class_date: `2026-09-${String(i + 1).padStart(2, "0")}`,
        start_time: "16:15", status: "absent",
      }))} onToggleMute={noop} />],
  ["Profile / admin", <Profile key="pa" session={{ user: { email: "a@email.iimcal.ac.in", user_metadata: {} } }}
      classes={classes} attendance={attendance} onToggleMute={noop} onChangeCourses={noop} onSignOut={noop}
      onScheduleAdmin={noop} />],
  ["Profile", <Profile key="p" session={{ user: {
      email: "anuja2027@email.iimcal.ac.in",
      user_metadata: { full_name: "Anuja Sharma", avatar_url: "https://example.test/a.jpg" },
    } }} classes={classes} attendance={attendance} onToggleMute={noop} onChangeCourses={noop} onSignOut={noop} />],
  ["Profile / no avatar or name", <Profile key="pn" session={{ user: { email: "x@email.iimcal.ac.in", user_metadata: {} } }}
      classes={classes} attendance={attendance} onToggleMute={noop} onChangeCourses={noop} onSignOut={noop} />],
  ["Profile / no session", <Profile key="ps" session={null}
      classes={[]} attendance={[]} onToggleMute={noop} onChangeCourses={noop} onSignOut={noop} />],
  ["Faculty", <Faculty key="f" classes={classes} onBack={noop} />],
  ["Faculty / no courses picked", <Faculty key="fe" classes={[]} onBack={noop} />],
  ["Faculty / no classes prop at all", <Faculty key="fn" onBack={noop} />],
  ["Reschedule", <Reschedule key="r" classes={classes} term={term} overrides={overrides} now={now} onMove={noop} onClear={noop} onBack={noop} />],
  ["Reschedule / no classes", <Reschedule key="re" classes={[]} term={term} overrides={[]} now={now} onMove={noop} onClear={noop} />],
  // A session already moved once, off a date that has since passed — the case
  // the screen used to have no way to reach.
  ["Reschedule / change against a past date", <Reschedule key="rp" classes={classes} term={term}
      overrides={[{ id: "o3", class_id: "c1", original_date: "2026-09-03", new_date: "2026-08-28",
        new_start: "08:30", new_end: "10:00", note: null }]}
      now={now} onMove={noop} onClear={noop} onBack={noop} />],
  ["Reschedule / no term", <Reschedule key="rt" classes={classes} term={null} overrides={overrides} now={now} onMove={noop} onClear={noop} />],
  ["CalendarExport", <CalendarExport key="ce" classes={classes} term={term} overrides={overrides} onBack={noop} />],
  ["CalendarExport / no courses", <CalendarExport key="cen" classes={[]} term={term} overrides={[]} onBack={noop} />],
  ["CalendarExport / no term", <CalendarExport key="cet" classes={classes} term={null} overrides={[]} onBack={noop} />],
  ["ScheduleAdmin", <ScheduleAdmin key="sa" onBack={noop} />],
  ["StudentContacts", <StudentContacts key="sc" onBack={noop} />],
  ["StudentContacts / no back button", <StudentContacts key="scn" />],
  ["PorDetails", <PorDetails key="por" onBack={noop} />],
  ["PorDetails / no back button", <PorDetails key="porn" />],
  ["Utils", <Utils key="u" onOpen={noop} />],
  ["AttendanceBreakdown", <AttendanceBreakdown key="ab" classes={classes} attendance={attendance}
      term={term} now={now} overrides={overrides} onBack={noop} />],
  ["AttendanceBreakdown / no courses", <AttendanceBreakdown key="abe" classes={[]} attendance={[]}
      term={term} now={now} overrides={[]} onBack={noop} />],
  // No calendar means the sessions can't be enumerated, so the third bucket
  // is unknowable rather than zero — the screen has to say so, not print 0.
  ["AttendanceBreakdown / no term", <AttendanceBreakdown key="abt" classes={classes} attendance={attendance}
      term={null} now={now} overrides={[]} onBack={noop} />],
  ["AttendanceBreakdown / nothing marked yet", <AttendanceBreakdown key="abn" classes={classes}
      attendance={[]} term={term} now={now} overrides={overrides} onBack={noop} />],
  ["TermCalendar", <TermCalendar key="tc" term={term} now={now} onBack={noop} />],
  ["TermCalendar / no term", <TermCalendar key="tce" term={null} now={now} />],
  ["CoursePicker", <CoursePicker key="cp" existing={classes} onSaved={noop} />],
  ["CoursePicker / reports dirtiness", <CoursePicker key="cpd" existing={classes} onSaved={noop} onDirtyChange={noop} />],
  ["CoursePicker / fresh", <CoursePicker key="cpf" existing={[]} onSaved={noop} />],

  // Deliberately hostile input: rows missing the fields screens read.
  ["Today / malformed rows", <Today key="tm" occurrences={[
      { cls: { id: "z1", subject: "Broken" }, date: isoDate(now), movedFrom: null },
    ]} attendance={[]} now={now} onMark={noop} />],
  ["Stats / class with no credit fields", <Stats key="stm" classes={[{ id: "z", subject: "Bare" }]} attendance={[]} onToggleMute={noop} />],
];

let failed = 0;
for (const [name, el] of cases) {
  try {
    const html = renderToStaticMarkup(el);
    if (typeof html !== "string") throw new Error("no markup produced");
    console.log("  ok   " + name);
  } catch (err) {
    failed++;
    console.log("  FAIL " + name + "\n       " + (err.stack || err.message).split("\n").slice(0, 3).join("\n       "));
  }
}

console.log(`\n${cases.length - failed}/${cases.length} screens rendered`);
process.exit(failed ? 1 : 0);
