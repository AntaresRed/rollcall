import { useMemo, useState } from "react";
import {
  searchStudents, studentsMissingPhone,
  prettyPhone, telHref, whatsAppHref,
} from "../lib/students";

// Four hundred-odd rows is more than a phone renders comfortably in one go,
// and nobody scrolls a list that long to find somebody — they search. So the
// unsearched list is capped, with the rest one tap away.
const FIRST_PAGE = 60;

/**
 * The cohort contact list — name, registration number, phone.
 *
 * A sibling of the faculty directory rather than a copy of it: same shape of
 * problem, different source and different fields, so the two share a look but
 * not their data or their build script.
 */
export default function StudentContacts({ onBack }) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => searchStudents(query), [query]);

  // A search should always show everything it found; only the idle list is
  // capped, and typing resets that decision.
  const searching = query.trim().length > 0;
  const visible = searching || showAll ? rows : rows.slice(0, FIRST_PAGE);
  const hidden = rows.length - visible.length;

  return (
    <>
      <div className="eyebrow">Student contacts</div>
      <div className="dir-search">
        <SearchIcon />
        <input
          type="search"
          value={query}
          placeholder="Search name, registration number, phone"
          aria-label="Search student contacts"
          autoComplete="off"
          onChange={(e) => { setQuery(e.target.value); setShowAll(false); }}
        />
        {query && (
          <button className="dir-clear" aria-label="Clear search" onClick={() => setQuery("")}>
            ×
          </button>
        )}
      </div>

      <div className="dir-bar">
        <span className="dir-count">
          {rows.length} {rows.length === 1 ? "student" : "students"}
        </span>
        {!searching && studentsMissingPhone > 0 && (
          <span className="dir-count">
            {studentsMissingPhone} without a number
          </span>
        )}
      </div>

      {rows.length === 0 && (
        <div className="empty">Nobody in the batch matches that.</div>
      )}

      {visible.map((p) => (
        <div className="stu-card" key={`${p.reg ?? "no-reg"}|${p.name}`}>
          <div className="stu-head">
            <span className="stu-name">{p.name}</span>
            {p.reg && <span className="stu-reg">{p.reg}</span>}
          </div>

          {p.phone ? (
            <div className="stu-actions">
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
            </div>
          ) : (
            // Said plainly rather than left blank: the entry is correct, the
            // number simply never made it through the spreadsheet export.
            <div className="stu-actions">
              <span className="contact-phone muted">No number on file</span>
            </div>
          )}
        </div>
      ))}

      {hidden > 0 && (
        <button className="btn ghost block" style={{ marginTop: 14 }} onClick={() => setShowAll(true)}>
          Show the other {hidden}
        </button>
      )}

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to utils
        </button>
      )}
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
