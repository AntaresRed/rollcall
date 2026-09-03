import { useMemo, useState } from "react";
import {
  CANTEENS, canteenById, filterMenu, countItems, DIET_FILTERS, DIET_LABEL,
} from "../lib/nightmenu";

/**
 * The night canteens — a priced list per hostel.
 *
 * Read at 1am to decide what to order, which shapes everything here. The
 * canteen's phone number is at the top because ordering is a phone call. There
 * is a search box because two hundred and fifty items is too many to scroll.
 * And there is a diet filter, because "is there anything vegetarian in here"
 * is the question a third of the batch opens this asking.
 */
export default function NightMessMenu() {
  const [id, setId] = useState(CANTEENS[0]?.id ?? null);
  const [diet, setDiet] = useState("all");
  const [query, setQuery] = useState("");

  const canteen = useMemo(() => canteenById(id), [id]);
  const shown = useMemo(
    () => filterMenu(canteen, { diet, query }),
    [canteen, diet, query],
  );

  const total = useMemo(
    () => countItems(canteen?.categories ?? []),
    [canteen],
  );
  const showing = countItems(shown);

  if (!CANTEENS.length) {
    return <div className="empty">No night menu has been added yet.</div>;
  }

  return (
    <>
      <div className="mess-tabs" role="tablist" aria-label="Canteen">
        {CANTEENS.map((c) => (
          <button
            key={c.id}
            className="mess-tab"
            role="tab"
            aria-selected={c.id === id}
            onClick={() => setId(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {canteen && (
        <div className="canteen-head">
          <div className="canteen-name">{canteen.canteen}</div>
          <div className="canteen-meta">
            {canteen.phone && (
              <a className="canteen-call" href={`tel:${canteen.phone.split("/")[0].trim()}`}>
                {canteen.phone}
              </a>
            )}
            {canteen.hours && <span>{canteen.hours}</span>}
            {canteen.room_service && <span>Room service ₹{canteen.room_service}</span>}
          </div>
        </div>
      )}

      <div className="diet-row" role="group" aria-label="Diet">
        {DIET_FILTERS.map((f) => (
          <button
            key={f.id}
            className={`diet-chip${diet === f.id ? " on" : ""}`}
            aria-pressed={diet === f.id}
            onClick={() => setDiet(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="dir-search">
        <SearchIcon />
        <input
          type="search"
          value={query}
          placeholder="Search the menu…"
          aria-label="Search the night menu"
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="dir-clear" aria-label="Clear search" onClick={() => setQuery("")}>
            ×
          </button>
        )}
      </div>

      <div className="dir-bar">
        <span className="dir-count">
          {showing === total ? `${total} items` : `${showing} of ${total}`}
        </span>
      </div>

      {!shown.length && (
        <div className="empty">Nothing on this menu matches that.</div>
      )}

      {shown.map((cat) => (
        <div className="night-cat" key={cat.name}>
          <div className="night-cat-head">
            {cat.name}
            <span>{cat.items.length}</span>
          </div>
          {cat.items.map((item) => (
            <div className="night-row" key={item.name}>
              <span className={`diet-dot ${item.diet}`} title={DIET_LABEL[item.diet]} />
              <span className="night-item">{item.name}</span>
              {/* Everything in this column is a price, including the
                  "22/25" the canteens print for two sizes. */}
              <span className="night-price">₹{item.price}</span>
            </div>
          ))}
        </div>
      ))}

      {/* Said once, at the foot, rather than on each of the twelve rows it
          applies to: those items were on the printed menu with no indication
          either way, and nobody has checked with the kitchen. */}
      {shown.some((c) => c.items.some((i) => i.diet === "unknown")) && (
        <p className="night-note">
          A hollow dot means nobody has confirmed whether the dish is
          vegetarian. Those are shown under every filter — ask the counter
          rather than trusting this screen.
        </p>
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
