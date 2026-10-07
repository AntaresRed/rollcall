import { useId, useState } from "react";
import { findRoom } from "../lib/rooms";
import { track } from "../lib/track";

/**
 * Where the class is, as a label stuck on the course.
 *
 * Shared by Today and the attendance blocks on Profile so the venue looks like
 * one thing wherever it appears. It's the detail a student reads under time
 * pressure — walking, deciding which building — so it's filled in the board
 * colour rather than set as another line of grey metadata.
 *
 * The board colour, specifically, and not the signal colour: this app spends
 * magenta on "now" and green/red on attendance verdicts, so a coloured venue
 * would read as a status rather than a place.
 *
 * Renders nothing at all when the venue is unknown, which is the caller's cue
 * that no space needs reserving for it.
 *
 * Where directions exist, the chip becomes a button that reveals them, rather
 * than printing them under every class. A first-term student needs "first
 * Amphi towards the Auditorium" once; by November it is noise on every row of
 * Today, and Today is a screen people read at a glance. Tucked behind a tap it
 * stays available without costing anything to those who no longer need it.
 */
export default function VenueChip({ venue, className = "" }) {
  const [open, setOpen] = useState(false);
  const noteId = useId();

  if (!venue) return null;

  const info = findRoom(venue);
  const label = (
    <>
      <PinIcon />
      {venue}
    </>
  );

  if (!info) {
    return <span className={`venue-chip ${className}`.trim()}>{label}</span>;
  }

  return (
    <>
      <button
        type="button"
        className={`venue-chip has-note${open ? " open" : ""} ${className}`.trim()}
        aria-expanded={open}
        aria-controls={noteId}
        aria-label={`${venue} — how to find it`}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <svg className="venue-caret" width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M2.5 4 5 6.5 7.5 4" stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && <RoomNote info={info} id={noteId} />}
    </>
  );
}

/**
 * The directions to a room, from its building's door. Shared with the
 * Faculty screen's offices so a room reads the same wherever it is tapped.
 *
 * The descriptions start at the building ("NAB first floor, …"), so the way to
 * the building comes first: the map link is the step before them, and says so.
 */
export function RoomNote({ info, id }) {
  return (
    <span className="venue-note" id={id} role="note">
      First reach{" "}
      <a
        href={info.building.map}
        target="_blank"
        rel="noopener noreferrer"
        // Leaves the app, so nothing else would count it.
        onClick={() => track("open", `map-${info.building.id}`)}
      >
        {info.building.name} on Google Maps
      </a>
      , then: {info.description}
    </span>
  );
}

function PinIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M6 1.2c-1.93 0-3.5 1.53-3.5 3.42C2.5 7.2 6 10.8 6 10.8s3.5-3.6 3.5-6.18C9.5 2.73 7.93 1.2 6 1.2Z"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="4.6" r="1.2" fill="currentColor" />
    </svg>
  );
}
