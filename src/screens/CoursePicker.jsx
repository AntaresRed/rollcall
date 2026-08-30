import { useEffect, useMemo, useState } from "react";
import { activeCatalogue } from "../lib/catalogue";
import { DAYS, PHASE_LABEL, pretty, saveTimetable } from "../lib/api";

/** "Mon 10:15 · Wed 12:00" — the whole reason to pick a section. */
function describe(meetings, course) {
  if (course?.schedule_type === "dates") {
    const days = [...new Set(meetings.map((m) => m.date))].sort();
    const first = days[0]?.slice(5).replace("-", "/");
    const last = days[days.length - 1]?.slice(5).replace("-", "/");
    return `${meetings.length} sessions · ${days.length} days · ${first}–${last}`;
  }

  const hasSplit = meetings.some((m) => m.phase);
  if (!hasSplit) {
    return meetings
      .map((m) => `${DAYS[m.day - 1]} ${pretty(m.start).replace(" ", "")}`)
      .join(" · ");
  }

  // Some meetings run one half of term only; others (no phase tag) run every
  // week regardless. Those have to appear in BOTH halves' description, or a
  // weekly Friday meeting would silently vanish just because it isn't also
  // tagged pre_mid or post_mid.
  const fmt = (m) => `${DAYS[m.day - 1]} ${pretty(m.start).replace(" ", "")}`;
  const always = meetings.filter((m) => !m.phase).map(fmt);
  const label = (phase) => [
    ...always,
    ...meetings.filter((m) => m.phase === phase).map(fmt),
  ].join(" & ");
  return `Pre-mid: ${label("pre_mid")} · Post-mid: ${label("post_mid")}`;
}

export default function CoursePicker({ existing = [], onSaved, onDirtyChange }) {
  // Whichever schedule is live — a published upload, or the bundled copy when
  // nothing has been published. Read once per render rather than imported, so
  // this screen can't hold a stale one after a publish.
  const catalogue = activeCatalogue();
  const [query, setQuery] = useState("");
  // { [code]: sectionLetter }
  const [picked, setPicked] = useState(() => seedFrom(existing, activeCatalogue()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // The screen can now be left without saving, so whoever owns the way out
  // needs to know whether leaving costs anything. Compared against the same
  // seed the picks started from — reordering can't happen, so a plain
  // key-by-key comparison is enough.
  useEffect(() => {
    if (!onDirtyChange) return;
    const seed = seedFrom(existing, catalogue);
    const keys = new Set([...Object.keys(seed), ...Object.keys(picked)]);
    onDirtyChange([...keys].some((k) => seed[k] !== picked[k]));
  }, [picked, existing, onDirtyChange, catalogue]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalogue.courses;
    return catalogue.courses.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [query, catalogue.courses]);

  const chosen = Object.entries(picked);

  // A student can't be in two rooms at once — surface it before they save.
  // Keyed on `picked`, not on `chosen`: Object.entries() returns a new array
  // every render, so depending on it meant this memo recomputed on every
  // keystroke in the search box and every section toggle — the one thing a
  // memo exists to stop.
  const clashes = useMemo(() => {
    // Every occupant of a slot is kept, so a three-way pile-up reports all
    // pairs rather than only the first one found.
    const bySlot = new Map();
    for (const [code, letter] of Object.entries(picked)) {
      const course = catalogue.courses.find((c) => c.code === code);
      if (!course) continue;
      for (const m of course.sections[letter] ?? []) {
        // Keyed on weekday, not date: a dated ODS session at Thu 16:15 really
        // does collide with a weekly Thu 16:15 course — just only on the dates
        // ODS actually runs, which `dated` flags for the wording below.
        const key = `${m.day}|${m.start}`;
        const list = bySlot.get(key) ?? [];
        list.push({
          code,
          // A meeting's own phase wins when it has one — MEOB's Friday
          // meeting only clashes with something else also running in the
          // same half of term, not with the course's nominal "full" phase.
          phase: m.phase ?? course.phase,
          day: m.day,
          start: m.start,
          dated: Boolean(m.date),
        });
        bySlot.set(key, list);
      }
    }

    const out = [];
    const seen = new Set();
    for (const list of bySlot.values()) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          if (a.code === b.code) continue;          // same course, other date
          if (!overlappingPhases(a.phase, b.phase)) continue;
          // A dated course repeats a slot across dates; report the fact once.
          const k = `${a.day}|${a.start}|${a.code}|${b.code}`;
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({
            a: a.code,
            b: b.code,
            day: DAYS[a.day - 1],
            start: a.start,
            onlySomeDates: a.dated || b.dated,
          });
        }
      }
    }
    return out;
  }, [picked, catalogue.courses]);

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
          session_date: m.date ?? null,
          start_time: m.start,
          end_time: m.end,
          subject: course.name,
          course_code: course.code,
          section: letter,
          room: course.venue || null,
          // A meeting can carry its own phase — a course that runs the whole
          // term but meets on different days before and after mid-terms tags
          // each meeting individually rather than the course as a whole.
          term_phase: m.phase ?? course.phase,
          credits: course.credits,
          total_classes: course.total_classes,
          min_pct: course.min_pct,
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
        {catalogue.term} · {catalogue.courses.length} courses.
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
            {clashes
              .map((c) =>
                `${c.a} and ${c.b} both run ${c.day} ${pretty(c.start)}` +
                (c.onlySomeDates ? " (on some dates)" : ""))
              .join("; ")}
            . Switch a section, or drop one.
          </p>
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        {results.length === 0 && (
          <div className="empty">No course matches "{query}".</div>
        )}

        {results.map((course) => {
          const letters = Object.keys(course.sections);
          const on = Boolean(picked[course.code]);
          const stored = picked[course.code];
          const active = stored && course.sections[stored] ? stored : letters[0];

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
                    <span>{describe(course.sections[active], course)}</span>
                    <span className="tag quiet">
                      {course.credits} cr · {course.total_classes} classes · {course.min_pct}%
                    </span>
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
                      Section {l} · {describe(course.sections[l], course)}
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
      </div>
    </div>
  );
}

/** Pre-tick whatever the student already saved, so editing feels continuous. */
function seedFrom(rows, catalogue) {
  const out = {};
  for (const r of rows) {
    if (!r.course_code) continue;
    const course = catalogue.courses.find((c) => c.code === r.course_code);
    if (!course) continue;                       // dropped in a term rollover
    const letter = r.section && course.sections[r.section]
      ? r.section
      : Object.keys(course.sections)[0];
    out[r.course_code] = letter;
  }
  return out;
}

/** Pre-mid and post-mid courses never actually collide. */
function overlappingPhases(a, b) {
  if (a === "pre_mid" && b === "post_mid") return false;
  if (a === "post_mid" && b === "pre_mid") return false;
  return true;
}
