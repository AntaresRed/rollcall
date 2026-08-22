import { useMemo } from "react";
import {
  DAYS, SLOT_STARTS, SLOT_ENDS, PHASE_LABEL,
  pretty, toMinutes, weekdayOf, isoDate, inSession, breakOn,
} from "../lib/api";

/**
 * The week as an actual grid — time down the left, days across the top.
 *
 * This is how the published timetable looks and how students picture their
 * week, so spatial memory ("Tuesday afternoon block") transfers directly.
 * The day columns scroll horizontally on a phone while the time gutter stays
 * pinned, because six readable columns don't fit in 380px.
 */
export default function Timetable({
  classes, now, term, overrides = [], onShowCalendar, onReschedule,
}) {
  const today = weekdayOf(now);
  const date = isoDate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const activeBreak = breakOn(date, term);
  // Only changes still ahead of us are worth flagging on the grid.
  const upcomingChanges = overrides.filter(
    (o) => (o.new_date ?? o.original_date) >= date,
  ).length;

  // Only render days and slots that are actually in use — an empty Sunday
  // column is just noise, and trimming makes the columns wider.
  const days = useMemo(() => {
    const used = new Set(classes.map((c) => c.day_of_week));
    const list = [1, 2, 3, 4, 5, 6, 7].filter((d) => used.has(d));
    return list.length ? list : [1, 2, 3, 4, 5];
  }, [classes]);

  const slots = useMemo(() => {
    const used = new Set(classes.map((c) => c.start_time));
    const known = SLOT_STARTS.filter((s) => used.has(s));
    // Anything off the standard grid (a hand-entered class) still gets a row.
    const extra = [...used].filter((s) => !SLOT_STARTS.includes(s));
    const all = [...known, ...extra].sort((a, b) => toMinutes(a) - toMinutes(b));
    return all.length ? all : SLOT_STARTS;
  }, [classes]);

  const cell = useMemo(() => {
    const map = new Map();
    for (const c of classes) {
      const k = `${c.day_of_week}|${c.start_time}`;
      const list = map.get(k) ?? [];
      // A fixed-date course occupies the same weekday slot on several dates.
      // The grid is a weekly view, so collapse them into one block and let the
      // tag say it only runs on specific days.
      if (c.session_date && list.some((x) => x.subject === c.subject)) {
        const existing = list.find((x) => x.subject === c.subject);
        existing._dateCount = (existing._dateCount ?? 1) + 1;
      } else {
        list.push({ ...c, _dateCount: c.session_date ? 1 : undefined });
      }
      map.set(k, list);
    }
    return map;
  }, [classes]);

  if (!classes.length) {
    return (
      <>
        <div className="eyebrow">Timetable</div>
        <div className="empty">Pick your courses and your grid appears here.</div>
      </>
    );
  }

  return (
    <>
      <div className="eyebrow">Timetable</div>

      {activeBreak && (
        <div className="banner warn" style={{ marginTop: 0, marginBottom: 14 }}>
          <p>
            <strong>{activeBreak.label}</strong> until{" "}
            {new Date(`${activeBreak.to_date}T00:00:00`).toLocaleDateString(undefined, {
              day: "numeric", month: "short",
            })}
            . No classes, and no alerts.
          </p>
        </div>
      )}

      <div className="tt-scroll">
        <div
          className="tt-grid"
          style={{ gridTemplateColumns: `52px repeat(${days.length}, minmax(126px, 1fr))` }}
        >
          {/* header row */}
          <div className="tt-corner" />
          {days.map((d) => (
            <div key={d} className={`tt-day${d === today ? " today" : ""}`}>
              {DAYS[d - 1]}
            </div>
          ))}

          {/* one row per slot */}
          {slots.map((slot) => {
            const start = toMinutes(slot);
            const end = toMinutes(SLOT_ENDS[slot] ?? slot);
            const liveSlot = nowMinutes >= start && nowMinutes < end;

            return (
              <div className="tt-row" key={slot} style={{ display: "contents" }}>
                <div className={`tt-time${liveSlot ? " live" : ""}`}>
                  {pretty(slot).replace(" ", "")}
                  <small>{pretty(SLOT_ENDS[slot] ?? slot).replace(" ", "")}</small>
                </div>

                {days.map((d) => {
                  const items = cell.get(`${d}|${slot}`) ?? [];
                  const isNow = liveSlot && d === today;

                  return (
                    <div className={`tt-cell${isNow ? " now" : ""}`} key={`${d}|${slot}`}>
                      {items.map((c) => {
                        const running = inSession(c.term_phase, date, term);
                        return (
                          <div
                            className="tt-block"
                            key={c.id}
                            style={running ? undefined : { opacity: 0.42 }}
                          >
                            <div className="tt-name">{c.subject}</div>
                            <div className="tt-meta">
                              {c.room || "—"}
                              {c.section ? ` · ${c.section}` : ""}
                            </div>
                            {(PHASE_LABEL[c.term_phase] || c.muted || c._dateCount) && (
                              <div className="tt-tags">
                                {c._dateCount ? (
                                  <span className="tag signal">
                                    {c._dateCount} date{c._dateCount === 1 ? "" : "s"}
                                  </span>
                                ) : null}
                                {PHASE_LABEL[c.term_phase] && (
                                  <span className="tag">{PHASE_LABEL[c.term_phase]}</span>
                                )}
                                {c.muted && <span className="tag quiet">muted</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <p className="tt-hint">
        Weekly view — rescheduled sessions keep their original slot here.
      </p>

      {/* Only what concerns this week's schedule. Choosing courses is an
          account-level decision and lives on Profile. */}
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        {onReschedule && (
          <button className="btn ghost" style={{ flex: 1 }} onClick={onReschedule}>
            Reschedule
            {upcomingChanges > 0 && (
              <span className="tag signal" style={{ marginLeft: 6 }}>{upcomingChanges}</span>
            )}
          </button>
        )}
        {onShowCalendar && (
          <button className="btn ghost" style={{ flex: 1 }} onClick={onShowCalendar}>
            Term calendar
          </button>
        )}
      </div>
    </>
  );
}
