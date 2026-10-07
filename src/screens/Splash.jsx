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
export default function Splash({ message = "Getting your schedule", draw = true, task = false }) {
  return (
    <div className="splash">
      <div className="splash-mark">
        {/* `draw` off where this takes over from a splash already on screen —
            the leave mail's return from Google — so the tick isn't struck
            twice in a row. */}
        <Mark size={72} animated={draw} />
      </div>
      <div className="splash-word">
        IIM<i>Present</i>
      </div>
      <p className="splash-motto">No JST for classes.</p>
      {/* A live region, so a screen reader hears the leave mail's steps
          change. `task` sets the line apart and louder: there it is news
          about something the student asked for, not the opening screen's
          aside. */}
      <p className={`splash-msg${task ? " splash-task" : ""}`} role="status">{message}</p>
      <div className="splash-bar" aria-hidden="true">
        <span />
      </div>
      {/* The same signature as the foot of Profile, set a step louder here:
          on Profile it sits under a page of settings, while on the opening
          screen it has the whole foot to itself. */}
      <p className="made-by splash-credit">Made by <b>Anuj Kapse</b></p>
    </div>
  );
}
