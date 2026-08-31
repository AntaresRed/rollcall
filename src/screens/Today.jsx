import { useMemo } from "react";
import { DAY_LONG, PHASE_LABEL, pretty, toMinutes, weekdayOf, isoDate, venueOf } from "../lib/api";
import VenueChip from "./VenueChip";

/**
 * `occurrences` arrive already resolved by the caller: term windows, breaks
 * and any rescheduling applied, each carrying its effective time. This screen
 * only has to render them.
 */
export default function Today({ occurrences, attendance, now, onMark }) {
  const today = weekdayOf(now);
  const date = isoDate(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const list = useMemo(() => occurrences, [occurrences]);

  // Keyed on the slot too: a course with two sessions in a day gets two marks.
  const statusOf = (c) =>
    attendance.find(
      (a) =>
        a.subject === c.subject &&
        a.class_date === date &&
        String(a.start_time).slice(0, 5) === String(c.start_time).slice(0, 5),
    )?.status ?? null;

  // The now-marker sits above the first class still to come. Note the
  // destructuring: entries are occurrences, `{ cls, date, movedFrom }`, not
  // class rows.
  const nextIndex = list.findIndex(({ cls }) => toMinutes(cls.end_time) > nowMins);

  const clock = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  if (!list.length) {
    return (
      <>
        <div className="eyebrow">{DAY_LONG[today]}</div>
        <div className="empty">
          Nothing scheduled today. Your next class shows up here automatically.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="eyebrow">{DAY_LONG[today]}</div>
      <div className="day">
        {list.map(({ cls: c, movedFrom }, i) => {
          const status = statusOf(c);
          const past = toMinutes(c.end_time) <= nowMins;
          const live =
            toMinutes(c.start_time) <= nowMins && nowMins < toMinutes(c.end_time);
          const phase = PHASE_LABEL[c.term_phase];

          return (
            <div key={`${c.id}|${movedFrom ?? date}`}>
              {i === nextIndex && !live && (
                <div className="now-line" aria-hidden="true">
                  <span className="now-label">{clock}</span>
                  <span className="now-rule" />
                </div>
              )}

              <div className={`slot${past ? " is-past" : ""}${i === nextIndex ? " is-next" : ""}`}>
                <div className="slot-time">
                  {pretty(c.start_time).replace(" ", "")}
                  <small>{pretty(c.end_time).replace(" ", "")}</small>
                </div>

                <div>
                  <div className="course">{c.subject}</div>
                  <div className="meta">
                    {/* venueOf, not c.room: rows saved before the course
                        picker carried venue through have a null room, and the
                        catalogue still knows where the course meets. */}
                    <VenueChip venue={venueOf(c)} />
                    {phase && <span className="tag">{phase}</span>}
                    {live && <span className="tag signal">In session</span>}
                    {c.muted && <span className="tag quiet">muted</span>}
                    {movedFrom && <span className="tag signal">rescheduled</span>}
                  </div>

                  {/* Present and Absent only. "Cancelled" was removed as a
                      choice: classes here are rescheduled rather than called
                      off, so it offered a wrong answer more often than a right
                      one. Rows already carrying that status still display and
                      still sit outside the attendance percentage — see
                      courseStats — it simply cannot be set any more. */}
                  <div className="marks choice">
                    {[
                      ["present", "Present"],
                      ["absent", "Absent"],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        className={`mark ${key}`}
                        aria-pressed={status === key}
                        onClick={() => onMark(c, date, status === key ? null : key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
