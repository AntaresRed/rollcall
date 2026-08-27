import { useMemo } from "react";
import { courseStats } from "../lib/api";

/**
 * "Prof. X · x@iimcal.ac.in" for the course coordinator, plus any other
 * listed instructor by name (visiting faculty rarely have an institute
 * email, so that's shown as a role tag rather than a broken mailto).
 *
 * Returns null when there's nothing to show, which is the caller's signal
 * to fall back to the credit/class/percent line instead of leaving the
 * subtitle blank.
 */
function formatInstructors(list) {
  if (!list || list.length === 0) return null;
  const cc = list.find((i) => i.role === "CC");
  const ordered = cc ? [cc, ...list.filter((i) => i !== cc)] : list;
  return ordered
    .map((i) =>
      i.email
        ? `${i.name} · ${i.email}`
        : `${i.name}${i.role ? ` (${i.role})` : ""}`,
    )
    .join("  ·  ");
}

/**
 * Where the class actually is. Venue is the one detail on this screen a
 * student reads under time pressure — walking, deciding which building — so
 * it's a chip rather than another line of grey metadata, and it sits in
 * neutral ink rather than the signal colour, which this app reserves for
 * "now" and for attendance verdicts.
 */
function PinIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M6 1.2c-1.93 0-3.5 1.53-3.5 3.42C2.5 7.2 6 10.8 6 10.8s3.5-3.6 3.5-6.18C9.5 2.73 7.93 1.2 6 1.2Z"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="4.6" r="1.2" fill="currentColor" />
    </svg>
  );
}

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
        const instructorLine = formatInstructors(r.instructors);

        return (
          <div className="budget" key={r.subject}>
            <div className="budget-head">
              <div>
                <div className="budget-name">{r.subject}</div>
                <div className="budget-sub">
                  {instructorLine ?? `${r.credits} cr · ${r.total_classes} classes · ${r.min_pct}% needed`}
                  {r.muted && <span className="tag quiet" style={{ marginLeft: 6 }}>muted</span>}
                </div>
                {r.venue && (
                  <div className="budget-venue">
                    <span className="venue-chip">
                      <PinIcon />
                      {r.venue}
                    </span>
                  </div>
                )}
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
