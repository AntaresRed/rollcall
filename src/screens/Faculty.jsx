import { useMemo, useState } from "react";
import { facultyDirectory, facultyCount } from "../lib/directory";

/**
 * The institute faculty directory — every name, room, extension, direct line
 * and address on file, searchable.
 *
 * This replaced a course-by-course instructor list. That list answered only
 * "who teaches my courses", which is the question a student has once a term;
 * "what's Prof. so-and-so's extension" is the one they have on the way to a
 * meeting, and the answer wasn't in the app at all. The course view survives
 * as a filter and as the tags on each card, so nothing was actually lost.
 */
export default function Faculty({ classes = [], onBack }) {
  const [query, setQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);

  const rows = useMemo(
    () => facultyDirectory(classes, query, mineOnly),
    [classes, query, mineOnly],
  );

  // Offering the filter when it would empty the screen is worse than not
  // offering it — a student with no picked courses gets no tags either.
  const teachesMe = useMemo(
    () => facultyDirectory(classes, "", true).length,
    [classes],
  );

  return (
    <>
      <div className="eyebrow">Faculty directory</div>
      <p className="screen-note">
        All {facultyCount} faculty on the institute directory. Search by name,
        room, extension or email.
      </p>

      <div className="dir-search">
        <SearchIcon />
        <input
          type="search"
          value={query}
          placeholder="Search faculty…"
          aria-label="Search the faculty directory"
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="dir-clear" aria-label="Clear search" onClick={() => setQuery("")}>
            ×
          </button>
        )}
      </div>

      <div className="dir-bar">
        <span className="dir-count">
          {rows.length} {rows.length === 1 ? "person" : "people"}
        </span>
        {teachesMe > 0 && (
          <button
            className={`chip-toggle${mineOnly ? " on" : ""}`}
            aria-pressed={mineOnly}
            onClick={() => setMineOnly((v) => !v)}
          >
            My courses only
          </button>
        )}
      </div>

      {rows.length === 0 && (
        <div className="empty">
          {mineOnly
            ? "Nobody on the directory matches that within your courses."
            : "Nobody on the directory matches that."}
        </div>
      )}

      {rows.map((p) => (
        <div className="dir-card" key={p.name}>
          <div className="dir-head">
            <span className="dir-name">{p.name}</span>
            {p.title && <span className="tag quiet">{p.title}</span>}
          </div>

          {p.courses.length > 0 && (
            <div className="dir-courses">
              {p.courses.map((c) => (
                <span className="tag signal" key={c}>{c}</span>
              ))}
            </div>
          )}

          {p.offices.map((o, idx) => (
            <div className="dir-office" key={`${p.name}|${idx}`}>
              {o.label && <div className="dir-office-label">{o.label} office</div>}

              <dl className="dir-fields">
                <Field label="Room" value={o.room} />
                <Field label="Ext" value={o.ext} />
                <Field
                  label="Direct"
                  value={o.direct}
                  href={o.direct ? `tel:${o.direct.replace(/[^\d+]/g, "")}` : null}
                />
                <Field label="Email" value={o.email} href={o.email ? `mailto:${o.email}` : null} wide />
              </dl>
            </div>
          ))}
        </div>
      ))}

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to utils
        </button>
      )}
    </>
  );
}

/**
 * A field with nothing on file is rendered as an em dash rather than dropped,
 * so the four fields line up down the list and "no direct line" reads as a
 * fact about the person instead of a gap in the layout.
 *
 * `direct` carries a couple of numbers on one line for a few people
 * ("033-7121-2040 / 1150"). The tel: link takes the digits it can and dials
 * the first, which is the right one often enough to be worth the tap.
 */
function Field({ label, value, href, wide }) {
  return (
    <div className={`dir-field${wide ? " wide" : ""}`}>
      <dt>{label}</dt>
      <dd>
        {value == null ? (
          <span className="muted">—</span>
        ) : href ? (
          <a href={href}>{value}</a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
