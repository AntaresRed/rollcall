import { useState } from "react";
import { HALF_LABEL, loadHalves, saveHalves } from "../lib/halves";

/**
 * The Pre MT / Post MT ticks a screen remembers, and the setter that saves
 * them. `screen` names whose memory this is — the grid and Profile keep
 * theirs apart.
 *
 * Reloaded when the term changes underneath the screen (an admin switching
 * the year they view the app as), since the memory is per term.
 * `initial` stands in for the saved ticks in the smoke test.
 */
export function useHalves(screen, term, date, initial) {
  const id = term ? String(term.id ?? term.term_start ?? "none") : "none";
  const [state, setState] = useState(() => ({
    id, halves: initial ?? loadHalves(screen, term, date),
  }));

  let { halves } = state;
  if (state.id !== id) {
    halves = loadHalves(screen, term, date);
    setState({ id, halves });
  }

  const change = (next) => {
    setState({ id, halves: next });
    saveHalves(screen, term, next);
  };
  return [halves, change];
}

/**
 * Two ticks, not a switch: someone revising for the end-term may want both
 * halves at once. Unticking both leaves the full-term courses, which belong
 * to neither.
 */
export default function HalfTicks({ halves, onChange }) {
  return (
    <div className="half-ticks" role="group" aria-label="Which half of the term to show">
      {["pre_mid", "post_mid"].map((phase) => {
        const key = phase === "pre_mid" ? "pre" : "post";
        return (
          <label className="half-tick" key={phase}>
            <input
              type="checkbox"
              checked={halves[key]}
              onChange={(e) => onChange({ ...halves, [key]: e.target.checked })}
            />
            <span>{HALF_LABEL[phase]}</span>
          </label>
        );
      })}
    </div>
  );
}
