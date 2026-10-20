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
import EditAttendance from "../src/screens/EditAttendance";
import Stats from "../src/screens/Stats";
import Profile from "../src/screens/Profile";
import Reschedule from "../src/screens/Reschedule";
import TermCalendar from "../src/screens/TermCalendar";
import Faculty from "../src/screens/Faculty";
import JMaps from "../src/screens/JMaps";
import OltAttendance from "../src/screens/OltAttendance";
import ScheduleAdmin from "../src/screens/ScheduleAdmin";
import PorDashboard from "../src/screens/PorDashboard";
import DayMessEditor from "../src/screens/DayMessEditor";
import PorHelp from "../src/screens/PorHelp";
import { bundledHostel } from "../src/lib/menu";
import PorDetails from "../src/screens/PorDetails";
import Utils from "../src/screens/Utils";
import DayMessMenu from "../src/screens/DayMessMenu";
import NightMessMenu from "../src/screens/NightMessMenu";
import MessMenu from "../src/screens/MessMenu";
import OrderHistory from "../src/screens/OrderHistory";
import NoSchedule from "../src/screens/NoSchedule";
import TuckShops from "../src/screens/TuckShops";
import AttendanceBreakdown from "../src/screens/AttendanceBreakdown";
import OltSync from "../src/screens/OltSync";
import CoursePicker from "../src/screens/CoursePicker";
import SectionPicker from "../src/screens/SectionPicker";
import CataloguePreview from "../src/screens/CataloguePreview";
import LeaveMail from "../src/screens/LeaveMail";
import pgp1 from "../src/data/catalogue-pgp1.json";
import pgp2 from "../src/data/catalogue.json";
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

// A move five people in the section have recorded and this student hasn't.
const consensus = [
  { cohort_year: 2027, subject: "Consumption Culture & Markets", section: "A",
    original_date: "2026-09-24", original_start: "16:15",
    new_date: "2026-09-26", new_start: "18:00", reports: 5 },
];

const noop = () => {};

// OLT's own headings, misspelling included; the numbers are made up.
const oltSnap = {
  term: "Term-V", terms: ["Term-IV", "Term-V"],
  columns: ["Subject", "Total Classess", "Attended", "Attendance Percentage"],
  rows: [["Bank Management", "8", "7", "88"], ["Analytics in Practice", "4", "4", "100"],
    ["Pricing", "3", "2", "67"], ["Old Snapshot Course", "2", "2", "100"]],
  // One course with dates, one whose dates failed, one that doesn't add up,
  // and one with no entry at all (a copy read before dates were).
  datewise: {
    "Bank Management": {
      sessions: Array.from({ length: 8 }, (_, i) => ({
        no: i + 1, date: `2026-08-${String(i * 3 + 4).padStart(2, "0")}`,
        time: i % 2 ? "14:30" : "10:15", mark: i === 5 ? "A" : "P",
      })),
      attended: "7", total: "8", agrees: true,
    },
    "Analytics in Practice": { error: "Couldn't find this course in OLT's date-wise section." },
    "Pricing": {
      sessions: [{ no: 1, date: "2026-08-05", time: "08:30", mark: "P" },
        { no: 2, date: "2026-08-12", time: "08:30", mark: "X" }],
      attended: "1", total: "2", agrees: false,
    },
  },
  fetched_at: "2026-10-12T08:00:00Z", attempted_at: "2026-10-12T08:00:00Z",
  last_error: null,
};
const occ = occurrencesOn(classes, term, isoDate(now), overrides);

// Each case is rendered on its own so one failure doesn't mask the rest.
// Who looks after what, as por-dashboard.sql grants it.
const porGrants = [
  { email: "nhmessrep@email.iimcal.ac.in", kind: "day-mess", scope: "nh" },
  { email: "nhmessrep@email.iimcal.ac.in", kind: "night-canteen", scope: "nh" },
  { email: "whrep@email.iimcal.ac.in", kind: "tuck", scope: "tagore" },
  { email: "pgprep@email.iimcal.ac.in", kind: "schedule", scope: "pgp2" },
];

const cases = [
  ["Splash", <Splash key="s" />],
  ["SignIn", <SignIn key="si" error={null} />],
  ["SignIn / rejected domain", <SignIn key="si2" error={{ kind: "domain", message: "Nope." }} />],
  ["Today", <Today key="t" occurrences={occ} attendance={attendance} now={now} onMark={noop} />],
  ["Today / empty", <Today key="te" occurrences={[]} attendance={[]} now={now} onMark={noop} />],
  ["Timetable", <Timetable key="tt" classes={classes} now={now} term={term} overrides={overrides} onShowCalendar={noop} onReschedule={noop} />],
  ["Timetable / the section reports a move", <Timetable key="ttc" classes={classes} now={now} term={term}
    overrides={overrides} consensus={consensus} onShowCalendar={noop} onReschedule={noop} onMove={noop} />],
  ["Timetable / a report for a class you don't have", <Timetable key="ttx" classes={classes} now={now} term={term}
    overrides={overrides} consensus={[{ ...consensus[0], subject: "Nobody's Course" }]}
    onShowCalendar={noop} onReschedule={noop} onMove={noop} />],
  // Viewing as another cohort: reports arrive but there is nothing to accept
  // with, so the line must not offer a button that writes.
  ["Timetable / reports with no way to act", <Timetable key="ttr" classes={classes} now={now} term={term}
    overrides={overrides} consensus={consensus} onShowCalendar={noop} />],
  ["Timetable / all four actions", <Timetable key="tta" classes={classes} now={now} term={term}
      overrides={overrides} onShowCalendar={noop} onReschedule={noop} onShowBreakdown={noop}
      onShowAttendance={noop} pendingCount={3} />],
  ["Timetable / empty", <Timetable key="tte" classes={[]} now={now} term={term} />],
  ["Timetable / during a break", <Timetable key="ttb" classes={classes} now={new Date("2026-10-21T10:00:00")} term={term} overrides={[]} />],
  ["EditAttendance", <EditAttendance key="cu" classes={classes} attendance={attendance} term={term} overrides={overrides} now={now} onMark={noop} />],
  ["EditAttendance / no classes", <EditAttendance key="cue" classes={[]} attendance={[]} term={term} now={now} onMark={noop} />],
  // All three of its return paths render the back button now that it is a
  // sub-screen; the empty ones are the easy ones to forget.
  ["EditAttendance / with a way back", <EditAttendance key="cub" classes={classes} attendance={attendance}
      term={term} overrides={overrides} now={now} onMark={noop} onBack={noop} />],
  ["EditAttendance / nothing outstanding", <EditAttendance key="cun" classes={classes}
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
      onScheduleAdmin={noop} onPorDashboard={noop} />],
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
  ["Profile / tester", <Profile key="pt" session={{ user: { email: "a@email.iimcal.ac.in", user_metadata: {} } }}
      classes={classes} attendance={attendance} onToggleMute={noop} onChangeCourses={noop} onSignOut={noop}
      onOfficialAttendance={noop} />],
  // The remembered OLT password: kept, and not.
  ["Profile / tester, OLT password saved", <Profile key="pto" session={{ user: { email: "a2027@email.iimcal.ac.in", user_metadata: {} } }}
      classes={classes} attendance={attendance} onToggleMute={noop} onSignOut={noop}
      onOfficialAttendance={noop} oltPassword oltInitial={{ password_saved: true }} />],
  ["Profile / tester, no OLT password", <Profile key="ptn" session={{ user: { email: "a2027@email.iimcal.ac.in", user_metadata: {} } }}
      classes={classes} attendance={attendance} onToggleMute={noop} onSignOut={noop}
      onOfficialAttendance={noop} oltPassword oltInitial={null} />],
  // The last case is a grid OLT doesn't draw today: the screen takes its
  // layout from whatever headings arrive, so a renamed column mustn't break it.
  ["OltAttendance / never read", <OltAttendance key="o0" email="a2027@email.iimcal.ac.in"
      initial={null} onBack={noop} />],
  ["OltAttendance / read", <OltAttendance key="o1" email="a2027@email.iimcal.ac.in"
      initial={oltSnap} onBack={noop} />],
  ["OltAttendance / password saved", <OltAttendance key="o5" email="a2027@email.iimcal.ac.in"
      initial={{ ...oltSnap, password_saved: true }} onBack={noop} />],
  ["OltAttendance / last try failed", <OltAttendance key="o2" email="a2027@email.iimcal.ac.in"
      initial={{ ...oltSnap, attempted_at: "2026-10-12T09:00:00Z",
        last_error: "OLT didn't accept that password." }} />],
  ["OltAttendance / stored copy has no term", <OltAttendance key="o4" email="a2027@email.iimcal.ac.in"
      initial={{ ...oltSnap, term: null }} />],
  ["OltAttendance / no course or % column", <OltAttendance key="o3" email=""
      initial={{ ...oltSnap, terms: [], columns: ["A", "B"], rows: [["1", "2"], ["3"]] }} />],
  ["JMaps", <JMaps key="jm" onBack={noop} />],
  ["JMaps / no back button", <JMaps key="jmn" />],
  ["Reschedule", <Reschedule key="r" classes={classes} term={term} overrides={overrides} now={now} onMove={noop} onClear={noop} onBack={noop} />],
  ["Reschedule / no classes", <Reschedule key="re" classes={[]} term={term} overrides={[]} now={now} onMove={noop} onClear={noop} />],
  // A session already moved once, off a date that has since passed — the case
  // the screen used to have no way to reach.
  ["Reschedule / change against a past date", <Reschedule key="rp" classes={classes} term={term}
      overrides={[{ id: "o3", class_id: "c1", original_date: "2026-09-03", new_date: "2026-08-28",
        new_start: "08:30", new_end: "10:00", note: null }]}
      now={now} onMove={noop} onClear={noop} onBack={noop} />],
  ["Reschedule / no term", <Reschedule key="rt" classes={classes} term={null} overrides={overrides} now={now} onMove={noop} onClear={noop} />],
  ["ScheduleAdmin", <ScheduleAdmin key="sa" onBack={noop} />],
  ["PorDashboard / a mess secretary", <PorDashboard key="pd" email="nhmessrep@email.iimcal.ac.in"
      access={porGrants.filter(g => g.email.startsWith("nh"))} live={[]} onSignOut={noop} />],
  ["PorDashboard / a menu already live", <PorDashboard key="pdl" email="nhmessrep@email.iimcal.ac.in"
      access={porGrants.filter(g => g.email.startsWith("nh"))}
      live={[{ kind: "day-mess", scope: "nh", payload: bundledHostel("nh"), published_at: "2026-10-18T09:30:00Z" }]}
      onSignOut={noop} />],
  ["PorDashboard / the admin's, everyone's", <PorDashboard key="pda" email="anuja2027@email.iimcal.ac.in"
      admin access={porGrants} live={[]} onBack={noop} />],
  ["PorDashboard / the admin previewing a mess rep", <PorDashboard key="pdv" email="anuja2027@email.iimcal.ac.in"
      admin previewAs="nhmessrep@email.iimcal.ac.in" access={porGrants} live={[]} onBack={noop} />],
  ["PorDashboard / previewing, with the guide open", <PorDashboard key="pdvh" email="anuja2027@email.iimcal.ac.in"
      admin previewAs="pgprep@email.iimcal.ac.in" help access={porGrants} live={[]} onBack={noop} />],
  ["PorDashboard / nothing granted", <PorDashboard key="pdn" email="x@email.iimcal.ac.in"
      access={[]} live={[]} onSignOut={noop} />],
  ["DayMessEditor / nothing published yet", <DayMessEditor key="dme" scope="nh" history={[]} onBack={noop} onHelp={noop} />],
  ["PorDashboard / the guide open", <PorDashboard key="pdh" email="nhmessrep@email.iimcal.ac.in"
      access={porGrants.filter(g => g.email.startsWith("nh"))} live={[]} help onSignOut={noop} />],
  ["PorHelp / a mess secretary", <PorHelp key="ph" email="nhmessrep@email.iimcal.ac.in"
      kinds={["day-mess", "night-canteen"]} onBack={noop} />],
  ["PorHelp / nothing editable yet", <PorHelp key="php" email="pgprep@email.iimcal.ac.in"
      kinds={["schedule", "faculty"]} onBack={noop} />],
  ["PorHelp / no grants, no way back", <PorHelp key="phn" />],
  ["DayMessEditor / with history", <DayMessEditor key="dmh" scope="oh" onBack={noop} history={[
      { id: 3, payload: bundledHostel("oh"), restored_from: 1,
        created_by_email: "ohmessrep@email.iimcal.ac.in", created_at: "2026-10-18T09:30:00Z" },
      { id: 2, payload: bundledHostel("wh"), restored_from: null,
        created_by_email: "ohmessrep@email.iimcal.ac.in", created_at: "2026-10-17T09:30:00Z" },
    ]} />],
  ["DayMessEditor / a hostel the app doesn't have", <DayMessEditor key="dmz" scope="zz" history={[]} onBack={noop} />],
  // The admin preview renders the real Today and Timetable from a payload the
  // admin is not enrolled in — a section-shaped one, and an elective one.
  ["CataloguePreview / sections", <CataloguePreview key="cpv" payload={pgp1}
      label="Term II" onClose={noop} />],
  ["CataloguePreview / electives", <CataloguePreview key="cpe" payload={pgp2}
      label="Term V" onClose={noop} />],
  ["CataloguePreview / no calendar", <CataloguePreview key="cpn"
      payload={{ ...pgp1, calendar: null }} label="broken" onClose={noop} />],
  ["PorDetails", <PorDetails key="por" onBack={noop} />],
  ["PorDetails / no back button", <PorDetails key="porn" />],
  ["Utils", <Utils key="u" onOpen={noop} />],
  ["Utils / contacts group", <Utils key="uc" onOpen={noop} group="contacts" />],
  ["LeaveMail / blank", <LeaveMail key="lm" email="abc2027@email.iimcal.ac.in"
      accountName="A Student" onBack={noop} />],
  // Gmail draft off: the Send Mail route, which is also its fallback.
  ["LeaveMail / ready to send, draft open", <LeaveMail key="lmr" email="abc2027@email.iimcal.ac.in"
      onBack={noop} openDraft gmailDraft={false} initial={{
        date: "2026-09-25", name: "A Student", reg: "0001/01", phone: "9876543210",
        hostel: "Other", hostelOther: "Married quarters", room: "12",
        departDate: "2026-10-02", departTime: "18:00", returnDate: "2026-10-06", returnTime: "21:30",
        address: "12 Park Street\nKolkata 700016", reason: "Family function", info: "",
      }} />],
  // With a Google client ID configured, the Gmail draft replaces Send Mail.
  ["LeaveMail / Gmail draft", <LeaveMail key="lmt" email="abc2027@email.iimcal.ac.in"
      onBack={noop} initial={{
        date: "2026-09-25", name: "A Student", reg: "0001/01", phone: "9876543210",
        hostel: "NH", room: "12",
        departDate: "2026-10-02", departTime: "18:00", returnDate: "2026-10-06", returnTime: "21:30",
        address: "12 Park Street", reason: "Family function",
      }} />],
  // An older stored shape: fields missing entirely rather than blank.
  ["LeaveMail / partial form, draft open", <LeaveMail key="lmp" openDraft initial={{ name: "A Student" }} />],
  ["DayMessMenu", <DayMessMenu key="dm" onBack={noop} now={now} />],
  // Sunday is the rotation's edge case — the week must wrap, not truncate.
  ["DayMessMenu / on a Sunday", <DayMessMenu key="dms" onBack={noop}
      now={new Date("2026-09-13T12:00:00")} />],
  ["DayMessMenu / no back button", <DayMessMenu key="dmn" now={now} />],
  ["DayMessMenu / embedded", <DayMessMenu key="dme" now={now} embedded />],
  ["NightMessMenu", <NightMessMenu key="nm" />],
  ["MessMenu", <MessMenu key="mm" onBack={noop} now={now} />],
  ["TuckShops", <TuckShops key="ts" />],
  ["OrderHistory / nothing sent yet", <OrderHistory key="oh" onBack={noop} now={now} />],
  ["OrderHistory / no back button", <OrderHistory key="ohn" now={now} />],
  ["NoSchedule / year not published", <NoSchedule key="ns1"
    email="abc2029@email.iimcal.ac.in" cohort={2029} onSignOut={noop} />],
  ["NoSchedule / address carries no year", <NoSchedule key="ns2"
    email="armageddon@email.iimcal.ac.in" cohort={null} onSignOut={noop} />],
  ["NoSchedule / no way out offered", <NoSchedule key="ns3"
    email="rsharma@email.iimcal.ac.in" cohort={null} />],
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
  // The tester-only OLT column and sync: OLT's copy for this term ("Term-V"
  // against the app's "Term V"), a copy for another term, and nothing read.
  ["AttendanceBreakdown / OLT section", <AttendanceBreakdown key="abo" classes={classes}
      attendance={attendance} term={term} now={now} overrides={overrides} onBack={noop}
      showOlt email="a2027@email.iimcal.ac.in" oltInitial={oltSnap} />],
  // The line that says where a sync's numbers went.
  ["OltSync / just synced", <OltSync key="osj" termLabel="Term V" email="a2027@email.iimcal.ac.in"
      snap={{ ...oltSnap, password_saved: true }} loading={false} loadError="" onSynced={noop} justSynced />],
  ["AttendanceBreakdown / OLT password saved", <AttendanceBreakdown key="abo7" classes={classes}
      attendance={attendance} term={term} now={now} overrides={overrides}
      showOlt email="a2027@email.iimcal.ac.in" oltInitial={{ ...oltSnap, password_saved: true }} />],
  // A course OLT has dates for that the timetable also has, two meetings on
  // one day included — the rows that pair rather than stand alone.
  ["AttendanceBreakdown / OLT paired with the timetable", <AttendanceBreakdown key="abo5"
      classes={classes} attendance={attendance} term={term} now={now} overrides={overrides}
      showOlt email="a2027@email.iimcal.ac.in" oltInitial={{
        ...oltSnap,
        rows: [...oltSnap.rows, ["Consumption Culture & Markets", "3", "2", "67"]],
        datewise: { ...oltSnap.datewise, "Consumption Culture & Markets": {
          sessions: [{ no: 1, date: "2026-08-27", time: "16:15", mark: "P" },
            { no: 2, date: "2026-09-03", time: "16:15", mark: "P" },
            { no: 3, date: "2026-09-03", time: "18:00", mark: "A" }],
          attended: "2", total: "3", agrees: true,
        } },
      }} />],
  ["AttendanceBreakdown / OLT last sync failed", <AttendanceBreakdown key="abo6" classes={classes}
      attendance={attendance} term={term} now={now} overrides={overrides}
      showOlt oltInitial={{ ...oltSnap, attempted_at: "2026-10-13T09:00:00Z",
        last_error: "OLT didn't accept that password." }} />],
  ["AttendanceBreakdown / OLT read for another term", <AttendanceBreakdown key="abo2" classes={classes}
      attendance={attendance} term={term} now={now} overrides={overrides}
      showOlt oltInitial={{ ...oltSnap, term: "Term-IV" }} />],
  ["AttendanceBreakdown / OLT never read", <AttendanceBreakdown key="abo3" classes={classes}
      attendance={attendance} term={term} now={now} overrides={overrides}
      showOlt oltInitial={null} />],
  ["AttendanceBreakdown / OLT, no term calendar", <AttendanceBreakdown key="abo4" classes={classes}
      attendance={attendance} term={null} now={now} overrides={[]}
      showOlt oltInitial={oltSnap} />],
  ["TermCalendar", <TermCalendar key="tc" term={term} now={now} onBack={noop} />],
  ["TermCalendar / no term", <TermCalendar key="tce" term={null} now={now} />],
  ["CoursePicker", <CoursePicker key="cp" existing={classes} onSaved={noop} />],
  // The PGP1 first run. setActiveCatalogue is swapped in below so the picker
  // has a section-shaped schedule to read; both of its steps are rendered.
  ["SectionPicker / choose a section", <SectionPicker key="sp" existing={[]} catalogue={pgp1} onSaved={noop} />],
  ["SectionPicker / already in one", <SectionPicker key="spa"
      existing={[{ subject: "Macroeconomics", course_code: "EC-102", section: "C",
                   day_of_week: 3, start_time: "12:00", end_time: "13:30" }]}
      catalogue={pgp1} onSaved={noop} onDirtyChange={noop} />],
  ["SectionPicker / read-only preview", <SectionPicker key="spr" existing={[]}
      catalogue={pgp1} readOnly onSaved={noop} />],
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
