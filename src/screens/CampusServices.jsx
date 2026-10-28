import { useState } from "react";
import { MEDICAL, PLACES, HOSTELS, dayName, hostelTab } from "../lib/campus";
import { readStudent } from "../lib/student";
import { prettyPhone, telHref, whatsAppHref } from "../lib/phone";

/**
 * Campus & Hostel Services — who to ring for a doctor, a parcel of food at
 * 2 AM, a broken fan or the laundry, and when the gym is open.
 *
 * Tabs rather than one long page: someone looking for the ambulance should
 * not scroll past the laundry to find it, so Medical is first and is where
 * the screen opens. The hostel tab opens on the student's own hostel when the
 * mail forms know it, but keeps the other three a tap away — the electrician
 * you need is sometimes in a friend's hostel.
 */
// The POR list the hostel reps are in.
const REP_LIST = "student-council";

const TABS = [
  { id: "medical", label: "Medical" },
  ...PLACES.map((p) => ({ id: p.id, label: p.tab ?? p.label })),
  { id: "hostel", label: "Hostel" },
];

export default function CampusServices({ now = new Date(), onOpen, start = "medical", startHostel }) {
  const [tab, setTab] = useState(start);
  const [hostel, setHostel] = useState(() => hostelTab(startHostel ?? readStudent().hostel));
  // Back from the rep in POR details lands on this same hostel tab.
  const openRep = onOpen && ((hid) => onOpen("por", {
    from: "campus",
    path: [REP_LIST],
    query: `${hid} Hostel Representative`,
    back: { tab: "hostel", hostel },
  }));
  const place = PLACES.find((p) => p.id === tab);
  const h = HOSTELS.find((x) => x.id === hostel);

  return (
    <>
      <div className="eyebrow">Campus &amp; hostel services</div>

      <div className="mess-tabs campus-tabs" role="tablist" aria-label="Kind of service">
        {TABS.map((t) => (
          <button
            key={t.id}
            className="mess-tab"
            role="tab"
            aria-selected={t.id === tab}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "medical" && (
        // Call only, no WhatsApp: for an ambulance or a doctor a message
        // that may be read in an hour is the wrong button to offer.
        <section className="por-section">
          {/* The doctor's own numbers are not shown (the user's call,
              2026-10-28), so that row is the week alone, first. */}
          {MEDICAL.map((it) => (it.week && it.phones.length === 0
            ? (
              <div key={it.name} className="por-row campus-row">
                <DoctorWeek week={it.week} today={dayName(now)} />
              </div>
            )
            : (
              <Row key={it.name} it={it} callOnly>
                {it.week && <DoctorWeek week={it.week} today={dayName(now)} />}
              </Row>
            )))}
        </section>
      )}

      {place && (
        <section className="por-section">
          {/* The tab's name is cut short to fit; the heading gives it whole. */}
          {place.tab && place.tab !== place.label && (
            <h3 className="por-section-head">{place.label}</h3>
          )}
          {place.items.map((it) => (
            <Row key={it.name} it={it} onOpen={onOpen} />
          ))}
        </section>
      )}

      {tab === "hostel" && (
        <>
          <div className="mess-tabs campus-hostels" role="tablist" aria-label="Hostel">
            {HOSTELS.map((x) => (
              <button
                key={x.id}
                className="mess-tab"
                role="tab"
                aria-selected={x.id === hostel}
                onClick={() => setHostel(x.id)}
              >
                {x.id}
              </button>
            ))}
          </div>
          {h && (
            <section className="por-section">
              <h3 className="por-section-head">{h.name}</h3>
              {h.items.map((it, i) => (
                <Row key={`${it.name}|${it.person}|${i}`} it={it} onOpen={onOpen} onRep={openRep} />
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}

/** One contact: what it is, who, when, and the numbers to tap. */
function Row({ it, callOnly = false, onOpen, onRep, children }) {
  const facts = [it.hours, it.delivery].filter(Boolean);
  return (
    <div className="por-row campus-row">
      <div className="por-who">
        <span className="por-name">{it.name}</span>
        {it.person && <span className="por-role">{it.person}</span>}
        {facts.length > 0 && (
          <span className="campus-facts">
            {facts.map((f) => <span key={f}>{f}</span>)}
          </span>
        )}
        {it.note && <span className="campus-note">{it.note}</span>}
        {it.email && <a className="por-email" href={`mailto:${it.email}`}>{it.email}</a>}
        {/* The order itself goes through the menu screen, which writes it out
            item by item — a bare number here would only invite a phoned
            order nobody can check. */}
        {it.menu && onOpen && (
          <button className="campus-menu" onClick={() => onOpen("mess")}>
            {it.menu === "tuck" ? "Order from the menu" : "Order from the night menu"} →
          </button>
        )}
        {/* "Contact the OH Rep" is only useful with a way to reach them. A
            link to the rep in POR details rather than a copy of their number,
            which would go stale the day the rep changes. */}
        {it.rep && onRep && (
          <button className="campus-menu" onClick={() => onRep(it.rep)}>
            {it.rep} Rep in POR details →
          </button>
        )}
      </div>

      {it.phones.length > 0 && (
        <div className="campus-phones">
          {it.phones.map((p) => (
            <Numbers key={p.number} phone={p.number} label={p.label}
                     name={it.person || it.name} callOnly={callOnly} />
          ))}
        </div>
      )}
      {children}
    </div>
  );
}

function Numbers({ phone, label, name, callOnly = false }) {
  return (
    <div className="por-contact">
      {label && <span className="campus-label">{label}</span>}
      <a className="contact-phone" href={telHref(phone)}>
        <PhoneIcon />
        {prettyPhone(phone)}
      </a>
      {!callOnly && (
        <a
          className="contact-wa"
          href={whatsAppHref(phone)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`WhatsApp ${name}`}
        >
          <WhatsAppIcon />
          WhatsApp
        </a>
      )}
    </div>
  );
}

/** The doctor's week, today marked — "is the doctor in now" is the question. */
function DoctorWeek({ week, today }) {
  return (
    <div className="mess-timings campus-week">
      <div className="mess-everyday-head">Doctor timings</div>
      <div className="campus-week-grid">
        {week.map((d) => (
          <div key={d.day} className={`campus-day${d.day === today ? " today" : ""}`}>
            <span>{d.day === today ? `Today · ${d.day}` : d.day}</span>
            <span className="mess-time">{d.hours}</span>
          </div>
        ))}
      </div>
    </div>
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
