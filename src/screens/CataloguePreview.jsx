import { useMemo, useState } from "react";
import { occurrencesOn, isoDate } from "../lib/api";
import Today from "./Today";
import Timetable from "./Timetable";

/**
 * See a schedule as a student on it would, without being one.
 *
 * The admin account belongs to one cohort, so it can only ever load one year's
 * catalogue for itself. Checking that the other year parsed correctly used to
 * mean publishing it and looking at the result, which is exactly the wrong
 * order — publishing moves term dates and rewrites saved rows.
 *
 * So this renders directly from a payload: the real Today and Timetable
 * screens, fed synthesised class rows, with no database in the loop. Nothing
 * here writes. The rows carry `preview-` ids that exist nowhere, and marking
 * is disabled rather than merely ineffective, so a stray tap cannot record
 * attendance against the admin's own account.
 *
 * It deliberately works on an unpublished upload. Verifying a parse before it
 * goes live is the entire point.
 */
export default function CataloguePreview({ payload, label, onClose }) {
  const sections = useMemo(() => {
    const found = new Set();
    for (const c of payload.courses ?? []) {
      for (const letter of Object.keys(c.sections ?? {})) found.add(letter);
    }
    return [...found].sort();
  }, [payload]);

  const bySection = (payload.kind ?? "electives") === "sections";
  const [section, setSection] = useState(sections[0] ?? null);

  // The term this schedule describes, in the shape the screens expect.
  const term = useMemo(() => {
    const cal = payload.calendar;
    if (!cal) return null;
    return {
      label: payload.term,
      term_start: cal.term_start,
      pre_mid_end: cal.pre_mid_end,
      post_mid_start: cal.post_mid_start,
      term_end: cal.term_end,
      breaks: (cal.breaks ?? []).map((b) => ({
        label: b.label, from_date: b.from, to_date: b.to,
      })),
    };
  }, [payload]);

  // Start on the first teaching day rather than today: a term being checked in
  // advance has not begun, and an empty grid tells you nothing.
  const [when, setWhen] = useState(() => {
    const today = isoDate(new Date());
    const start = payload.calendar?.term_start;
    const end = payload.calendar?.term_end;
    return start && today < start ? start : (end && today > end ? start ?? today : today);
  });

  // Class rows exactly as the picker would save them — same fields, same
  // phase and room resolution — so what is rendered is what a student gets.
  const classes = useMemo(() => {
    const out = [];
    for (const c of payload.courses ?? []) {
      const letters = bySection ? (section ? [section] : []) : Object.keys(c.sections ?? {});
      for (const letter of letters) {
        (c.sections?.[letter] ?? []).forEach((m, i) => {
          out.push({
            id: `preview-${c.code}-${letter}-${i}`,
            subject: c.name,
            course_code: c.code,
            section: letter,
            day_of_week: m.day,
            session_date: m.date ?? null,
            start_time: m.start,
            end_time: m.end,
            room: m.room ?? c.venue ?? null,
            term_phase: m.phase ?? c.phase ?? "full",
            credits: c.credits,
            total_classes: c.total_classes,
            min_pct: c.min_pct,
            muted: false,
            confirmed: true,
          });
        });
      }
    }
    return out;
  }, [payload, section, bySection]);

  const now = useMemo(() => {
    // Noon on the chosen day: far enough into it that nothing reads as "not
    // started yet", and the live-class marker lands somewhere sensible.
    const d = new Date(`${when}T12:00:00`);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }, [when]);

  const occurrences = useMemo(
    () => occurrencesOn(classes, term, when, []),
    [classes, term, when],
  );

  // Counting rows would overstate the week: a course whose slot moves at the
  // mid-term stores both, but only one is ever sat in a given half.
  const load = (half) => classes.filter((c) => {
    const phase = c.term_phase ?? "full";
    return phase === "full" || phase === half;
  }).length;
  const pre = load("pre_mid");
  const post = load("post_mid");

  return (
    <div className="preview-pane">
      <div className="preview-bar">
        <div className="preview-title">
          Previewing <strong>{label}</strong>
          {payload.cohort_year ? <> · class of {payload.cohort_year}</> : null}
        </div>
        <button className="mark" onClick={onClose}>Close</button>
      </div>

      <div className="preview-controls">
        {bySection && sections.length > 0 && (
          <label className="preview-field">
            <span>Section</span>
            <select value={section ?? ""} onChange={(e) => setSection(e.target.value)}>
              {sections.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        )}
        <label className="preview-field">
          <span>As of</span>
          <input
            type="date"
            value={when}
            min={payload.calendar?.term_start}
            max={payload.calendar?.term_end}
            onChange={(e) => setWhen(e.target.value)}
          />
        </label>
      </div>

      <p className="preview-note">
        {pre === post ? `${pre} classes a week` :
          `${pre} a week before the mid-term, ${post} after`}
        {bySection && section ? ` in section ${section}` : ""} ·{" "}
        {occurrences.length} on {when}. Marking is off — nothing here is saved.
      </p>

      {!term && (
        <div className="notice">
          This schedule has no calendar block, so term dates and break weeks
          can't be checked.
        </div>
      )}

      <div className="preview-screen">
        <Today
          occurrences={occurrences}
          attendance={[]}
          now={now}
          onMark={() => {}}
          readOnly
        />
      </div>

      <div className="preview-screen">
        <Timetable classes={classes} now={now} term={term} overrides={[]} />
      </div>
    </div>
  );
}
