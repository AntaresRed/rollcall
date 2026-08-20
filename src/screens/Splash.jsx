/**
 * The mark: a tick struck across timetable rules.
 *
 * Drawn inline rather than loaded as an image so it inherits currentColor in
 * the masthead and can animate on the opening screen without a second network
 * request on the critical path.
 */
export function Mark({ size = 22, animated = false }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className={animated ? "mark-draw" : undefined}
    >
      <rect width="48" height="48" rx="11" fill="var(--board)" />
      <g stroke="#7A838E" strokeWidth="2.4" strokeLinecap="round">
        <path d="M10 13h28" />
        <path d="M10 22h28" />
        <path d="M10 31h28" />
        <path d="M10 40h28" />
      </g>
      <path
        className="mark-tick"
        d="M13.5 28.5 L19 34 L32 17"
        stroke="var(--signal)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * Opening screen.
 *
 * Shown for the moment it takes to restore the session and fetch the
 * schedule. It states what it's doing rather than spinning silently, and the
 * tick draws itself once — the same gesture the app is about.
 */
export default function Splash({ message = "Getting your schedule" }) {
  return (
    <div className="splash">
      <div className="splash-mark">
        <Mark size={72} animated />
      </div>
      <div className="splash-word">
        Roll<i>Call</i>
      </div>
      <p className="splash-msg">{message}</p>
      <div className="splash-bar" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}
