import { useMemo, useState } from "react";
import { activeCatalogue } from "../lib/catalogue";
import { saveTimetable, PHASE_LABEL, pretty, DAYS } from "../lib/api";
import VenueChip from "./VenueChip";

/**
 * First run for a first year: pick a section, then confirm the courses.
 *
 * Second years choose electives, so they get a searchable course list. First
 * years do not choose anything — the curriculum is core, and which of the six
 * sections you are in determines your entire week, down to the room. Handing
 * them the elective picker would be asking a question with one right answer
 * they have to assemble by hand from twenty-two cells.
 *
 * The second step exists because "determined" is not quite "certain": a
 * student may be exempt from a course, repeating one, or auditing. Everything
 * arrives ticked, and unticking is the exception rather than the task.
 */
export default function SectionPicker({
  existing = [], onSaved, onDirtyChange, catalogue: given = null, readOnly = false,
}) {
  // Normally the live schedule, but takeable as a prop so the admin preview
  // can render a cohort other than its own — the whole point of the preview
  // is to look at a catalogue that is not the one you are running on.
  const catalogue = given ?? activeCatalogue();

  // Section letters come from the catalogue rather than being hardcoded A–F:
  // a smaller intake would run fewer, and the grid is the authority.
  const letters = useMemo(() => {
    const found = new Set();
    for (const c of catalogue.courses ?? []) {
      for (const letter of Object.keys(c.sections ?? {})) found.add(letter);
    }
    return [...found].sort();
  }, [catalogue]);

  // Coming back to change something, the saved rows say which section it was.
  const savedSection = useMemo(() => {
    const seen = existing.map((r) => r.section).filter(Boolean);
    return letters.includes(seen[0]) ? seen[0] : null;
  }, [existing, letters]);

  const [section, setSection] = useState(savedSection);
  const [dropped, setDropped] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const courses = useMemo(() => {
    if (!section) return [];
    return (catalogue.courses ?? [])
      .filter((c) => (c.sections?.[section] ?? []).length)
      .map((c) => ({ ...c, meetings: c.sections[section] }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [catalogue, section]);

  const chosen = courses.filter((c) => !dropped.has(c.code));

  const pickSection = (letter) => {
    setSection(letter);
    // Unticking is per-section; carrying a decision across a change of section
    // would silently drop a course the student never looked at.
    setDropped(new Set());
    onDirtyChange?.(true);
  };

  const toggle = (code) => {
    setDropped((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
    onDirtyChange?.(true);
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const rows = chosen.flatMap((c) =>
        c.meetings.map((m) => ({
          subject: c.name,
          course_code: c.code,
          section,
          day_of_week: m.day,
          start_time: m.start,
          end_time: m.end,
          // The room follows the section, so it is on the meeting.
          room: m.room ?? c.venue ?? null,
          // A meeting that runs only one half says so; one that runs all term
          // inherits the course's own phase.
          term_phase: m.phase ?? c.phase ?? "full",
          credits: c.credits,
          total_classes: c.total_classes,
          min_pct: c.min_pct,
        })),
      );
      const saved = await saveTimetable(rows);
      onDirtyChange?.(false);
      onSaved(saved);
    } catch (err) {
      console.error(err);
      setError("Couldn't save that. Check your connection and try again.");
      setBusy(false);
    }
  };

  // ---- step one ----
  if (!section) {
    return (
      <>
        <div className="eyebrow">Your section</div>
        <p className="screen-note">
          {catalogue.term}. Pick your section and your timetable follows.
        </p>

        <div className="sec-grid">
          {letters.map((letter) => (
            <button className="sec-tile" key={letter} onClick={() => pickSection(letter)}>
              <span className="sec-letter">{letter}</span>
              <span className="sec-room">{roomOf(catalogue, letter) ?? "—"}</span>
            </button>
          ))}
        </div>

        {!letters.length && (
          <div className="empty">
            This schedule has no sections in it. It may have been published in
            the wrong format — tell whoever administers the app.
          </div>
        )}
      </>
    );
  }

  // ---- step two ----
  // Counting stored meetings would overstate the week: a course whose slot
  // moves at the mid-term stores both, but a student only ever sits one of
  // them in a given half. So count each half separately and say so.
  const load = (half) =>
    chosen.reduce((n, c) => n + c.meetings.filter((m) => {
      const phase = m.phase ?? c.phase ?? "full";
      return phase === "full" || phase === half;
    }).length, 0);
  const pre = load("pre_mid");
  const post = load("post_mid");

  return (
    <>
      <div className="eyebrow">Section {section}</div>
      <p className="screen-note">
        {chosen.length} of {courses.length} courses ·{" "}
        {pre === post
          ? `${pre} classes a week`
          : `${pre} a week before the mid-term, ${post} after`}
        . Untick anything you aren't taking.
      </p>

      <div className="sections">
        {courses.map((c) => {
          const on = !dropped.has(c.code);
          return (
            <button
              className={`sec-course${on ? " on" : ""}`}
              key={c.code}
              aria-pressed={on}
              onClick={() => toggle(c.code)}
            >
              <span className="sec-check" aria-hidden="true">{on ? "✓" : ""}</span>
              <span className="sec-body">
                <span className="sec-name">{c.name}</span>
                <span className="sec-meta">
                  {c.credits} cr · {c.total_classes} classes · {c.min_pct}% needed
                  {PHASE_LABEL[c.phase] ? ` · ${PHASE_LABEL[c.phase]}` : ""}
                </span>
                <span className="sec-when">
                  {c.meetings.map((m, i) => (
                    <span key={i}>
                      {DAYS[m.day - 1]} {pretty(m.start).replace(" ", "")}
                      {m.phase ? ` (${PHASE_LABEL[m.phase] ?? m.phase})` : ""}
                      {i < c.meetings.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </span>
                {c.meetings[0]?.room && (
                  <span className="sec-venue"><VenueChip venue={c.meetings[0].room} /></span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {error && <div className="notice" style={{ marginTop: 14 }}>{error}</div>}

      <div className="save-dock">
        <button className="btn ghost" onClick={() => { setSection(null); setDropped(new Set()); }}>
          Change section
        </button>
        {!readOnly && (
          <button className="btn" disabled={busy || !chosen.length} onClick={save}>
            {busy ? "Saving…" : `Save ${chosen.length} course${chosen.length === 1 ? "" : "s"}`}
          </button>
        )}
      </div>
    </>
  );
}

/** The room a section meets in — the same for all its classes, so the first
 *  one that names a room speaks for the section. */
function roomOf(catalogue, letter) {
  for (const c of catalogue.courses ?? []) {
    for (const m of c.sections?.[letter] ?? []) {
      if (m.room) return m.room;
    }
  }
  return null;
}
