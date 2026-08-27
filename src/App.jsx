import { useEffect, useState, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { supabase, getSession, signOut, readAuthError } from "./lib/supabase";
import {
  loadClasses, loadAttendance, loadTerm, markAttendance, unmarkAttendance,
  attendanceKey, isoDate, setCourseMuted, unmarkedSessions,
  loadOverrides, rescheduleSession, clearOverride, occurrencesOn,
} from "./lib/api";
import {
  enableAlerts, alertsActive, registerServiceWorker, pushSupported, isIOS, isStandalone,
} from "./lib/push";

import Splash, { Mark } from "./screens/Splash";
import SignIn from "./screens/SignIn";
import { TodayIcon, TimetableIcon, CatchUpIcon, ProfileIcon } from "./screens/TabIcons";
const CoursePicker = lazy(() => import("./screens/CoursePicker"));
import Today from "./screens/Today";
const Timetable = lazy(() => import("./screens/Timetable"));
const Profile = lazy(() => import("./screens/Profile"));
const CatchUp = lazy(() => import("./screens/CatchUp"));
const TermCalendar = lazy(() => import("./screens/TermCalendar"));
const Reschedule = lazy(() => import("./screens/Reschedule"));
const Faculty = lazy(() => import("./screens/Faculty"));
const CalendarExport = lazy(() => import("./screens/CalendarExport"));

// What the masthead's back arrow says it returns to, per sub-screen. Tabs
// themselves don't stack — they're a flat choice, and back through a tab you
// only glanced at is worse than no back at all — so only these push a level.
const SUB_SCREEN_BACK = {
  calendar: "Back to timetable",
  reschedule: "Back to timetable",
  faculty: "Back to timetable",
  export: "Back to timetable",
};

const TABS = [
  ["today", "Today's classes", TodayIcon],
  ["timetable", "Week's Timetable", TimetableIcon],
  ["catchup", "Missed Attendances", CatchUpIcon],
  ["profile", "Profile", ProfileIcon],
];

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

        const [c, a, t, o] = await Promise.all([
          loadClasses(), loadAttendance(), loadTerm(), loadOverrides(),
        ]);
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

  const pendingCount = useMemo(
    () => unmarkedSessions(classes, attendance, term, now, 28, overrides).length,
    [classes, attendance, term, now, overrides],
  );

  const todaysOccurrences = useMemo(
    () => occurrencesOn(classes, term, isoDate(now), overrides),
    [classes, term, now, overrides],
  );

  // ---- everything below this line may return early ----
  if (!ready) return <Splash />;
  if (!session) return <SignIn error={authError} />;
  if (fatal) return <div className="shell"><div className="notice" style={{ marginTop: 40 }}>{fatal}</div></div>;

  // ---- onboarding ----
  if (!classes.length || editing) {
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
          <CoursePicker
            existing={classes}
            onSaved={finish}
            onDirtyChange={notePickerDirty}
          />
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
      <div className="shell">
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
            attendance={attendance}
            now={now}
            onMark={mark}
          />
        )}
        {tab === "timetable" && subScreen === "calendar" && (
          <TermCalendar term={term} now={now} onBack={() => setSubScreen(null)} />
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
        {tab === "timetable" && subScreen === "faculty" && (
          <Faculty classes={classes} onBack={() => setSubScreen(null)} />
        )}
        {tab === "timetable" && subScreen === "export" && (
          <CalendarExport
            classes={classes}
            term={term}
            overrides={overrides}
            onBack={() => setSubScreen(null)}
          />
        )}
        {tab === "timetable" && !subScreen && (
          <Timetable
            classes={classes}
            now={now}
            term={term}
            overrides={overrides}
            onShowCalendar={() => setSubScreen("calendar")}
            onReschedule={() => setSubScreen("reschedule")}
            onShowFaculty={() => setSubScreen("faculty")}
            onExport={() => setSubScreen("export")}
          />
        )}
        {tab === "catchup" && (
          <CatchUp
            classes={classes}
            attendance={attendance}
            term={term}
            overrides={overrides}
            now={now}
            onMark={mark}
          />
        )}
        {tab === "profile" && (
          <Profile
            session={session}
            classes={classes}
            attendance={attendance}
            onToggleMute={toggleMute}
            onChangeCourses={startOver}
            onSignOut={handleSignOut}
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
              {key === "catchup" && pendingCount > 0 && (
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
 * `onBack` is passed only on screens that were opened from another one — the
 * timetable's sub-screens and the course editor. The four tabs are a flat
 * choice rather than a stack, so nothing there gets an arrow.
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
