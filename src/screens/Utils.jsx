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
const ITEMS = [
  ["faculty", "Faculty details", "Every professor in the institute directory — office, phone, email."],
  ["export", "Add to Google / Apple calendar", "Put the term's classes into the calendar app you already use."],
  ["students", "Student contacts", "The batch, by name, registration number or phone."],
  ["por", "POR details", "Council, clubs, committees and captains, and who to reach in each."],
];

export default function Utils({ onOpen }) {
  return (
    <>
      <div className="eyebrow">Utils</div>
      <div className="util-menu">
        {ITEMS.map(([id, label, desc]) => (
          <button className="util-item" key={id} onClick={() => onOpen(id)}>
            <span className="util-text">
              <span className="util-label">{label}</span>
              <span className="util-desc">{desc}</span>
            </span>
            <ChevronIcon />
          </button>
        ))}
      </div>
    </>
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
