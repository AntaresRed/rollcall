import { useMemo, useState } from "react";
import { courseStats } from "../lib/api";
import Stats from "./Stats";
import { OltPasswordSettings } from "./OltSync";

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
  onScheduleAdmin, onOfficialAttendance, onPorDashboard,
  // Testers only: the remembered OLT password, to change or delete.
  // `oltInitial` stands in for its load in the smoke test.
  oltPassword = false, oltInitial,
}) {
  const user = session?.user;
  const meta = user?.user_metadata ?? {};
  const name = meta.full_name || meta.name || user?.email?.split("@")[0] || "Student";
  const avatar = meta.avatar_url || meta.picture || null;
  const [avatarFailed, setAvatarFailed] = useState(false);

  const rows = useMemo(() => courseStats(classes, attendance), [classes, attendance]);

  // "Close to the line" is one skip or fewer — the point at which the next
  // missed class starts to matter.
  const atRisk = useMemo(() => rows.filter((r) => r.skipsLeft <= 1).length, [rows]);

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

      {rows.length > 0 && (
        <div className={`profile-summary${atRisk ? " warn" : ""}`}>
          <strong>{atRisk}</strong>
          <span>{atRisk === 1 ? "course" : "courses"} near the line</span>
        </div>
      )}

      <Stats classes={classes} attendance={attendance} />

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
    </>
  );
}
