/**
 * Tab icons.
 *
 * Labels of this length can't be read as text alone on a phone, so the
 * icon carries the recognition and the label confirms it. Single stroke
 * weight throughout, inheriting currentColor so the active state is one
 * property change.
 */
const base = {
  width: 21,
  height: 21,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
};

/** A day's list of slots. */
export function TodayIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
      <path d="M8 14h5" />
    </svg>
  );
}

/** The week as a grid. */
export function TimetableIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="4" width="18" height="17" rx="2.5" />
      <path d="M3 9h18M9 9v12M15 9v12" />
    </svg>
  );
}

/** Something left undone. */
export function CatchUpIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5l3 2" />
    </svg>
  );
}

/** A drawer of reference material — the directories and the export. */
export function UtilsIcon() {
  return (
    <svg {...base}>
      <rect x="3" y="4" width="18" height="7" rx="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" />
      <path d="M10 7.5h4M10 16.5h4" />
    </svg>
  );
}

export function ProfileIcon() {
  return (
    <svg {...base}>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  );
}
