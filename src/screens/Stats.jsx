import { useMemo } from "react";
import { courseStats } from "../lib/api";

/**
 * The headline number is skips remaining, not a percentage. "You can miss two
 * more" is the question students are actually asking; the percentage is the
 * long way round to the same answer.
 */
export default function Stats({ classes, attendance, onToggleMute }) {
  const rows = useMemo(() => courseStats(classes, attendance), [classes, attendance]);

  if (!rows.length) {
    return (
      <>
        <div className="eyebrow">Attendance</div>
        <div className="empty">Pick your courses and your budget appears here.</div>
      </>
    );
  }

  return (
    <>
      <div className="eyebrow">Attendance</div>

      {rows.map((r) => {
        const spent = r.allowedAbsences - r.skipsLeft;
        const over = r.skipsLeft < 0;
        const tight = r.skipsLeft === 0;

        return (
          <div className="budget" key={r.subject}>
            <div className="budget-head">
              <div>
                <div className="budget-name">{r.subject}</div>
                <div className="budget-sub">
                  {r.credits} cr · {r.total_classes} classes · {r.min_pct}% needed
                  {r.muted && <span className="tag quiet" style={{ marginLeft: 6 }}>muted</span>}
                </div>
              </div>
              <div className={`budget-count${over ? " over" : tight ? " tight" : ""}`}>
                <strong>{Math.max(0, r.skipsLeft)}</strong>
                <span>{Math.abs(r.skipsLeft) === 1 && !over ? "skip left" : "skips left"}</span>
              </div>
            </div>

            {/* One pip per absence the student is allowed. Filled = used. */}
            <div className="pips" aria-hidden="true">
              {Array.from({ length: r.allowedAbsences }, (_, i) => (
                <span key={i} className={`pip${i < spent ? " spent" : ""}`} />
              ))}
            </div>

            <div className="budget-foot">
              <span>
                {r.present} attended · {r.absent} missed
                {r.cancelled ? ` · ${r.cancelled} cancelled` : ""}
              </span>
              {r.pct !== null && <span>{r.pct}% so far</span>}
            </div>

            {over && (
              <div className="budget-warn">
                Over the limit by {Math.abs(r.skipsLeft)}. Worth talking to the
                academic office rather than relying on this number.
              </div>
            )}

            {onToggleMute && (
              <button
                className="mark"
                style={{ marginTop: 10 }}
                aria-pressed={r.muted}
                onClick={() => onToggleMute(r.subject, !r.muted)}
              >
                {r.muted ? "Unmute alerts" : "Mute alerts"}
              </button>
            )}
          </div>
        );
      })}

      <p style={{ fontSize: 12.5, color: "var(--mute)", marginTop: 14 }}>
        Skips are counted against the classes you've marked absent. Cancelled
        classes don't count. This is your own record — the institute keeps its
        own, and theirs is the one that decides.
      </p>
    </>
  );
}
