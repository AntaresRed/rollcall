import { useMemo } from "react";
import { courseStats } from "../lib/api";
import VenueChip from "./VenueChip";

/**
 * The course coordinator first, then any other listed instructor, by name.
 *
 * Each name used to carry its email. That was the longest thing on the card
 * and the Faculty directory already holds the same addresses — searchable,
 * beside the room and extension — so this line names who teaches the course
 * and the directory answers how to reach them.
 *
 * The role suffix went with the email rather than staying behind: it only
 * ever appeared on instructors who had no address to show, so keeping it
 * would make two names differ on screen because of a field that isn't on it.
 *
 * Returns null when there's nothing to show, which is the caller's signal
 * to fall back to the credit/class/percent line instead of leaving the
 * subtitle blank.
 */
function formatInstructors(list) {
  if (!list || list.length === 0) return null;
  const cc = list.find((i) => i.role === "CC");
  const ordered = cc ? [cc, ...list.filter((i) => i !== cc)] : list;
  const names = ordered.map((i) => i.name).filter(Boolean);
  return names.length ? names.join("  ·  ") : null;
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
                  <div className="budget-venue"><VenueChip venue={r.venue} /></div>
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
        This is your own record. The institute keeps its own, and theirs is
        the one that decides.
      </p>
    </>
  );
}
