import { useEffect, useState, useCallback } from "react";
import { ensureSession } from "./lib/supabase";
import {
  loadClasses, loadAttendance, loadTerm, markAttendance, unmarkAttendance,
  attendanceKey, isoDate,
} from "./lib/api";
import {
  enableAlerts, alertsActive, registerServiceWorker, pushSupported, isIOS, isStandalone,
} from "./lib/push";

import CoursePicker from "./screens/CoursePicker";
import Onboard from "./screens/Onboard";
import Confirm from "./screens/Confirm";
import Today from "./screens/Today";
import Week from "./screens/Week";
import Stats from "./screens/Stats";

const TABS = [
  ["today", "Today"],
  ["week", "Week"],
  ["stats", "Attendance"],
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [classes, setClasses] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [term, setTerm] = useState(null);
  const [draft, setDraft] = useState(null);      // parsed rows awaiting confirmation
  const [entry, setEntry] = useState("picker");  // 'picker' | 'image'
  const [tab, setTab] = useState("today");
  const [now, setNow] = useState(new Date());
  const [alerts, setAlerts] = useState(false);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState("");
  const [fatal, setFatal] = useState("");

  const say = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  };

  // ---- boot ----
  useEffect(() => {
    (async () => {
      try {
        await ensureSession();
        await registerServiceWorker();
        const [c, a, t] = await Promise.all([loadClasses(), loadAttendance(), loadTerm()]);
        setClasses(c);
        setAttendance(a);
        setTerm(t);
        setAlerts(await alertsActive());
      } catch (err) {
        console.error(err);
        setFatal("Couldn't reach RollCall. Check your connection and reload.");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // ---- keep the now-marker honest ----
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    const onVisible = () => document.visibilityState === "visible" && setNow(new Date());
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
    const cls = classes.find((c) => c.id === classId);
    if (!cls) {
      window.history.replaceState({}, "", "/");
      return;
    }
    mark(cls, date, "present");
    say("Marked present");
    window.history.replaceState({}, "", "/");
  }, [ready, classes, mark]);

  const turnOnAlerts = async () => {
    try {
      const result = await enableAlerts();
      if (result === "enabled") { setAlerts(true); say("Alerts on"); }
      else if (result === "denied") say("Notifications are blocked in your browser settings");
      else if (result === "needs-install") say("Add RollCall to your Home Screen first");
      else if (result === "misconfigured") say("Alerts aren't configured on this deployment");
      else say("This browser can't do alerts");
    } catch {
      say("Couldn't turn on alerts. Try again.");
    }
  };

  const startOver = () => {
    setEntry("picker");
    setEditing(true);
  };

  if (!ready) return <div style={{ padding: 40 }}><div className="spinner" /></div>;
  if (fatal) return <div className="shell"><div className="notice" style={{ marginTop: 40 }}>{fatal}</div></div>;

  // ---- onboarding ----
  if (draft) {
    return (
      <div className="shell">
        <Masthead now={now} />
        <Confirm
          initial={draft}
          onCancel={() => setDraft(null)}
          onSaved={async (saved) => {
            setClasses(saved);
            setDraft(null);
            setTab("today");
            if (!(await alertsActive())) await turnOnAlerts();
          }}
        />
      </div>
    );
  }

  if (!classes.length || editing) {
    const finish = async (saved) => {
      setClasses(saved);
      setEditing(false);
      setTab("today");
      if (!(await alertsActive())) await turnOnAlerts();
    };

    return (
      <div className="shell">
        <Masthead now={now} />
        {entry === "picker" ? (
          <CoursePicker
            existing={classes}
            onSaved={finish}
            onUseImage={() => setEntry("image")}
          />
        ) : (
          <Onboard
            onParsed={setDraft}
            onManual={() => setDraft([])}
            onUsePicker={() => setEntry("picker")}
          />
        )}
      </div>
    );
  }

  // ---- main ----
  const iosNeedsInstall = isIOS() && !isStandalone();

  return (
    <>
      <Masthead now={now} />
      <div className="shell">
        {!alerts && pushSupported() && (
          <div className={`banner${iosNeedsInstall ? " warn" : ""}`}>
            {iosNeedsInstall ? (
              <p>
                On iPhone, alerts only work once RollCall is on your Home Screen.
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

        {tab === "today" && (
          <Today
            classes={classes}
            attendance={attendance}
            term={term}
            now={now}
            onMark={mark}
          />
        )}
        {tab === "week" && (
          <>
            <Week classes={classes} now={now} term={term} />
            <button className="btn ghost block" style={{ marginTop: 20 }} onClick={startOver}>
              Change my courses
            </button>
          </>
        )}
        {tab === "stats" && <Stats classes={classes} attendance={attendance} />}
      </div>

      <nav className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            className="tab"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
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
      <div className="wordmark">Roll<span>Call</span></div>
      <div className="masthead-date">{label}</div>
    </header>
  );
}
