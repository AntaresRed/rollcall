import { useMemo } from "react";

const THRESHOLD = 75;

export default function Stats({ classes, attendance }) {
  const rows = useMemo(() => {
    const bySubject = new Map();
    for (const a of attendance) {
      const cls = classes.find((c) => c.id === a.class_id);
      if (!cls || a.status === "cancelled") continue;
      const entry = bySubject.get(cls.subject) ?? { present: 0, counted: 0 };
      entry.counted += 1;
      if (a.status === "present") entry.present += 1;
      bySubject.set(cls.subject, entry);
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
        The vertical line marks 75%. Cancelled classes are left out of the count.
      </p>
    </>
  );
}
