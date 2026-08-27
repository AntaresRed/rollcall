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
 */
export default function VenueChip({ venue, className = "" }) {
  if (!venue) return null;
  return (
    <span className={`venue-chip ${className}`.trim()}>
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path
          d="M6 1.2c-1.93 0-3.5 1.53-3.5 3.42C2.5 7.2 6 10.8 6 10.8s3.5-3.6 3.5-6.18C9.5 2.73 7.93 1.2 6 1.2Z"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeLinejoin="round"
        />
        <circle cx="6" cy="4.6" r="1.2" fill="currentColor" />
      </svg>
      {venue}
    </span>
  );
}
