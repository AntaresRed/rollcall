import { useMemo, useState } from "react";
import {
  POR_MENU, nodeAt, trailOf, countUnder, searchPor, porTotal,
} from "../lib/por";
import { prettyPhone, telHref, whatsAppHref } from "../lib/phone";

/**
 * Positions of responsibility, as a small menu over seven contact lists.
 *
 * The hierarchy is the point: three hundred and fifty POR holders flattened
 * into one list would be unusable, and nobody looking for their club's
 * treasurer wants to scroll past the sports captains to find them. So the
 * screen keeps its own path and drills down, rather than being seven separate
 * sub-screens wired into App — the nesting belongs to this feature, not to the
 * app's navigation.
 */
export default function PorDetails({ onBack }) {
  const [path, setPath] = useState([]);
  const [query, setQuery] = useState("");

  const node = nodeAt(path);
  // A path that no longer resolves falls back to the top menu rather than
  // rendering nothing.
  const level = path.length === 0 || !node ? POR_MENU : node.children;
  const trail = trailOf(path);

  const go = (id) => { setPath((p) => [...p, id]); setQuery(""); };
  const upTo = (depth) => { setPath((p) => p.slice(0, depth)); setQuery(""); };

  const leafId = node?.dataset ?? null;

  return (
    <>
      <div className="eyebrow">POR details</div>

      <nav className="por-crumbs" aria-label="Where you are">
        <button className="por-crumb" onClick={() => upTo(0)} disabled={path.length === 0}>
          All
        </button>
        {trail.map((n, i) => (
          <span key={n.id} className="por-crumb-wrap">
            <span className="por-crumb-sep" aria-hidden="true">/</span>
            <button
              className="por-crumb"
              onClick={() => upTo(i + 1)}
              disabled={i === trail.length - 1}
            >
              {n.label}
            </button>
          </span>
        ))}
      </nav>

      {leafId
        ? <ContactList datasetId={leafId} query={query} onQuery={setQuery} />
        : <Menu items={level ?? POR_MENU} atRoot={path.length === 0} onPick={go} />}

      <button
        className="btn ghost block"
        style={{ marginTop: 18 }}
        onClick={() => (path.length ? upTo(path.length - 1) : onBack?.())}
      >
        {path.length ? `Back to ${trail[trail.length - 2]?.label ?? "all POR details"}` : "Back to timetable"}
      </button>
    </>
  );
}

function Menu({ items, atRoot, onPick }) {
  return (
    <>
      {atRoot && (
        <p className="screen-note">
          Who holds which post across the batch — {porTotal} people in all.
        </p>
      )}
      <div className="por-menu">
        {items.map((item) => (
          <button className="por-item" key={item.id} onClick={() => onPick(item.id)}>
            <span className="por-item-label">{item.label}</span>
            <span className="por-item-count">{countUnder(item)}</span>
            <svg className="por-item-go" width="16" height="16" viewBox="0 0 16 16"
                 fill="none" aria-hidden="true">
              <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.7"
                    strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>
    </>
  );
}

function ContactList({ datasetId, query, onQuery }) {
  const sections = useMemo(() => searchPor(datasetId, query), [datasetId, query]);
  const found = sections.reduce((n, s) => n + s.people.length, 0);

  return (
    <>
      <div className="dir-search">
        <SearchIcon />
        <input
          type="search"
          value={query}
          placeholder="Search by name, post or number…"
          aria-label="Search these contacts"
          autoComplete="off"
          onChange={(e) => onQuery(e.target.value)}
        />
        {query && (
          <button className="dir-clear" aria-label="Clear search" onClick={() => onQuery("")}>
            ×
          </button>
        )}
      </div>

      <div className="dir-bar">
        <span className="dir-count">{found} {found === 1 ? "person" : "people"}</span>
      </div>

      {found === 0 && <div className="empty">Nobody here matches that.</div>}

      {sections.map((section) => (
        <section className="por-section" key={`${section.label ?? "all"}|${section.kind ?? ""}`}>
          {/* A single unnamed section is the whole list — a heading over it
              would only repeat the screen's own title. */}
          {section.label && (
            <h3 className="por-section-head">
              {section.label}
              {section.kind && <span className="tag quiet">{section.kind}</span>}
            </h3>
          )}

          {section.people.map((p, i) => (
            <div className="por-row" key={`${p.name}|${p.role ?? ""}|${i}`}>
              <div className="por-who">
                <span className="por-name">{p.name}</span>
                {p.role && <span className="por-role">{p.role}</span>}
                {p.email && (
                  <a className="por-email" href={`mailto:${p.email}`}>{p.email}</a>
                )}
              </div>

              <div className="por-contact">
                {p.phone ? (
                  <>
                    <a className="contact-phone" href={telHref(p.phone)}>
                      <PhoneIcon />
                      {prettyPhone(p.phone)}
                    </a>
                    <a
                      className="contact-wa"
                      href={whatsAppHref(p.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`WhatsApp ${p.name}`}
                    >
                      <WhatsAppIcon />
                      WhatsApp
                    </a>
                  </>
                ) : (
                  <span className="contact-phone muted">No number on file</span>
                )}
              </div>
            </div>
          ))}
        </section>
      ))}
    </>
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

function PhoneIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M5.2 2.5 6.6 5.3 5.2 6.7c.6 1.4 1.7 2.5 3.1 3.1l1.4-1.4 2.8 1.4v2.3c0 .5-.4.9-.9.9A9.8 9.8 0 0 1 2 3.4c0-.5.4-.9.9-.9h2.3Z"
        stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"
      />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 1.5a6.4 6.4 0 0 0-5.5 9.7L1.6 14.5l3.4-.9A6.4 6.4 0 1 0 8 1.5Zm0 1.2a5.2 5.2 0 1 1-2.7 9.7l-.2-.1-2 .5.5-2-.1-.2A5.2 5.2 0 0 1 8 2.7Zm-2.2 2.6c-.1 0-.3 0-.5.2-.2.2-.6.6-.6 1.4s.6 1.6.7 1.8c.1.1 1.2 1.9 3 2.6 1.5.6 1.8.5 2.1.4.3 0 1-.4 1.1-.8.2-.4.2-.8.1-.9l-.5-.2-1-.5c-.2 0-.3-.1-.4.1l-.5.6c-.1.2-.2.2-.4.1a4.3 4.3 0 0 1-2.1-1.9c-.2-.3 0-.4.1-.5l.3-.4.2-.3v-.4l-.5-1.2c-.1-.3-.3-.3-.4-.3h-.3Z" />
    </svg>
  );
}
