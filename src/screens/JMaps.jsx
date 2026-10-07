import { useMemo, useState } from "react";
import { BUILDINGS, floorsOf, searchRooms } from "../lib/rooms";
import { track } from "../lib/track";

/**
 * J Maps — how to find any room on campus.
 *
 * Directions here start at a building's door ("NAB first floor, …"), so every
 * view leads with the way to the building: its Google Maps link, and a line
 * saying to get there first. A map can find the building; only someone who
 * has walked it can say which corridor.
 *
 * The buildings are a tab strip, as the hostels are on the mess menu: four
 * choices, and the one you want is usually the same one. Searching looks
 * across all four at once, because someone holding a room number rarely
 * knows which building it is in — that is the question.
 *
 * One row per room, by floor, as the rooms were reviewed: the same sentence
 * repeats down a corridor of K rooms, and that is what a student scanning for
 * their number expects to find beside it.
 */
export default function JMaps({ onBack }) {
  const [id, setId] = useState(BUILDINGS[0]?.id ?? null);
  const [query, setQuery] = useState("");

  const building = BUILDINGS.find((b) => b.id === id) ?? BUILDINGS[0];
  const floors = useMemo(() => floorsOf(building), [building]);
  const results = useMemo(() => searchRooms(query), [query]);
  const searching = query.trim().length > 0;

  return (
    <>
      <div className="eyebrow">J Maps</div>

      <div className="dir-search">
        <SearchIcon />
        <input
          type="search"
          value={query}
          placeholder="Search a room, e.g. K-204, L-21, Tata 211"
          aria-label="Search every building's rooms"
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="dir-clear" aria-label="Clear search" onClick={() => setQuery("")}>
            ×
          </button>
        )}
      </div>

      {searching ? (
        <>
          <div className="dir-bar">
            <span className="dir-count">
              {count(results)} {count(results) === 1 ? "room" : "rooms"}
            </span>
          </div>
          {results.length === 0 && (
            <div className="empty">No room matches that.</div>
          )}
          {results.map(({ building: b, rooms }) => (
            <section className="map-group" key={b.id}>
              <MapLink building={b} />
              {rooms.map((r) => <Room key={r.room} r={r} />)}
            </section>
          ))}
        </>
      ) : (
        <>
          <div className="mess-tabs map-tabs" role="tablist" aria-label="Building">
            {BUILDINGS.map((b) => (
              <button
                key={b.id}
                className="mess-tab"
                role="tab"
                aria-selected={b.id === building?.id}
                onClick={() => setId(b.id)}
              >
                {b.name}
              </button>
            ))}
          </div>

          {building && <MapLink building={building} />}

          {floors.map(({ floor, rooms }) => (
            <section key={floor}>
              <div className="map-floor">{floor === "Ground" ? "Ground floor" : `${floor} floor`}</div>
              {rooms.map((r) => <Room key={r.room} r={r} />)}
            </section>
          ))}
        </>
      )}

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to utils
        </button>
      )}
    </>
  );
}

const count = (groups) => groups.reduce((n, g) => n + g.rooms.length, 0);

/** The step before every description: get to the building. */
function MapLink({ building }) {
  return (
    <div className="map-card">
      <div className="map-card-text">
        <span className="map-card-name">{building.name}</span>
        <span className="map-card-hint">
          Reach {building.name} first, then follow the directions for your room.
        </span>
      </div>
      <a
        className="map-card-go"
        href={building.map}
        target="_blank"
        rel="noopener noreferrer"
        // Leaves the app, so nothing else would count it.
        onClick={() => track("open", `map-${building.id}`)}
      >
        Google Maps
        <ExternalIcon />
      </a>
    </div>
  );
}

function Room({ r }) {
  return (
    <div className="map-room">
      <div className="map-room-head">
        <span className="map-room-no">{r.room}</span>
        {r.name && <span className="map-room-name">{r.name}</span>}
      </div>
      <div className="map-room-desc">{r.description}</div>
    </div>
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

function ExternalIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M7 3.5H4.5A1.5 1.5 0 0 0 3 5v8.5A1.5 1.5 0 0 0 4.5 15H13a1.5 1.5 0 0 0 1.5-1.5V11"
        stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M10.5 3h4.5v4.5M15 3l-6 6" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
