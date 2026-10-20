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

      {/* The office moves these dates after publishing, so the dates below
          are a plan rather than a promise — and a student settling leave or
          travel against them needs telling so before reading them. */}
      <div className="banner warn" role="note" style={{ margin: "0 0 18px" }}>
        <p style={{ color: "var(--warn-ink)", fontWeight: 700 }}>
          Tentative dates only, subject to change by MBA office.
        </p>
      </div>

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


      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to timetable
        </button>
      )}
    </>
  );
}
