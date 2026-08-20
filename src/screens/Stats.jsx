import { useMemo } from "react";

const THRESHOLD = 75;

export default function Stats({ classes, attendance }) {
  const rows = useMemo(() => {
    // Keyed on the stored subject, not a class lookup — history has to survive
    // a student dropping the course it came from.
    const bySubject = new Map();
    for (const a of attendance) {
      if (!a.subject || a.status === "cancelled") continue;
      const entry = bySubject.get(a.subject) ?? { present: 0, counted: 0 };
      entry.counted += 1;
      if (a.status === "present") entry.present += 1;
      bySubject.set(a.subject, entry);
    }
    return [...bySubject.entries()]
      .map(([subject, v]) => ({
        subject,
        ...v,
        pct: Math.round((v.present / v.counted) * 100),
      }))
      .sort((a, b) => a.pct - b.pct);
  }, [classes, attendance]);

  if (!rows.length) {
    return (
      <>
        <div className="eyebrow">Attendance</div>
        <div className="empty">
          Mark a class present or absent and your running percentage starts here.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="eyebrow">Attendance</div>
      {rows.map((r) => (
        <div className="stat" key={r.subject}>
          <div className="stat-top">
            <span className="stat-name">{r.subject}</span>
            <span className="stat-num">
              {r.present}/{r.counted} · {r.pct}%
            </span>
          </div>
          <div className="track">
            <div
              className={`fill ${r.pct >= THRESHOLD ? "ok" : "low"}`}
              style={{ width: `${r.pct}%` }}
            />
            <div className="threshold" title="75%" />
          </div>
        </div>
      ))}
      <p style={{ fontSize: 12.5, color: "var(--mute)", marginTop: 12 }}>
        The line marks 75%. Cancelled classes are excluded. These percentages
        only count sessions you've marked — a class you forgot to mark isn't in
        the total either way, so treat this as your own record rather than the
        institute's.
      </p>
    </>
  );
}
