import { DAYS, PHASE_LABEL, pretty, toMinutes, weekdayOf, isoDate, inSession }
  from "../lib/api";

export default function Week({ classes, now, term }) {
  const today = weekdayOf(now);
  const date = isoDate(now);

  return (
    <>
      <div className="eyebrow">Your week</div>
      <div className="week">
        {DAYS.slice(0, 6).map((label, idx) => {
          const day = idx + 1;
          const blocks = classes
            .filter((c) => c.day_of_week === day)
            .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));

          return (
            <div className="week-col" key={label}>
              <div className={`week-head${day === today ? " today" : ""}`}>{label}</div>
              {blocks.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--mute)", padding: "6px 2px" }}>
                  Free
                </div>
              ) : (
                blocks.map((c) => (
                  <div
                    className="week-block"
                    key={c.id}
                    // A pre-mid course after mid-terms is still on the
                    // timetable but isn't meeting; show it, faded.
                    style={inSession(c.term_phase, date, term) ? undefined : { opacity: 0.45 }}
                  >
                    <div className="t">{pretty(c.start_time)}</div>
                    <div className="n">{c.subject}</div>
                    <div className="t" style={{ marginTop: 4, marginBottom: 0 }}>
                      {c.room || "\u2014"}
                      {PHASE_LABEL[c.term_phase] ? ` · ${PHASE_LABEL[c.term_phase]}` : ""}
                    </div>
                  </div>
                ))
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
