import { useMemo } from "react";
import { isoDate } from "../lib/api";

const fmt = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });

const daysBetween = (a, b) =>
  Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86_400_000) + 1;

/**
 * Term dates and every stretch with no classes.
 *
 * Consulted rarely — a couple of times a term, usually to settle an argument
 * about when Puja break starts — so it lives off the main tabs rather than
 * taking a permanent slot in the bar.
 */
export default function TermCalendar({ term, now, onBack }) {
  const today = isoDate(now);

  const rows = useMemo(() => {
    if (!term) return [];
    const out = [
      {
        kind: "teaching",
        label: "Pre-mid term classes",
        from: term.term_start,
        to: term.pre_mid_end,
      },
      {
        kind: "teaching",
        label: "Post-mid term classes",
        from: term.post_mid_start,
        to: term.term_end,
      },
      ...(term.breaks ?? []).map((b) => ({
        kind: "break",
        label: b.label,
        from: b.from_date,
        to: b.to_date,
        note: b.note,
      })),
    ];
    return out.sort((a, b) => a.from.localeCompare(b.from));
  }, [term]);

  if (!term) {
    return (
      <>
        <div className="eyebrow">Term calendar</div>
        <div className="empty">No term calendar has been set up yet.</div>
      </>
    );
  }

  return (
    <>
      <div className="eyebrow">Term calendar</div>

      <p style={{ color: "var(--slate)", fontSize: 14, margin: "0 0 4px" }}>
        {term.label} runs {fmt(term.term_start)} to {fmt(term.term_end)}.
      </p>
      <p style={{ color: "var(--mute)", fontSize: 12.5, margin: "0 0 18px" }}>
        No alerts fire during the periods marked below, and nothing from them
        turns up in Catch up.
      </p>

      {rows.map((r) => {
        const current = today >= r.from && today <= r.to;
        const past = today > r.to;
        return (
          <div
            className={`cal-row${r.kind === "break" ? " is-break" : ""}${current ? " current" : ""}`}
            key={`${r.label}-${r.from}`}
            style={past && !current ? { opacity: 0.5 } : undefined}
          >
            <div className="cal-bar" />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="cal-label">
                {r.label}
                {current && <span className="tag signal">now</span>}
              </div>
              <div className="cal-dates">
                {fmt(r.from)} – {fmt(r.to)}
                <span> · {daysBetween(r.from, r.to)} days</span>
              </div>
            </div>
          </div>
        );
      })}

      <p style={{ fontSize: 12.5, color: "var(--mute)", marginTop: 16 }}>
        Fixed-date courses publish their own session list and are unaffected by
        these windows — their dates already work around them.
      </p>

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to timetable
        </button>
      )}
    </>
  );
}
