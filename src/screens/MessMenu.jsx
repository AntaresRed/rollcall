import { useState } from "react";
import DayMessMenu from "./DayMessMenu";
import NightMessMenu from "./NightMessMenu";

/**
 * Day and night mess, under one roof.
 *
 * They are genuinely different things and the screens reflect that — a week
 * of meals versus a priced list — so this is a switch rather than a merged
 * view. The day screen is untouched; it simply renders embedded, without its
 * own heading and back button, which this owns instead.
 */
export default function MessMenu({ onBack, now = new Date() }) {
  const [when, setWhen] = useState("day");

  return (
    <>
      <div className="eyebrow">Mess menu</div>

      <div className="daynight" role="tablist" aria-label="Day or night">
        {[["day", "Day mess"], ["night", "Night canteen"]].map(([id, label]) => (
          <button
            key={id}
            className="daynight-tab"
            role="tab"
            aria-selected={when === id}
            onClick={() => setWhen(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {when === "day" ? <DayMessMenu now={now} embedded /> : <NightMessMenu />}

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to utils
        </button>
      )}
    </>
  );
}
