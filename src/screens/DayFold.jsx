/**
 * One date of a day-grouped list, folded behind its heading.
 *
 * Shared by Edit attendance and Reschedule, which list the same kind of thing
 * — a few weeks of sessions, by date — and are both a long scroll to the one
 * day that needs changing when every date is open.
 *
 * A `<details>`, for the reasons the breakdown's course cards are one: it
 * brings the keyboard, ARIA and open/closed handling with it. `defaultOpen`
 * is only read on the first render — pass a value that doesn't change, or a
 * date will snap shut under the student's thumb when its contents do.
 */
export default function DayFold({ day, date, tally = null, defaultOpen = false, children }) {
  return (
    <details className="daylist fold" open={defaultOpen}>
      <summary className="daylist-date">
        <div className="daylist-day">
          {day}
          <span>{date}</span>
        </div>
        {tally}
        <svg className="daylist-chevron" width="13" height="13" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M4.5 7 9 11.5 13.5 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </summary>
      {children}
    </details>
  );
}
