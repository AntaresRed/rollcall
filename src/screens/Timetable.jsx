import { useMemo, useState } from "react";
import {
  DAYS, SLOT_STARTS, SLOT_ENDS, PHASE_LABEL,
  pretty, toMinutes, weekdayOf, isoDate, phaseActive, breakOn, undecidedReschedules,
  rescheduleProposals, loadDismissedProposals, dismissProposal,
} from "../lib/api";

const fmtWhen = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short",
  });

/**
 * The week as an actual grid — time down the left, days across the top.
 *
 * This is how the published timetable looks and how students picture their
 * week, so spatial memory ("Tuesday afternoon block") transfers directly.
 * The day columns scroll horizontally on a phone while the time gutter stays
 * pinned, because six readable columns don't fit in 380px.
 */
export default function Timetable({
  classes, now, term, overrides = [], consensus = [], onShowCalendar, onReschedule,
  onShowBreakdown, onShowAttendance, onMove, pendingCount = 0,
}) {
  const today = weekdayOf(now);
  const date = isoDate(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const activeBreak = breakOn(date, term);
  // The Reschedule badge counts classes still waiting for a date — the same
  // kind of number as Edit attendance's badge: something left to do, rather
  // than a tally of changes already made, which the screen itself lists.
  const waitingForDate = useMemo(
    () => undecidedReschedules(overrides, classes).length,
    [overrides, classes],
  );

  // Moves enough of the section has recorded that this student hasn't. This
  // sits on the grid rather than behind the Reschedule button because it is
  // news about the week being looked at — a badge on a button only reaches
  // the people who were already going to press it.
  const [dismissed, setDismissed] = useState(loadDismissedProposals);
  const [busy, setBusy] = useState(false);
  const proposals = useMemo(
    () => rescheduleProposals(classes, term, consensus, overrides, dismissed),
    [classes, term, consensus, overrides, dismissed],
  );

  // Accepting is an ordinary move, made through the same call the Reschedule
  // form uses — so the mark already made travels with it, and this student's
  // own report joins the count they just agreed with.
  const accept = async (p) => {
    if (!onMove) return;
    setBusy(true);
    try {
      await onMove(p.cls, p.originalDate, {
        newDate: p.newDate,
        newStart: p.newStart,
        newEnd: SLOT_ENDS[p.newStart] ?? null,
      });
    } finally {
      setBusy(false);
    }
  };

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
                      {/* Only the half of the term that is running. These
                          used to all be drawn, with the other half dimmed —
                          readable when a slot rarely held two courses, but the
                          first-year grid runs both halves through the same five
                          slots, so every cell showed two courses and one of
                          them was always wrong for today. */}
                      {items.filter((c) => phaseActive(c.term_phase, date, term)).map((c) => {
                        return (
                          <div className="tt-block" key={c.id}>
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

      {/* Only what concerns this week's schedule: the two that change or
          explain it, then the two about what was recorded against it. The
          directories and the calendar export are reference material rather
          than the week itself, so they live under Utils; choosing courses is
          an account-level decision and lives on Profile. */}
      <div className="tt-actions">
        {onReschedule && (
          <button className="btn ghost" onClick={onReschedule}>
            Reschedule
            {waitingForDate > 0 && (
              <span className="tag signal" style={{ marginLeft: 6 }}>{waitingForDate}</span>
            )}
          </button>
        )}
        {onShowCalendar && (
          <button className="btn ghost" onClick={onShowCalendar}>
            Term calendar
          </button>
        )}
        {onShowBreakdown && (
          <button className="btn ghost" onClick={onShowBreakdown}>
            Attendance breakdown
          </button>
        )}
        {onShowAttendance && (
          <button className="btn ghost" onClick={onShowAttendance}>
            Edit attendance
            {pendingCount > 0 && (
              <span className="tag signal" style={{ marginLeft: 6 }}>{pendingCount}</span>
            )}
          </button>
        )}
      </div>

      {/* Stated, not applied. The section being sure is good evidence about a
          class and no evidence at all about whether this student takes it the
          way the others do — so it stays a sentence with two answers until
          one of them is given. */}
      {onMove && proposals.map((p) => (
        <div className="banner compact" key={p.key}>
          <p>
            <strong>{p.cls.subject}</strong> moved to {fmtWhen(p.newDate)}{" "}
            {pretty(p.newStart)} — {p.reports} in your section recorded this.
          </p>
          <div className="banner-acts">
            <button className="mark" disabled={busy} onClick={() => accept(p)}>
              Accept
            </button>
            <button className="mark" onClick={() => setDismissed(dismissProposal(p.key))}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </>
  );
}
