import { useMemo, useState } from "react";
import { buildTimetableIcs, icsFilename, deliverIcs } from "../lib/ics";

const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });

/**
 * Put the timetable into Google Calendar or Apple Calendar.
 *
 * One file for both, because they read the same format — the difference is
 * only in how each one takes it in, which is what the two blocks of steps
 * below are for. Google has no way to import a calendar from a URL, so
 * nothing here is a link.
 *
 * The file is a snapshot, and the note at the bottom says so. It is not a
 * subscription: rescheduling a class in RollCall afterwards does not reach a
 * calendar that has already imported it. Exporting again and re-importing is
 * safe, though, and that is deliberate — every event carries a stable UID and
 * a rising SEQUENCE, so the second import edits the events already there
 * rather than laying a duplicate set on top.
 */
export default function CalendarExport({ classes, term, overrides = [], onBack }) {
  const [state, setState] = useState("idle");   // idle | working | done | failed

  const built = useMemo(
    () => buildTimetableIcs(classes, term, overrides),
    [classes, term, overrides],
  );

  const download = async () => {
    setState("working");
    try {
      const how = await deliverIcs(icsFilename(term), built.ics);
      setState(how === "cancelled" ? "idle" : "done");
    } catch {
      setState("failed");
    }
  };

  if (!classes.length || !built.ics || built.count === 0) {
    return (
      <>
        <div className="eyebrow">Add to your calendar</div>
        <div className="empty">
          {classes.length
            ? "No classes fall inside the current term, so there's nothing to export yet."
            : "Pick your courses first."}
        </div>
        {onBack && (
          <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
            Back to timetable
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <div className="eyebrow">Add to your calendar</div>
      <p className="screen-note">
        Your classes as a calendar file, ready for Google Calendar or Apple
        Calendar. Only classes — no term breaks, holidays or exam weeks.
      </p>

      <div className="export-card">
        <div className="export-figure">
          <strong>{built.count}</strong>
          <span>{built.count === 1 ? "class" : "classes"}</span>
        </div>
        <div className="export-detail">
          <div>{fmtDate(built.from)} — {fmtDate(built.to)}</div>
          <div className="export-sub">
            Break weeks and the mid-term gap are already left out, and any class
            you've moved appears on the day you moved it to.
          </div>
        </div>
      </div>

      <button className="btn block" disabled={state === "working"} onClick={download}>
        {state === "working" ? "Preparing…" : "Download calendar file"}
      </button>

      {state === "done" && (
        <div className="banner" style={{ marginTop: 12 }}>
          <p>Saved. Open it with the steps below.</p>
        </div>
      )}
      {state === "failed" && (
        <div className="notice" style={{ marginTop: 12 }}>
          Couldn't produce the file. Try again, or open RollCall in a browser
          tab rather than from the Home Screen.
        </div>
      )}

      <div className="eyebrow">Apple Calendar</div>
      <ol className="steps">
        <li>Open the downloaded <code>.ics</code> file — on iPhone, tap it in Files or straight from the share sheet.</li>
        <li>Choose the calendar to add it to, then <strong>Add All</strong>.</li>
      </ol>

      <div className="eyebrow">Google Calendar</div>
      <ol className="steps">
        <li>Google can only import from a computer, not the phone app.</li>
        <li>Open <span className="mono">calendar.google.com</span>, then the gear icon → <strong>Settings</strong>.</li>
        <li>Pick <strong>Import &amp; export</strong> in the sidebar, select the file, choose a calendar, and import.</li>
      </ol>

      <p className="fineprint">
        This is a snapshot, not a live subscription. If you reschedule a class
        later, export again and import the same way — each class keeps the same
        identity in the file, so the second import moves the event you already
        have rather than adding a second copy of it.
      </p>

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to timetable
        </button>
      )}
    </>
  );
}
