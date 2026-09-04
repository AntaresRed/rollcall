/**
 * The wall a student hits when the app has no timetable for them.
 *
 * Two genuinely different situations wear the same shape, and telling them
 * apart is the whole job:
 *
 *   A batch year the app knows about, not yet published — a first year in
 *   August, say. Nothing is wrong and nothing is theirs to do; the schedule
 *   will appear. That message should reassure.
 *
 *   An address carrying no batch year at all — faculty, staff, a role
 *   account. The domain gate lets them in because they are genuinely part of
 *   the institute, but there is no timetable for them and there never will
 *   be. That message should say so plainly rather than imply they signed in
 *   wrongly, because they did not.
 *
 * Both carry a way out. Google re-authenticates silently, so a screen with no
 * sign-out is a screen somebody cannot leave — they land back on it every
 * time they open the app, with no way to reach for another account.
 */
export default function NoSchedule({ email, cohort, onSignOut }) {
  return (
    <div className="no-schedule">
      <h2>
        {cohort
          ? "No timetable published for your year yet"
          : "No timetable for this account"}
      </h2>

      {/* No line break between the code element and what follows it: JSX
          turns one into a space, which left the full stop floating off on
          its own when there was no cohort to name. */}
      <p>
        You're signed in as <code>{email}</code>{cohort
          ? <> — the class of <strong>{cohort}</strong>.</>
          : "."}
      </p>

      {cohort ? (
        <p>
          Your batch's schedule hasn't been published to the app yet. It will
          appear here as soon as it is — nothing for you to do.
        </p>
      ) : (
        <p>
          IIMPresent works from the batch year in a student's address — like{" "}
          <code>name2027@email.iimcal.ac.in</code>. This account doesn't carry
          one, so there's no timetable to show. Staff and faculty accounts
          aren't in the app.
        </p>
      )}

      {onSignOut && (
        <button className="btn ghost block no-schedule-out" onClick={onSignOut}>
          Sign out
        </button>
      )}
    </div>
  );
}
