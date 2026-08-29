/**
 * Formatting and links for an Indian mobile number.
 *
 * Its own module so both contact screens can use it without either one
 * dragging the other's data along: importing these from students.js would
 * have pulled four hundred students' numbers into the POR chunk, which is
 * lazily loaded precisely so that doesn't happen.
 *
 * Numbers are stored as ten bare digits everywhere. The country code belongs
 * to the link, not to the data.
 */

/** "98765 43210" — how an Indian mobile number is normally written, which
 *  makes it checkable at a glance against a phone's own contact list. */
export const prettyPhone = (phone) => {
  const d = String(phone ?? "").replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 5)} ${d.slice(5)}` : d || "";
};

export const telHref = (phone) => (phone ? `tel:+91${phone}` : null);
export const whatsAppHref = (phone) => (phone ? `https://wa.me/91${phone}` : null);
