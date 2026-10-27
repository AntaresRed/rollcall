import { track } from "../lib/track";

/**
 * Utils — the reference material that isn't this week's schedule.
 *
 * Five entries in one flat list had become a list you read rather than a menu
 * you scan: three of them were contact directories that belong together, and
 * the two that were not sat between them. So the contacts are one door now,
 * and the top level is a few doors — food, maps, people, mail — each
 * with a mark you can recognise before reading the label. The mails got the
 * same treatment once there were two: one door, Mail Services, with the
 * leave mail and the guest entry mail behind it.
 *
 * Both levels are the same component and the same card, because they are the
 * same act: pick one of a few things. A second level that looked different
 * would suggest it worked differently.
 *
 * The two entries that genuinely are about the week — Reschedule and Term
 * calendar — stayed behind on the timetable.
 */

/** The institute's own directory. Declared above the lists, which read it. */
const STUDENT_DIRECTORY = "https://student.iimcal.ac.in/jd/#/";

/** The top level, most-used first: food and finding a room are daily, the
    mails are an occasional job. */
const GROUPS = [
  ["mess", "Day-Night Mess & Tuck",
    "The week's mess food, plus night canteen and tuck shop menus you can "
    + "order from over WhatsApp.",
    MessIcon],
  ["maps", "J-Maps",
    "Door-to-Door navigation for every classroom, faculty rooms and admin "
    + "office in the campus.",
    MapIcon],
  ["contacts", "Faculty and POR Contact Details",
    "Professors, the council, clubs and captains, and the batch directory.",
    ContactsIcon],
  ["campus", "Campus & Hostel Services",
    "Doctor, ambulance and pharmacies, shops and food outlets, gym and court "
    + "hours, and each hostel's electrician, laundry and reps.",
    CampusIcon],
  ["mail", "Mail Services",
    // Not "sent": the app only drafts them, and the student presses Send in
    // Gmail.
    "Leave and guest entry mails, auto-drafted with the official forms "
    + "attached, ready to send from Gmail.",
    MailIcon],
];

/** Behind the first door. */
const CONTACTS = [
  ["faculty", "Faculty details",
    "Every professor in the institute directory — office, phone, email.",
    FacultyIcon],
  ["por", "POR details",
    "Council, clubs, committees and captains, and who to reach in each.",
    PorIcon],
  // The institute publishes and maintains the batch directory itself, so this
  // hands over rather than shipping a copy that goes stale and puts four
  // hundred phone numbers in the app bundle.
  ["students", "Student contacts",
    "The institute's own student directory.",
    StudentsIcon, STUDENT_DIRECTORY],
];

/** Behind the mail door. */
const MAIL = [
  ["leave", "Leave Mail",
    "Leave of more than a day: the mail auto-drafted, leave form attached.",
    MailIcon],
  ["guest", "Guest Entry",
    "A visitor to your hostel: the entry form signed and the guest's ID "
    + "attached, drafted in Gmail.",
    GuestIcon],
  ["hall", "MDC & Tata Hall Booking",
    "A guest house stay for a relative: the booking request drafted in "
    + "Gmail, photo ID attached.",
    HallIcon],
];

const LISTS = { contacts: CONTACTS, mail: MAIL };
const EYEBROW = { contacts: "Faculty & POR contacts", mail: "Mail services" };

export default function Utils({ onOpen, group = null }) {
  const items = LISTS[group] ?? GROUPS;

  return (
    <>
      <div className="eyebrow">{EYEBROW[group] ?? "Utils"}</div>
      <div className="util-menu">
        {items.map(([id, label, desc, Icon, href]) => {
          const inside = (
            <>
              <span className="util-icon" aria-hidden="true"><Icon /></span>
              <span className="util-text">
                <span className="util-label">{label}</span>
                <span className="util-desc">{desc}</span>
              </span>
              {href ? <ExternalIcon /> : <ChevronIcon />}
            </>
          );
          // An anchor, not a button that navigates: it leaves the app, so it
          // should behave like a link — long-press, open in a new tab, copy
          // the address — and say so with its own icon rather than a chevron
          // that promises another screen.
          return href ? (
            <a
              className="util-item"
              key={id}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              // Leaves the app, so App never hears of it — counted here.
              onClick={() => track("open", id)}
            >
              {inside}
            </a>
          ) : (
            <button className="util-item" key={id} onClick={() => onOpen(id)}>
              {inside}
            </button>
          );
        })}
      </div>
    </>
  );
}

/* The marks. Line drawings at one weight, so the three read as a set rather
   than as three borrowed glyphs. */

function ContactsIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3.5h11A1.5 1.5 0 0 1 18.5 5v14a1.5 1.5 0 0 1-1.5 1.5H6Z"
            stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M6 3.5v17M3.5 7.5H6M3.5 12H6M3.5 16.5H6"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12.5" cy="10" r="2.1" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.4 15.6a3.2 3.2 0 0 1 6.2 0" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function MessIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.2 12.5h13.6a6.8 6.8 0 0 1-13.6 0Z" stroke="currentColor"
            strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M2.5 20.5h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M20.5 3.5v8.5m0 0v8.5m0-8.5c1.2-1 1.2-2.4 1.2-4V3.5"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** A guest house: a roof over a bed. */
function HallIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 10.5 12 4l9 6.5" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 9.2V20h14V9.2" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M8 17v-3.2h8V17M8 15.6h8" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9.6" cy="12.1" r="0.9" fill="currentColor" />
    </svg>
  );
}

/** A visitor arriving: a figure beside an open door. */
function GuestIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M13.5 20.5V4.2a.7.7 0 0 1 .9-.7l5.6 1.6v15.4"
            stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M11.5 20.5h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="6.5" cy="7.5" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M2.8 20.5v-3.6a3.7 3.7 0 0 1 7.4 0v3.6" stroke="currentColor"
            strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="16.4" cy="12.5" r="0.9" fill="currentColor" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5.5" width="18" height="13" rx="2"
            stroke="currentColor" strokeWidth="1.7" />
      <path d="m3.8 7 8.2 6 8.2-6" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* A folded paper map — the mark people already read as "directions". */}
      <path d="M3.5 6.5 9 4.5l6 2 5.5-2v13l-5.5 2-6-2-5.5 2v-13Z" stroke="currentColor"
            strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 4.5v13M15 6.5v13" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

/** A building with a cross on it: help, and the place you find it. */
function CampusIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20.5V8.5L12 4l8 4.5v12" stroke="currentColor" strokeWidth="1.7"
            strokeLinejoin="round" />
      <path d="M2.5 20.5h19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 9.5v6M9 12.5h6" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" />
    </svg>
  );
}

function FacultyIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5 21.5 8 12 12.5 2.5 8 12 3.5Z" stroke="currentColor"
            strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M6.5 10v5.2c0 1.6 2.5 2.8 5.5 2.8s5.5-1.2 5.5-2.8V10"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M21.5 8v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PorIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8.5" r="4.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.6 12.4 7 21l5-2.6L17 21l-1.6-8.6" stroke="currentColor"
            strokeWidth="1.7" strokeLinejoin="round" />
    </svg>
  );
}

function StudentsIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8" r="3.3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 19a6 6 0 0 1 12 0" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" />
      <path d="M16 5.4a3.3 3.3 0 0 1 0 5.2M17.5 14.2A6 6 0 0 1 21 19"
            stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/** Leaves the app — drawn as the usual box-and-arrow rather than a chevron. */
function ExternalIcon() {
  return (
    <svg className="util-go" width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M7 3.5H4.5A1.5 1.5 0 0 0 3 5v8.5A1.5 1.5 0 0 0 4.5 15H13a1.5 1.5 0 0 0 1.5-1.5V11"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M10.5 3h4.5v4.5M15 3l-6 6" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg className="util-go" width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M7 3.5 12.5 9 7 14.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
