import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { supabase, getSession, signOut, readAuthError } from "./lib/supabase";
import {
  loadClasses, loadAttendance, loadTerm, markAttendance, unmarkAttendance,
  attendanceKey, isoDate, setCourseMuted, unmarkedSessions,
  loadOverrides, rescheduleSession, clearOverride, occurrencesOn,
  loadPublishedCatalogue, loadProfile, cohortOf,
  loadPublishedCohorts, loadCataloguePayload,
} from "./lib/api";
import {
  setActiveCatalogue, catalogueKind, catalogueCohort,
  classesFromCatalogue, termFromCatalogue, sectionsOf,
} from "./lib/catalogue";
import {
  enableAlerts, alertsActive, registerServiceWorker, pushSupported, isIOS, isStandalone,
} from "./lib/push";

import Splash, { Mark } from "./screens/Splash";
import SignIn from "./screens/SignIn";
import { TodayIcon, TimetableIcon, UtilsIcon, ProfileIcon } from "./screens/TabIcons";
const CoursePicker = lazy(() => import("./screens/CoursePicker"));
import Today from "./screens/Today";
const Timetable = lazy(() => import("./screens/Timetable"));
const Profile = lazy(() => import("./screens/Profile"));
const EditAttendance = lazy(() => import("./screens/EditAttendance"));
const TermCalendar = lazy(() => import("./screens/TermCalendar"));
const Reschedule = lazy(() => import("./screens/Reschedule"));
const Faculty = lazy(() => import("./screens/Faculty"));
const CalendarExport = lazy(() => import("./screens/CalendarExport"));
const ScheduleAdmin = lazy(() => import("./screens/ScheduleAdmin"));
const PorDetails = lazy(() => import("./screens/PorDetails"));
const Utils = lazy(() => import("./screens/Utils"));
const MessMenu = lazy(() => import("./screens/MessMenu"));
const AttendanceBreakdown = lazy(() => import("./screens/AttendanceBreakdown"));
const SectionPicker = lazy(() => import("./screens/SectionPicker"));

// What the masthead's back arrow says it returns to, per sub-screen. Tabs
// themselves don't stack — they're a flat choice, and back through a tab you
// only glanced at is worse than no back at all — so only these push a level.
const SUB_SCREEN_BACK = {
  calendar: "Back to timetable",
  reschedule: "Back to timetable",
  breakdown: "Back to timetable",
  attendance: "Back to timetable",
  faculty: "Back to utils",
  por: "Back to utils",
  mess: "Back to utils",
  export: "Back to utils",
  admin: "Back to profile",
};

const TABS = [
  ["today", "Today's classes", TodayIcon],
  ["timetable", "Week's Timetable", TimetableIcon],
  ["utils", "Utils", UtilsIcon],
  ["profile", "Profile", ProfileIcon],
];

/** Stable empty array: a fresh [] on every render would re-run every memo. */
const EMPTY = [];

export default function App() {
  const [ready, setReady] = useState(false);
  const [classes, setClasses] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [term, setTerm] = useState(null);
  const [overrides, setOverrides] = useState([]);
  const [tab, setTab] = useState("today");
  const [now, setNow] = useState(new Date());
  const [alerts, setAlerts] = useState(false);
  const [editing, setEditing] = useState(false);
  const [subScreen, setSubScreen] = useState(null);
  const [returnTab, setReturnTab] = useState(null);
  const [toast, setToast] = useState("");
  const [fatal, setFatal] = useState("");
  const [session, setSession] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  // Null once boot has finished means no schedule is published for this
  // student's year — see the boot block for why that is a screen of its own.
  const [cohort, setCohort] = useState(null);
  const [noSchedule, setNoSchedule] = useState(false);
  // Admin only. When set, the whole app renders as a student of another
  // cohort: { cohort, label, payload, section }. Everything that writes is
  // switched off while it is — see `readOnly` below.
  const [viewAs, setViewAs] = useState(null);
  const [cohorts, setCohorts] = useState([]);
  // What to put back on exit. The live catalogue is module state, so leaving
  // has to restore it explicitly or every lookup stays on the other year's.
  const real = useRef(null);
  // Read by the write callbacks, which are memoised with empty deps and so
  // cannot see `viewAs` directly. The buttons are disabled too; this is the
  // guard that does not depend on every screen remembering to pass the flag.
  const readOnlyRef = useRef(false);
  // Set by CoursePicker while its selection differs from what's saved, so
  // backing out of it can warn — and stay silent when there's nothing to lose.
  const pickerDirty = useRef(false);

  const say = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  };

  // ---- boot ----
  useEffect(() => {
    (async () => {
      try {
        // A rejected sign-in comes back as parameters on the URL, not as a
        // thrown error, so it has to be read before anything else.
        setAuthError(readAuthError());

        const current = await getSession();
        setSession(current);
        if (!current) {
          setReady(true);
          return;
        }

        // Nothing below blocks first paint. Service-worker registration and
        // the push-subscription check both wait on `serviceWorker.ready`,
        // which can take seconds on a cold start and has no bearing on
        // whether the schedule can be drawn.
        registerServiceWorker()
          .then(() => alertsActive())
          .then(setAlerts)
          .catch(() => setAlerts(false));

        // Which year the student is in has to be settled before the term or
        // the schedule can be fetched, because both are published per cohort
        // and the two years run on different dates. So this is two round trips
        // rather than one — the profile, then everything that depends on it.
        //
        // The address is the fallback for the stored value: it is the same
        // rule the database uses, so the two cannot disagree, and it keeps a
        // student working if their profile row is missing.
        const profile = await loadProfile().catch(() => null);
        const mine = profile?.cohort_year ?? cohortOf(current.user?.email);
        setIsAdmin(Boolean(profile?.is_admin));
        setCohort(mine);

        const [c, a, t, o, published] = await Promise.all([
          loadClasses(), loadAttendance(), loadTerm(mine), loadOverrides(),
          loadPublishedCatalogue(mine),
        ]);

        // The published schedule has to be in place before the first screen
        // renders: the catalogue lookups are module state, so swapping them
        // later would leave already-rendered screens on the old one.
        if (published?.payload) setActiveCatalogue(published.payload);
        real.current = { catalogue: published?.payload ?? null };

        if (profile?.is_admin) {
          loadPublishedCohorts().then(setCohorts).catch(() => setCohorts([]));
        }

        // Falling back to the bundled copy is right only when it belongs to
        // this student. It is the second years' grid, so serving it to a first
        // year would hand them somebody else's electives — worse than saying
        // nothing is ready. Same for an address carrying no year at all.
        if (!published?.payload && (!mine || mine !== catalogueCohort())) {
          setNoSchedule(true);
        }

        setClasses(c);
        setAttendance(a);
        setTerm(t);
        setOverrides(o);
      } catch (err) {
        console.error(err);
        setFatal("Couldn't reach IIMPresent. Check your connection and reload.");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Google returns to the app mid-load, so the session can arrive after the
  // first render.
  useEffect(() => {
    let had = false;
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // The reload lives here, not inside a state updater: React invokes
      // updaters twice in development, which would fire it twice.
      if (event === "SIGNED_IN" && !had) {
        had = true;
        window.location.reload();
        return;
      }
      if (event === "SIGNED_OUT") {
        window.location.reload();
        return;
      }
      // TOKEN_REFRESHED and USER_UPDATED arrive routinely while the app is
      // open. They carry a fresh session and need no interruption.
      had = Boolean(next);
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // A notification button can write attendance while the app sits open in
  // another tab. The service worker says so; refetch rather than guess.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = async (event) => {
      if (event.data?.type !== "attendance-changed") return;
      try {
        setAttendance(await loadAttendance());
      } catch {
        /* the next open will pick it up */
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);

  // ---- keep the now-marker honest ----
  useEffect(() => {
    // Every screen derives from `now`, so replacing the object on a timer
    // re-renders the whole tree. Only publish a new value when the minute
    // it displays has actually changed.
    const tick = () => setNow((prev) => {
      const next = new Date();
      return next.getMinutes() === prev.getMinutes() &&
             next.getHours() === prev.getHours() &&
             next.getDate() === prev.getDate()
        ? prev
        : next;
    });
    const id = setInterval(tick, 20_000);
    const onVisible = () => document.visibilityState === "visible" && tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const mark = useCallback(async (cls, date, status) => {
    if (readOnlyRef.current) return;
    const k = attendanceKey(cls.subject, date, cls.start_time);
    // optimistic — marking attendance should never feel like a network round trip
    setAttendance((prev) => {
      const rest = prev.filter(
        (a) => attendanceKey(a.subject, a.class_date, a.start_time) !== k,
      );
      return status
        ? [...rest, {
            class_id: cls.id,
            subject: cls.subject,
            start_time: cls.start_time,
            class_date: date,
            status,
          }]
        : rest;
    });
    try {
      if (status) await markAttendance(cls, date, status);
      else await unmarkAttendance(cls, date);
    } catch {
      setAttendance(await loadAttendance());
      say("That didn't save. Try again.");
    }
  }, []);

  // ---- "Mark present" straight from a notification ----
  useEffect(() => {
    if (!ready || !classes.length) return;
    const params = new URLSearchParams(window.location.search);
    const classId = params.get("mark");
    if (!classId) return;

    const date = params.get("date") || isoDate();
    const requested = params.get("status");
    const status = requested === "absent" ? "absent" : "present";
    const cls = classes.find((c) => c.id === classId);

    window.history.replaceState({}, "", "/");
    if (!cls) {
      say("That class is no longer on your timetable");
      return;
    }
    mark(cls, date, status);
    say(status === "absent" ? "Marked absent" : "Marked present");
  }, [ready, classes, mark]);

  // The service worker opens the app at /?focus=today when a notification's
  // body is tapped. Nothing reads that parameter — the app lands on Today
  // anyway, because Today is the default tab and the notification triggers a
  // fresh load — so all it does is sit in the address bar afterwards. Clear
  // it, and leave every other parameter alone: this runs after `ready`, so
  // Supabase has already consumed the OAuth `code` by now, but there is no
  // reason to touch what it hasn't.
  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("focus")) return;
    params.delete("focus");
    const rest = params.toString();
    window.history.replaceState({}, "", rest ? `${window.location.pathname}?${rest}` : window.location.pathname);
  }, [ready]);

  const turnOnAlerts = async () => {
    try {
      const result = await enableAlerts();
      if (result === "enabled") { setAlerts(true); say("Alerts on"); }
      else if (result === "denied") say("Notifications are blocked in your browser settings");
      else if (result === "needs-install") say("Add IIMPresent to your Home Screen first");
      else if (result === "misconfigured") say("Alerts aren't configured on this deployment");
      else say("This browser can't do alerts");
    } catch {
      say("Couldn't turn on alerts. Try again.");
    }
  };

  const toggleMute = useCallback(async (subject, muted) => {
    if (readOnlyRef.current) return;
    setClasses((prev) =>
      prev.map((c) => (c.subject === subject ? { ...c, muted } : c)));
    try {
      await setCourseMuted(subject, muted);
      say(muted ? "Alerts muted for this course" : "Alerts back on");
    } catch {
      setClasses(await loadClasses());
      say("Couldn't change that. Try again.");
    }
  }, []);

  const moveSession = useCallback(async (cls, originalDate, change) => {
    if (readOnlyRef.current) return;
    try {
      await rescheduleSession(cls, originalDate, change);
      const [o, a] = await Promise.all([loadOverrides(), loadAttendance()]);
      setOverrides(o);
      setAttendance(a);
      say(change.newDate ? "Class moved" : "Marked as cancelled");
    } catch {
      say("Couldn't save that change. Try again.");
    }
  }, []);

  const undoMove = useCallback(async (classId, originalDate) => {
    try {
      await clearOverride(classId, originalDate);
      setOverrides(await loadOverrides());
      say("Put back as published");
    } catch {
      say("Couldn't undo that. Try again.");
    }
  }, []);

  /**
   * Render the app as a student of another year.
   *
   * Nothing is fetched for the admin themselves and nothing is written. The
   * timetable is synthesised from that cohort's published catalogue, so it is
   * the same rows a real student of theirs would have — but with ids that
   * exist in no table, so no attendance or reschedule could attach to them
   * even if a write slipped through.
   */
  const enterViewAs = async (entry) => {
    try {
      const payload = await loadCataloguePayload(entry.id);
      if (!payload?.courses?.length) {
        say("That schedule has no courses in it");
        return;
      }
      real.current = {
        ...real.current,
        classes, attendance, term, overrides,
      };
      readOnlyRef.current = true;
      setActiveCatalogue(payload);
      setViewAs({
        cohort: entry.cohort_year,
        label: entry.label,
        payload,
        section: sectionsOf(payload)[0] ?? null,
      });
      setTab("today");
      setSubScreen(null);
      say(`Viewing as the class of ${entry.cohort_year}`);
    } catch {
      say("Couldn't load that schedule");
    }
  };

  const exitViewAs = () => {
    const saved = real.current ?? {};
    readOnlyRef.current = false;
    setActiveCatalogue(saved.catalogue ?? null);
    setClasses(saved.classes ?? []);
    setAttendance(saved.attendance ?? []);
    setTerm(saved.term ?? null);
    setOverrides(saved.overrides ?? []);
    setViewAs(null);
    setTab("today");
    setSubScreen(null);
  };

  const startOver = () => {
    // Remember where the edit was launched from, so saving returns there
    // rather than dumping the student on Today.
    setReturnTab(tab);
    pickerDirty.current = false;
    setEditing(true);
  };

  const leaveEditing = () => {
    if (pickerDirty.current &&
        !confirm("Leave without saving? Your changes to the course list will be lost.")) return;
    pickerDirty.current = false;
    setEditing(false);
    setTab(returnTab ?? tab);
    setReturnTab(null);
  };

  // Stable identity: CoursePicker recomputes its dirty flag whenever this
  // prop changes, and App re-renders every time the clock ticks over a minute.
  const notePickerDirty = useCallback((dirty) => { pickerDirty.current = dirty; }, []);

  const handleSignOut = useCallback(async () => {
    if (!confirm("Sign out of IIMPresent? Your timetable and attendance stay on the server.")) return;
    await signOut();
  }, []);

  // ---- derived state ----
  // EVERY hook must sit above the early returns below. React identifies hooks
  // by call order, so a useMemo placed after `if (!ready) return ...` runs on
  // some renders and not others, and the component dies the moment that
  // condition flips. These two walk weeks of dates against every class, so
  // they are worth memoising — but only from up here.
  const iosNeedsInstall = useMemo(() => isIOS() && !isStandalone(), []);

  // While viewing as another cohort every screen reads synthesised data
  // instead of the admin's own. Kept as one substitution here rather than a
  // condition inside each screen, so no screen has to know the mode exists.
  const viewClasses = useMemo(
    () => (viewAs ? classesFromCatalogue(viewAs.payload, viewAs.section) : classes),
    [viewAs, classes],
  );
  const viewTerm = viewAs ? termFromCatalogue(viewAs.payload) : term;
  const viewAttendance = viewAs ? EMPTY : attendance;
  const viewOverrides = viewAs ? EMPTY : overrides;
  const readOnly = Boolean(viewAs);

  const pendingCount = useMemo(
    () => (readOnly
      ? 0
      : unmarkedSessions(viewClasses, viewAttendance, viewTerm, now, 28, viewOverrides).length),
    [readOnly, viewClasses, viewAttendance, viewTerm, now, viewOverrides],
  );

  const todaysOccurrences = useMemo(
    () => occurrencesOn(viewClasses, viewTerm, isoDate(now), viewOverrides),
    [viewClasses, viewTerm, now, viewOverrides],
  );

  // ---- everything below this line may return early ----
  if (!ready) return <Splash />;
  if (!session) return <SignIn error={authError} />;
  if (fatal) return <div className="shell"><div className="notice" style={{ marginTop: 40 }}>{fatal}</div></div>;

  // A student whose year has no schedule yet. Deliberately ahead of the
  // course picker: with no catalogue of their own there is nothing to pick,
  // and the bundled fallback belongs to the other year.
  if (noSchedule && !classes.length && !viewAs) {
    return (
      <div className="shell">
        <Masthead now={now} />
        <div className="no-schedule">
          <h2>No timetable published for your year yet</h2>
          <p>
            You're signed in as <code>{session.user?.email}</code>
            {cohort ? <> — the class of <strong>{cohort}</strong>.</> : "."}
          </p>
          <p>
            {cohort
              ? "Your batch's schedule hasn't been published to the app yet. It will appear here as soon as it is — nothing for you to do."
              : "That address doesn't carry a batch year, so there's no way to tell which timetable is yours. If you're a student, sign in with your institute address."}
          </p>
        </div>
      </div>
    );
  }

  // ---- onboarding ----
  if (!viewAs && (!classes.length || editing)) {
    const finish = async (saved) => {
      setClasses(saved);
      pickerDirty.current = false;
      setEditing(false);
      // First run has nowhere to go back to, so Today is the right landing.
      setTab(returnTab ?? "today");
      setReturnTab(null);
      if (!(await alertsActive())) await turnOnAlerts();
    };

    return (
      <div className="shell">
        {/* No way back on first run: there is no app behind this screen yet,
            and an arrow that leads nowhere is worse than none. */}
        <Masthead
          now={now}
          onBack={editing && classes.length ? leaveEditing : null}
          backLabel="Back without saving"
        />
        <Suspense fallback={<div className="screen-loading" aria-hidden="true" />}>
          {/* Which picker to show is a property of the schedule, not of the
              student: a core curriculum is chosen by section, electives by
              course. Asking the catalogue means neither year needs to be
              named here, and a future programme works without a change. */}
          {catalogueKind() === "sections" ? (
            <SectionPicker
              existing={classes}
              onSaved={finish}
              onDirtyChange={notePickerDirty}
            />
          ) : (
            <CoursePicker
              existing={classes}
              onSaved={finish}
              onDirtyChange={notePickerDirty}
            />
          )}
        </Suspense>
      </div>
    );
  }

  // ---- main ----
  return (
    <>
      <Masthead
        now={now}
        onBack={subScreen ? () => setSubScreen(null) : null}
        backLabel={SUB_SCREEN_BACK[subScreen]}
      />
      {/* Widened only for the plain grid view — the day columns are what
          actually benefit from a laptop's extra width. Every other screen,
          this one included when a sub-screen is open, reads as prose or a
          list and is better off at the narrow column width it already has;
          stretching those to a 27" monitor would just make the lines long. */}
      <div className={`shell${tab === "timetable" && !subScreen ? " shell-grid" : ""}`}>
        {viewAs && (
          <ViewAsBar
            viewAs={viewAs}
            onSection={(letter) => setViewAs((v) => ({ ...v, section: letter }))}
            onExit={exitViewAs}
          />
        )}
        {!viewAs && isAdmin && cohorts.length > 1 && (
          <ViewAsPicker mine={cohort} cohorts={cohorts} onPick={enterViewAs} />
        )}
        {!alerts && pushSupported() && (
          <div className={`banner${iosNeedsInstall ? " warn" : ""}`}>
            {iosNeedsInstall ? (
              <p>
                On iPhone, alerts only work once IIMPresent is on your Home Screen.
                Tap Share, then <strong>Add to Home Screen</strong>, and open it from there.
              </p>
            ) : (
              <>
                <p>Alerts are off. Turn them on to get a nudge before each class.</p>
                <button className="btn" onClick={turnOnAlerts}>Turn on alerts</button>
              </>
            )}
          </div>
        )}

        <Suspense fallback={<div className="screen-loading" aria-hidden="true" />}>
        {tab === "today" && (
          <Today
            occurrences={todaysOccurrences}
            attendance={viewAttendance}
            now={now}
            onMark={mark}
            readOnly={readOnly}
          />
        )}
        {tab === "timetable" && subScreen === "calendar" && (
          <TermCalendar term={viewTerm} now={now} onBack={() => setSubScreen(null)} />
        )}
        {tab === "timetable" && subScreen === "reschedule" && (
          <Reschedule
            classes={classes}
            term={term}
            overrides={overrides}
            now={now}
            onMove={moveSession}
            onClear={undoMove}
            onBack={() => setSubScreen(null)}
          />
        )}
        {tab === "timetable" && subScreen === "attendance" && (
          <EditAttendance
            classes={viewClasses}
            attendance={viewAttendance}
            term={viewTerm}
            overrides={viewOverrides}
            now={now}
            onMark={mark}
            readOnly={readOnly}
            onBack={() => setSubScreen(null)}
          />
        )}
        {tab === "timetable" && subScreen === "breakdown" && (
          <AttendanceBreakdown
            classes={viewClasses}
            attendance={viewAttendance}
            term={viewTerm}
            now={now}
            overrides={viewOverrides}
            onBack={() => setSubScreen(null)}
          />
        )}
        {tab === "profile" && subScreen === "admin" && isAdmin && (
          <ScheduleAdmin onBack={() => setSubScreen(null)} />
        )}
        {tab === "utils" && subScreen === "faculty" && (
          <Faculty classes={viewClasses} onBack={() => setSubScreen(null)} />
        )}
        {tab === "utils" && subScreen === "mess" && (
          <MessMenu now={now} onBack={() => setSubScreen(null)} />
        )}
        {tab === "utils" && subScreen === "por" && (
          <PorDetails onBack={() => setSubScreen(null)} />
        )}
        {tab === "utils" && subScreen === "export" && (
          <CalendarExport
            classes={viewClasses}
            term={viewTerm}
            overrides={viewOverrides}
            onBack={() => setSubScreen(null)}
          />
        )}
        {tab === "utils" && !subScreen && <Utils onOpen={setSubScreen} />}
        {tab === "timetable" && !subScreen && (
          <Timetable
            classes={viewClasses}
            now={now}
            term={viewTerm}
            overrides={viewOverrides}
            onShowCalendar={() => setSubScreen("calendar")}
            // Rescheduling writes, so it is not offered while viewing.
            onReschedule={readOnly ? null : () => setSubScreen("reschedule")}
            onShowBreakdown={() => setSubScreen("breakdown")}
            onShowAttendance={() => setSubScreen("attendance")}
            pendingCount={pendingCount}
          />
        )}
        {tab === "profile" && !subScreen && (
          <Profile
            session={session}
            classes={viewClasses}
            attendance={viewAttendance}
            onToggleMute={readOnly ? null : toggleMute}
            onChangeCourses={readOnly ? null : startOver}
            onSignOut={handleSignOut}
            onScheduleAdmin={isAdmin && !readOnly ? () => setSubScreen("admin") : null}
          />
        )}
        </Suspense>
      </div>

      <nav className="tabs" role="tablist">
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            className="tab"
            role="tab"
            aria-selected={tab === key}
            aria-label={label}
            onClick={() => { setTab(key); setSubScreen(null); }}
          >
            <span className="tab-icon">
              <Icon />
              {key === "timetable" && pendingCount > 0 && (
                <span className="tab-badge">{pendingCount > 9 ? "9+" : pendingCount}</span>
              )}
            </span>
            <span className="tab-label">{label}</span>
          </button>
        ))}
      </nav>

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

/**
 * Offered to admins only, and only when there is more than one live schedule.
 * Switching is for looking at another year's app, which is worth nothing if
 * there is only one year to look at.
 */
function ViewAsPicker({ mine, cohorts, onPick }) {
  const others = cohorts.filter((c) => c.cohort_year !== mine);
  if (!others.length) return null;
  return (
    <div className="viewas-offer">
      <span>Admin — see the app as another year:</span>
      {others.map((c) => (
        <button key={c.id} className="mark" onClick={() => onPick(c)}>
          Class of {c.cohort_year}
        </button>
      ))}
    </div>
  );
}

/**
 * Deliberately loud and always on screen. Someone reading a timetable that is
 * not theirs, with attendance that is empty because it does not exist, needs
 * to be told so on every tab — not just on the one where they switched.
 */
function ViewAsBar({ viewAs, onSection, onExit }) {
  const letters = sectionsOf(viewAs.payload);
  return (
    <div className="viewas-bar">
      <div className="viewas-what">
        Viewing as the <strong>class of {viewAs.cohort}</strong>
        {viewAs.section ? <> · section {viewAs.section}</> : null}
        <span className="viewas-note">
          Nothing is saved and marking is off. Attendance shows empty because
          none exists for this timetable.
        </span>
      </div>
      <div className="viewas-controls">
        {letters.length > 1 && (
          <select
            aria-label="Section"
            value={viewAs.section ?? ""}
            onChange={(e) => onSection(e.target.value)}
          >
            {letters.map((l) => <option key={l} value={l}>Section {l}</option>)}
          </select>
        )}
        <button className="mark" onClick={onExit}>Back to mine</button>
      </div>
    </div>
  );
}

/**
 * `onBack` is passed only on screens that were opened from another one — the
 * timetable's and Utils' sub-screens, schedule admin, and the course editor.
 * The tabs themselves are a flat choice rather than a stack, so nothing there
 * gets an arrow.
 */
function Masthead({ now, onBack = null, backLabel = "Back" }) {
  const label = now.toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short",
  });
  return (
    <header className="masthead">
      <div className="masthead-left">
        {onBack && (
          <button className="masthead-back" onClick={onBack} aria-label={backLabel} title={backLabel}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path
                d="M11 3.5 5.5 9l5.5 5.5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        <div className="wordmark">
          <Mark size={22} />
          <b>IIM<i>Present</i></b>
        </div>
      </div>
      <div className="masthead-date">{label}</div>
    </header>
  );
}
