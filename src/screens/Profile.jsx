import { useMemo, useState } from "react";
import { courseStats } from "../lib/api";
import Stats from "./Stats";

/**
 * Account, attendance overview, and the way out.
 *
 * The per-course detail is the same component the Attendance tab used; what's
 * added above it is the summary a student actually wants at a glance — how
 * many courses are close to the line — and confirmation of which account
 * they're signed in with, which matters on a shared laptop.
 */
export default function Profile({ session, classes, attendance, onToggleMute, onSignOut }) {
  const user = session?.user;
  const meta = user?.user_metadata ?? {};
  const name = meta.full_name || meta.name || user?.email?.split("@")[0] || "Student";
  const avatar = meta.avatar_url || meta.picture || null;
  const [avatarFailed, setAvatarFailed] = useState(false);

  const rows = useMemo(() => courseStats(classes, attendance), [classes, attendance]);

  const summary = useMemo(() => {
    const attended = rows.reduce((n, r) => n + r.present, 0);
    const counted = rows.reduce((n, r) => n + r.present + r.absent, 0);
    return {
      courses: rows.length,
      pct: counted ? Math.round((attended / counted) * 100) : null,
      // "Close to the line" is one skip or fewer — the point at which the
      // next missed class starts to matter.
      atRisk: rows.filter((r) => r.skipsLeft <= 1).length,
    };
  }, [rows]);

  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <>
      <div className="eyebrow">Profile</div>

      <div className="profile-card">
        {avatar && !avatarFailed ? (
          <img
            className="profile-avatar"
            src={avatar}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          <div className="profile-avatar profile-avatar-fallback" aria-hidden="true">
            {initials || "?"}
          </div>
        )}

        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="profile-name">{name}</div>
          {user?.email && <div className="profile-email">{user.email}</div>}
        </div>
      </div>

      {summary.courses > 0 && (
        <div className="profile-summary">
          <div className="ps-cell">
            <strong>{summary.courses}</strong>
            <span>{summary.courses === 1 ? "course" : "courses"}</span>
          </div>
          <div className="ps-cell">
            <strong>{summary.pct === null ? "—" : `${summary.pct}%`}</strong>
            <span>attended</span>
          </div>
          <div className={`ps-cell${summary.atRisk ? " warn" : ""}`}>
            <strong>{summary.atRisk}</strong>
            <span>near the line</span>
          </div>
        </div>
      )}

      <Stats classes={classes} attendance={attendance} onToggleMute={onToggleMute} />

      {onSignOut && (
        <button className="btn ghost block" style={{ marginTop: 24 }} onClick={onSignOut}>
          Sign out
        </button>
      )}
    </>
  );
}
