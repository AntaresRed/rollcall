/**
 * Utils — the reference material that isn't this week's schedule.
 *
 * Faculty, student and POR contacts and the calendar export all used to hang
 * off the bottom of the timetable grid as a row of ghost buttons. They had
 * outgrown that: none of them is about the week you are looking at, and six
 * buttons under a grid reads as a junk drawer. Given their own tab they get
 * room for a line saying what each one is, which the buttons never had.
 *
 * The two that genuinely are about the week — Reschedule and Term calendar —
 * stayed behind on the timetable.
 */
/** The institute's own directory. Declared above ITEMS, which reads it. */
const STUDENT_DIRECTORY = "https://student.iimcal.ac.in/jd/#/";

const ITEMS = [
  ["faculty", "Faculty details", "Every professor in the institute directory — office, phone, email."],
  ["export", "Add to Google / Apple calendar", "Put the term's classes into the calendar app you already use."],
  // The institute publishes and maintains the batch directory itself, so this
  // hands over rather than shipping a copy that goes stale and puts four
  // hundred phone numbers in the app bundle.
  ["students", "Student contacts", "The institute's own student directory.", STUDENT_DIRECTORY],
  ["por", "POR details", "Council, clubs, committees and captains, and who to reach in each."],
];

export default function Utils({ onOpen }) {
  return (
    <>
      <div className="eyebrow">Utils</div>
      <div className="util-menu">
        {ITEMS.map(([id, label, desc, href]) => {
          const inside = (
            <>
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
