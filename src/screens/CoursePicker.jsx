import { useMemo, useState } from "react";
import catalogue from "../data/catalogue.json";
import { DAYS, PHASE_LABEL, pretty, saveTimetable } from "../lib/api";

const PHASE_NOTE = {
  full: "Whole term",
  pre_mid: "Pre-mid term only",
  post_mid: "Post-mid term only",
};

/** "Mon 10:15 · Wed 12:00" — the whole reason to pick a section. */
function describe(meetings) {
  return meetings
    .map((m) => `${DAYS[m.day - 1]} ${pretty(m.start).replace(" ", "")}`)
    .join(" · ");
}

export default function CoursePicker({ existing = [], onSaved, onUseImage }) {
  const [query, setQuery] = useState("");
  // { [code]: sectionLetter }
  const [picked, setPicked] = useState(() => seedFrom(existing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalogue.courses;
    return catalogue.courses.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [query]);

  const chosen = Object.entries(picked);

  // A student can't be in two rooms at once — surface it before they save.
  const clashes = useMemo(() => {
    const seen = new Map();
    const out = [];
    for (const [code, letter] of chosen) {
      const course = catalogue.courses.find((c) => c.code === code);
      for (const m of course.sections[letter]) {
        const key = `${m.day}|${m.start}`;
        const prior = seen.get(key);
        if (prior && overlappingPhases(prior.phase, course.phase)) {
          out.push({ a: prior.code, b: code, day: DAYS[m.day - 1], start: m.start });
        } else if (!prior) {
          seen.set(key, { code, phase: course.phase });
        }
      }
    }
    return out;
  }, [chosen]);

  const toggle = (course) => {
    setPicked((p) => {
      const next = { ...p };
      if (next[course.code]) delete next[course.code];
      else next[course.code] = Object.keys(course.sections)[0];
      return next;
    });
  };

  const save = async () => {
    if (!chosen.length) {
      setError("Pick at least one course.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const rows = chosen.flatMap(([code, letter]) => {
        const course = catalogue.courses.find((c) => c.code === code);
        return course.sections[letter].map((m) => ({
          day_of_week: m.day,
          start_time: m.start,
          end_time: m.end,
          subject: course.name,
          course_code: course.code,
          section: letter,
          room: null,
          term_phase: course.phase,
        }));
      });
      onSaved(await saveTimetable(rows));
    } catch (err) {
      setError(err.message || "Couldn't save. Check your connection and try again.");
      setSaving(false);
    }
  };

  return (
    <div style={{ paddingTop: 20 }}>
      <h1 style={{ fontSize: 26, margin: "0 0 6px", letterSpacing: "-0.025em", lineHeight: 1.15 }}>
        Pick your courses
      </h1>
      <p style={{ color: "var(--slate)", margin: "0 0 16px", fontSize: 14 }}>
        {catalogue.term} · {catalogue.courses.length} courses. Days and times come
        straight from the official grid, so there's nothing to type.
      </p>

      <input
        className="search"
        value={query}
        placeholder="Search by name or code"
        aria-label="Search courses"
        onChange={(e) => setQuery(e.target.value)}
      />

      {chosen.length > 0 && (
        <div className="picked-bar">
          {chosen.map(([code]) => (
            <button key={code} className="pill" onClick={() =>
              setPicked((p) => { const n = { ...p }; delete n[code]; return n; })
            }>
              {code} <span aria-hidden="true">×</span>
              <span className="sr-only">Remove {code}</span>
            </button>
          ))}
        </div>
      )}

      {clashes.length > 0 && (
        <div className="banner warn">
          <p>
            {clashes.map((c) => `${c.a} and ${c.b} both run ${c.day} ${pretty(c.start)}`).join("; ")}.
            Switch a section, or drop one.
          </p>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {results.length === 0 && (
          <div className="empty">No course matches "{query}".</div>
        )}

        {results.map((course) => {
          const on = Boolean(picked[course.code]);
          const letters = Object.keys(course.sections);
          const active = picked[course.code] ?? letters[0];

          return (
            <div key={course.code} className={`course-row${on ? " on" : ""}`}>
              <button
                className="course-hit"
                aria-pressed={on}
                onClick={() => toggle(course)}
              >
                <span className="code">{course.code}</span>
                <span className="body">
                  <span className="course">{course.name}</span>
                  <span className="meta">
                    <span>{describe(course.sections[active])}</span>
                    {course.phase !== "full" && (
                      <span className="tag">{PHASE_LABEL[course.phase]}</span>
                    )}
                  </span>
                </span>
                <span className="check" aria-hidden="true">{on ? "✓" : "+"}</span>
              </button>

              {on && letters.length > 1 && (
                <div className="sections">
                  {letters.map((l) => (
                    <button
                      key={l}
                      className="mark"
                      aria-pressed={active === l}
                      onClick={() => setPicked((p) => ({ ...p, [course.code]: l }))}
                    >
                      Section {l} · {describe(course.sections[l])}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <div className="notice">{error}</div>}

      <div className="save-dock">
        <button className="btn block" onClick={save} disabled={saving || !chosen.length}>
          {saving
            ? "Saving…"
            : `Save ${chosen.length || ""} course${chosen.length === 1 ? "" : "s"}`.trim()}
        </button>
        {onUseImage && (
          <button className="linklike" style={{ color: "var(--signal)", marginTop: 10 }} onClick={onUseImage}>
            Read it from a screenshot instead
          </button>
        )}
      </div>
    </div>
  );
}

/** Pre-tick whatever the student already saved, so editing feels continuous. */
function seedFrom(rows) {
  const out = {};
  for (const r of rows) {
    if (r.course_code) out[r.course_code] = r.section || "A";
  }
  return out;
}

/** Pre-mid and post-mid courses never actually collide. */
function overlappingPhases(a, b) {
  if (a === "pre_mid" && b === "post_mid") return false;
  if (a === "post_mid" && b === "pre_mid") return false;
  return true;
}
