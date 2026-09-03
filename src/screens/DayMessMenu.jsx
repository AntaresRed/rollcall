import { useMemo, useState } from "react";
import { HOSTELS, MEALS, hostelById, weekOf, todayName } from "../lib/menu";

/**
 * What the mess is serving, by hostel.
 *
 * The hostels run separate kitchens on separate menus, so the first thing to
 * establish is which one you eat in. That is a tab strip rather than a
 * dropdown: four options, and the one you want is the same one every time, so
 * it should be reachable without opening anything.
 *
 * The week runs Monday to Sunday, with today marked. An earlier version
 * started on today and wrapped, which put the beginning of the week at the
 * bottom of the page and read as a mistake rather than a convenience.
 */
export default function DayMessMenu({ onBack, now = new Date(), embedded = false }) {
  const [id, setId] = useState(HOSTELS[0]?.id ?? null);

  const hostel = useMemo(() => hostelById(id), [id]);
  const week = useMemo(() => weekOf(hostel), [hostel]);
  const today = todayName(now);

  if (!HOSTELS.length) {
    return (
      <>
        {!embedded && <div className="eyebrow">Day mess menu</div>}
        <div className="empty">No menu has been added yet.</div>
        {onBack && <BackButton onBack={onBack} />}
      </>
    );
  }

  return (
    <>
      {!embedded && <div className="eyebrow">Day mess menu</div>}

      <div className="mess-tabs" role="tablist" aria-label="Hostel">
        {HOSTELS.map((h) => (
          <button
            key={h.id}
            className="mess-tab"
            role="tab"
            aria-selected={h.id === id}
            onClick={() => setId(h.id)}
          >
            {h.name}
          </button>
        ))}
      </div>

      {/* Served every day, so it belongs above the week rather than repeated
          seven times inside it. Only OH publishes one. */}
      {hostel?.everyday && Object.keys(hostel.everyday).length > 0 && (
        <div className="mess-everyday">
          <div className="mess-everyday-head">Every day</div>
          {hostel.everyday._all ? (
            <p>{hostel.everyday._all}</p>
          ) : (
            MEALS.filter((m) => hostel.everyday[m]).map((m) => (
              <p key={m}>
                <span className="mess-meal">{m}</span>
                {hostel.everyday[m]}
              </p>
            ))
          )}
        </div>
      )}

      {week.map((d) => (
        <div className={`mess-day${d.day === today ? " today" : ""}`} key={d.day}>
          <div className="mess-date">
            {d.day}
            {d.day === today && <span className="tag signal">today</span>}
          </div>
          {MEALS.map((m) => (
            <div className="mess-row" key={m}>
              <div className="mess-meal">{m}</div>
              <div className="mess-items">{d.meals[m] || "—"}</div>
            </div>
          ))}
        </div>
      ))}

      {onBack && <BackButton onBack={onBack} />}
    </>
  );
}

function BackButton({ onBack }) {
  return (
    <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
      Back to utils
    </button>
  );
}
