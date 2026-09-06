/**
 * Utils — the reference material that isn't this week's schedule.
 *
 * Five entries in one flat list had become a list you read rather than a menu
 * you scan: three of them were contact directories that belong together, and
 * the two that were not sat between them. So the contacts are one door now,
 * and the top level is three doors — people, calendar, food — each with a
 * mark you can recognise before reading the label.
 *
 * Both levels are the same component and the same card, because they are the
 * same act: pick one of a few things. A second level that looked different
 * would suggest it worked differently.
 *
 * The two entries that genuinely are about the week — Reschedule and Term
 * calendar — stayed behind on the timetable.
 */

/** The institute's own directory. Declared above the lists, which read it. */
const STUDENT_DIRECTORY = "https://student.iimcal.ac.in/jd/#/";

/** The top level: three doors. */
const GROUPS = [
  ["contacts", "Faculty and POR Contact Details",
    "Professors, the council, clubs and captains, and the batch directory.",
    ContactsIcon],
  ["export", "Add to Google / Apple calendar",
    "Put the term's classes into the calendar app you already use.",
    CalendarIcon],
  ["mess", "Day-Night Mess & Tuck",
    "The week's mess food, plus night canteen and tuck shop menus you can "
    + "order from over WhatsApp.",
    MessIcon],
];

/** Behind the first door. */
const CONTACTS = [
  ["faculty", "Faculty details",
    "Every professor in the institute directory — office, phone, email.",
    FacultyIcon],
  ["por", "POR details",
    "Council, clubs, committees and captains, and who to reach in each.",
    PorIcon],
  // The institute publishes and maintains the batch directory itself, so this
  // hands over rather than shipping a copy that goes stale and puts four
  // hundred phone numbers in the app bundle.
  ["students", "Student contacts",
    "The institute's own student directory.",
    StudentsIcon, STUDENT_DIRECTORY],
];

const LISTS = { contacts: CONTACTS };
const EYEBROW = { contacts: "Faculty & POR contacts" };

export default function Utils({ onOpen, group = null }) {
  const items = LISTS[group] ?? GROUPS;

  return (
    <>
      <div className="eyebrow">{EYEBROW[group] ?? "Utils"}</div>
      <div className="util-menu">
        {items.map(([id, label, desc, Icon, href]) => {
          const inside = (
            <>
              <span className="util-icon" aria-hidden="true"><Icon /></span>
              <span className="util-text">
                <span className="util-label">{label}</span>
                <span className="util-desc">{desc}</span>
              </span>
              {href ? <ExternalIcon /> : <ChevronIcon />}
            </>
          );
          // An anchor, not a button that navigates: it leaves the app, so it
          // should behave like a link — long-press, open in a new tab, copy
          // the address — and say so with its own icon rather than a chevron
          // that promises another screen.
          return href ? (
            <a
              className="util-item"
              key={id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
            >
              {inside}
            </a>
          ) : (
            <button className="util-item" key={id} onClick={() => onOpen(id)}>
              {inside}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* The marks. Line drawings at one weight, so the three read as a set rather
   than as three borrowed glyphs. */

function ContactsIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3.5h11A1.5 1.5 0 0 1 18.5 5v14a1.5 1.5 0 0 1-1.5 1.5H6Z"
            stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M6 3.5v17M3.5 7.5H6M3.5 12H6M3.5 16.5H6"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12.5" cy="10" r="2.1" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.4 15.6a3.2 3.2 0 0 1 6.2 0" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.2"
            stroke="currentColor" strokeWidth="1.7" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" />
      {/* The arrow is the point: this puts classes somewhere else. */}
      <path d="M12 12.5v5m0 0 2-2m-2 2-2-2" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MessIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.2 12.5h13.6a6.8 6.8 0 0 1-13.6 0Z" stroke="currentColor"
            strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M2.5 20.5h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M20.5 3.5v8.5m0 0v8.5m0-8.5c1.2-1 1.2-2.4 1.2-4V3.5"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function FacultyIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5 21.5 8 12 12.5 2.5 8 12 3.5Z" stroke="currentColor"
            strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M6.5 10v5.2c0 1.6 2.5 2.8 5.5 2.8s5.5-1.2 5.5-2.8V10"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M21.5 8v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PorIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8.5" r="4.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.6 12.4 7 21l5-2.6L17 21l-1.6-8.6" stroke="currentColor"
            strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function StudentsIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3.3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 19a6 6 0 0 1 12 0" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" />
      <path d="M16 5.4a3.3 3.3 0 0 1 0 5.2M17.5 14.2A6 6 0 0 1 21 19"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** Leaves the app — drawn as the usual box-and-arrow rather than a chevron. */
function ExternalIcon() {
  return (
    <svg className="util-go" width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M7 3.5H4.5A1.5 1.5 0 0 0 3 5v8.5A1.5 1.5 0 0 0 4.5 15H13a1.5 1.5 0 0 0 1.5-1.5V11"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M10.5 3h4.5v4.5M15 3l-6 6" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="util-go" width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M7 3.5 12.5 9 7 14.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
