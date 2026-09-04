import { useState } from "react";
import DayMessMenu from "./DayMessMenu";
import NightMessMenu from "./NightMessMenu";
import OrderHistory from "./OrderHistory";

/**
 * Day and night mess, under one roof.
 *
 * They are genuinely different things and the screens reflect that — a week
 * of meals versus a priced list — so this is a switch rather than a merged
 * view. The day screen is untouched; it simply renders embedded, without its
 * own heading and back button, which this owns instead.
 *
 * The history sits behind a small button rather than a third tab: it is not a
 * menu, it is a thing you go and look at occasionally, and giving it equal
 * billing with the two menus would misdescribe how often anybody wants it.
 */
export default function MessMenu({ onBack, now = new Date() }) {
  const [when, setWhen] = useState("day");
  const [history, setHistory] = useState(false);

  if (history) {
    return <OrderHistory now={now} onBack={() => setHistory(false)} />;
  }

  return (
    <>
      <div className="eyebrow">
        Mess menu
        <button
          className="eyebrow-act"
          aria-label="Your night canteen order history"
          title="Order history"
          onClick={() => setHistory(true)}
        >
          <ReceiptIcon />
        </button>
      </div>

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

function ReceiptIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      {/* A till roll with a torn bottom edge — the shape people read as a
          receipt without needing the word. */}
      <path
        d="M3.75 2.25h10.5v13.5l-1.75-1.1-1.75 1.1-1.75-1.1-1.75 1.1-1.75-1.1-1.75 1.1V2.25Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
      />
      <path d="M6.25 6.25h5.5M6.25 9.25h5.5" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
