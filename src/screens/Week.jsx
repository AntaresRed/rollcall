import { DAYS, PHASE_LABEL, pretty, toMinutes, weekdayOf } from "../lib/api";

export default function Week({ classes, now }) {
  const today = weekdayOf(now);

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
                  <div className="week-block" key={c.id}>
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
