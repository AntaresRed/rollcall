import { useEffect, useMemo, useState } from "react";
import { courseStats, loadExclusiveAvatars } from "../lib/api";
import Stats from "./Stats";
import { OltPasswordSettings } from "./OltSync";
import { AVATARS, avatarSrc, usableExclusive, exclusiveSrc } from "../lib/avatars";
import { track } from "../lib/track";

// The one-person DPs, kept for the rest of the launch so that coming back to
// this tab doesn't flash the Google photo before the kitten (or whatever it
// is) arrives again. Keyed by address, so a different account signing in on
// the same phone never sees the last one's.
let exclusiveCache = { email: null, rows: [] };

/**
 * Account, attendance overview, and the way out.
 *
 * The per-course detail is the same component the Attendance tab used; what's
 * added above it is the one number a student wants at a glance — how many
 * courses are close to the line — and confirmation of which account
 * they're signed in with, which matters on a shared laptop.
 */
export default function Profile({
  session, classes, attendance, onChangeCourses, onSignOut,
  // Needed so the budgets count only marks on sessions that were held — the
  // same count the breakdown shows.
  term = null, now, overrides = [],
  onScheduleAdmin, onOfficialAttendance, onPorDashboard,
  // Admins only: other years' published schedules, to see the app as one.
  viewAsCohorts = [], onViewAs = null,
  // Testers only: the remembered OLT password, to change or delete.
  // `oltInitial` stands in for its load in the smoke test.
  oltPassword = false, oltInitial,
  // The animal DP from profiles.avatar, and how to change it — null while
  // viewing as another cohort, when nothing on this tab writes.
  // `startPicking` opens the picker for the smoke test.
  avatarKey = null, onChangeAvatar = null, startPicking = false,
  // DPs made for this student alone; `exclusiveInitial` stands in for their
  // load in the smoke test.
  exclusiveInitial,
}) {
  const user = session?.user;
  const meta = user?.user_metadata ?? {};
  const name = meta.full_name || meta.name || user?.email?.split("@")[0] || "Student";
  const avatar = meta.avatar_url || meta.picture || null;
  const [avatarFailed, setAvatarFailed] = useState(false);

  const email = user?.email ?? null;
  const [exclusive, setExclusive] = useState(() => usableExclusive(
    exclusiveInitial ?? (exclusiveCache.email === email ? exclusiveCache.rows : [])));
  useEffect(() => {
    if (exclusiveInitial !== undefined || !email) return undefined;
    let live = true;
    // A failure, or a database without the table yet, is simply "none":
    // the student keeps every other choice.
    loadExclusiveAvatars()
      .then((rows) => {
        exclusiveCache = { email, rows };
        if (live) setExclusive(usableExclusive(rows));
      })
      .catch(() => {});
    return () => { live = false; };
  }, [email, exclusiveInitial]);

  // Null for a key this build can't draw, as well as for no pick: either way
  // the Google photo is what shows, so it's also what the picker marks.
  const mine = exclusive.find((x) => x.key === avatarKey);
  const picked = avatarSrc(avatarKey) ?? (mine ? exclusiveSrc(mine) : null);
  const current = picked ? avatarKey : null;
  const [picking, setPicking] = useState(startPicking);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const rows = useMemo(
    () => courseStats(classes, attendance, term, now ?? new Date(), overrides),
    [classes, attendance, term, now, overrides],
  );

  // "Close to the line" is one skip or fewer — the point at which the next
  // missed class starts to matter.
  const atRisk = useMemo(() => rows.filter((r) => r.skipsLeft <= 1).length, [rows]);

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  // The Google photo, or the initials when there is none that loads. Drawn on
  // the card and again as the picker's first choice.
  const googleFace = (className) => (avatar && !avatarFailed ? (
    <img
      className={className}
      src={avatar}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setAvatarFailed(true)}
    />
  ) : (
    <div className={`${className} profile-avatar-fallback`} aria-hidden="true">
      {initials || "?"}
    </div>
  ));

  const face = picked
    ? <img className="profile-avatar" src={picked} alt="" />
    : googleFace("profile-avatar");

  const openPicker = () => {
    track("open", "avatar");
    setSaveError("");
    setPicking(true);
  };

  // The picker closes only once the pick has saved, so the card never shows
  // a picture the database didn't take — on the next open it would quietly
  // go back to the old one.
  const choose = async (key) => {
    if (key === current) { setPicking(false); return; }
    setSaving(true);
    setSaveError("");
    try {
      await onChangeAvatar(key);
      setPicking(false);
    } catch {
      setSaveError("Couldn't save your picture. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="eyebrow">Profile</div>

      <div className="profile-card">
        {onChangeAvatar ? (
          <button type="button" className="profile-avatar-btn"
                  aria-label="Change profile picture" onClick={openPicker}>
            {face}
            <span className="profile-avatar-edit" aria-hidden="true">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h4L19 9l-4-4L4 16z" />
              </svg>
            </span>
          </button>
        ) : face}

        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="profile-name">{name}</div>
          {user?.email && <div className="profile-email">{user.email}</div>}
        </div>
      </div>

      {rows.length > 0 && (
        <div className={`profile-summary${atRisk ? " warn" : ""}`}>
          <strong>{atRisk}</strong>
          <span>{atRisk === 1 ? "course" : "courses"} near the line</span>
        </div>
      )}

      <Stats classes={classes} attendance={attendance} term={term} now={now} overrides={overrides} />

      <div className="profile-actions">
        {/* Testers only, and again only a way in: olt_attendance's policy
            returns nothing to anyone else. */}
        {onOfficialAttendance && (
          <button className="btn ghost block" onClick={onOfficialAttendance}>
            Official attendance (OLT)
          </button>
        )}
        {oltPassword && <OltPasswordSettings email={user?.email ?? ""} initial={oltInitial} />}
        {/* Only rendered for an admin, and only as a way in — the database
            policies are what actually decide who may publish. */}
        {onScheduleAdmin && (
          <button className="btn ghost block" onClick={onScheduleAdmin}>
            Schedule admin
          </button>
        )}
        {onPorDashboard && (
          <button className="btn ghost block" onClick={onPorDashboard}>
            POR dashboard
          </button>
        )}
        {/* Here, with the other admin tools. It used to sit across the top
            of every tab, where only one person ever needed it. */}
        {onViewAs && viewAsCohorts.length > 0 && (
          <div className="viewas-offer">
            <span>See the app as another year</span>
            {viewAsCohorts.map((c) => (
              <button key={c.id} className="mark" onClick={() => onViewAs(c)}>
                Class of {c.cohort_year}
              </button>
            ))}
          </div>
        )}
        {onChangeCourses && (
          <button className="btn ghost block" onClick={onChangeCourses}>
            Change my courses
          </button>
        )}
        {onSignOut && (
          <button className="btn ghost block signout" onClick={onSignOut}>
            Sign out
          </button>
        )}
      </div>

      <p className="made-by">Made by Anuj Kapse</p>

      {picking && onChangeAvatar && (
        <div
          className="modal-back"
          onClick={(e) => { if (e.target === e.currentTarget && !saving) setPicking(false); }}
        >
          <div className="modal avatar-modal" role="dialog" aria-modal="true"
               aria-label="Choose a profile picture">
            <div className="modal-head">
              <span>Choose a picture</span>
              <button className="modal-x" aria-label="Close" disabled={saving}
                      onClick={() => setPicking(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              {saveError && <p className="avatar-error">{saveError}</p>}
              <div className="avatar-grid">
                <button type="button" className={`avatar-choice${current === null ? " sel" : ""}`}
                        aria-pressed={current === null} disabled={saving} onClick={() => choose(null)}>
                  {googleFace("avatar-choice-img")}
                  <span>Google photo</span>
                </button>
                {exclusive.map((x) => (
                  <button key={x.key} type="button"
                          className={`avatar-choice${current === x.key ? " sel" : ""}`}
                          aria-pressed={current === x.key} disabled={saving}
                          onClick={() => choose(x.key)}>
                    <img className="avatar-choice-img" src={exclusiveSrc(x)} alt="" />
                    <span>{x.name}</span>
                    <span className="avatar-only">{x.caption}</span>
                  </button>
                ))}
                {AVATARS.map((a) => (
                  <button key={a.key} type="button"
                          className={`avatar-choice${current === a.key ? " sel" : ""}`}
                          aria-pressed={current === a.key} disabled={saving}
                          onClick={() => choose(a.key)}>
                    <img className="avatar-choice-img" src={avatarSrc(a.key)} alt="" />
                    <span>{a.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
