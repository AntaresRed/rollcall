/**
 * One date of a day-grouped list, folded behind its heading.
 *
 * Shared by Edit attendance and Reschedule, which list the same kind of thing
 * — a few weeks of sessions, by date — and are both a long scroll to the one
 * day that needs changing when every date is open.
 *
 * A `<details>`, for the reasons the breakdown's course cards are one: it
 * brings the keyboard, ARIA and open/closed handling with it. Every date
 * starts shut, so a screen opens as a list of dates to choose from.
 */
// `heading` and `aside` rather than day and date: Edit attendance leads with
// the day and Reschedule with the date, so which comes first is the caller's.
// `today` marks the date in place: in a latest-first list it sits partway
// down, not at the top where it used to be easy to find.
export default function DayFold({ heading, aside, today = false, tally = null, children }) {
  return (
    <details className={`daylist fold${today ? " today" : ""}`}>
      <summary className="daylist-date">
        <div className="daylist-day">
          {heading}
          <span>{aside}</span>
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
