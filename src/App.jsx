import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from "react";
import { supabase, getSession, signOut, readAuthError } from "./lib/supabase";
import {
  loadClasses, loadAttendance, loadTerm, markAttendance, unmarkAttendance,
  attendanceKey, isoDate, setCourseMuted, unmarkedSessions,
  loadOverrides, rescheduleSession, clearOverride, occurrencesOn,
} from "./lib/api";
import {
  enableAlerts, alertsActive, registerServiceWorker, pushSupported, isIOS, isStandalone,
  sendTestNotification,
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
  const [alertInfo, setAlertInfo] = useState("");
  const [session, setSession] = useState(null);
  const [authError, setAuthError] = useState(null);

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
    setEditing(true);
  };

  const handleSignOut = useCallback(async () => {
    if (!confirm("Sign out of IIMPresent? Your timetable and attendance stay on the server.")) return;
    await signOut();
  }, []);

  const testAlert = useCallback(async () => {
    const r = await sendTestNotification();
    if (!r.ok) {
      setAlertInfo(
        r.reason === "denied"
          ? "Notifications are blocked for IIMPresent in your browser settings."
          : r.reason === "no-service-worker"
            ? "No service worker is running. Reinstall IIMPresent from the browser menu."
            : "This browser can't show alerts.",
      );
      return;
    }
    // Naming the file that's actually running is the quickest way to spot a
    // stale service worker, which is the usual reason buttons go missing.
    setAlertInfo(
      `Sent. This browser allows ${r.maxActions} action button${r.maxActions === 1 ? "" : "s"}. ` +
      (r.maxActions === 0
        ? "Tap the alert itself to mark attendance."
        : "If you can't see them, pull the notification down to expand it.")
    );
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
      setEditing(false);
      // First run has nowhere to go back to, so Today is the right landing.
      setTab(returnTab ?? "today");
      setReturnTab(null);
      if (!(await alertsActive())) await turnOnAlerts();
    };

    return (
      <div className="shell">
        <Masthead now={now} />
        <Suspense fallback={<div className="screen-loading" aria-hidden="true" />}>
          <CoursePicker existing={classes} onSaved={finish} />
        </Suspense>
      </div>
    );
  }

  // ---- main ----
  return (
    <>
      <Masthead now={now} />
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
        {tab === "timetable" && !subScreen && (
          <Timetable
            classes={classes}
            now={now}
            term={term}
            overrides={overrides}
            onShowCalendar={() => setSubScreen("calendar")}
            onReschedule={() => setSubScreen("reschedule")}
            onTestAlert={testAlert}
            alertInfo={alertInfo}
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

function Masthead({ now }) {
  const label = now.toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short",
  });
  return (
    <header className="masthead">
      <div className="wordmark">
        <Mark size={22} />
        <b>IIM<i>Present</i></b>
      </div>
      <div className="masthead-date">{label}</div>
    </header>
  );
}
