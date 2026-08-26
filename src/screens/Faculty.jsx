import { useMemo } from "react";
import { courseFaculty } from "../lib/api";

/**
 * Course coordinator / instructor contact info for the student's own
 * courses — a reference page, not something checked often, which is why it
 * lives behind a button on Timetable rather than taking a tab of its own.
 */
export default function Faculty({ classes, onBack }) {
  const rows = useMemo(() => courseFaculty(classes), [classes]);

  return (
    <>
      <div className="eyebrow">Faculty details</div>
      <p style={{ color: "var(--slate)", fontSize: 14, margin: "0 0 16px" }}>
        Course coordinators and instructors for the courses you've picked.
      </p>

      {rows.length === 0 && (
        <div className="empty">Pick your courses first.</div>
      )}

      {rows.map((r) => (
        <div className="faculty-card" key={r.subject}>
          <div className="course">{r.subject}</div>

          {r.instructors === undefined ? (
            <p className="faculty-note">Not on file for this course.</p>
          ) : r.instructors.length === 0 ? (
            <p className="faculty-note">No instructor listed yet.</p>
          ) : (
            <div className="faculty-list">
              {r.instructors.map((i, idx) => (
                <div className="faculty-row" key={`${r.subject}-${idx}`}>
                  <div className="faculty-person">
                    <span className="faculty-name">{i.name}</span>
                    {i.role && <span className="tag quiet">{i.role}</span>}
                  </div>
                  {i.email ? (
                    <a className="faculty-email" href={`mailto:${i.email}`}>
                      {i.email}
                    </a>
                  ) : (
                    <span className="faculty-email muted">No institute email on file</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to timetable
        </button>
      )}
    </>
  );
}
