/**
 * Who the student is, as the mail forms ask it — kept once on the phone and
 * shared by the leave mail and the guest entry form.
 *
 * Both forms ask the same five things about the student. Typing them twice
 * was the friction; worse, correcting a room number in one form and finding
 * the old one still in the other is how a wrong one gets sent. So the forms
 * read and write one record, and whichever was filled in last is what both
 * start from.
 *
 * The leave mail kept these in its own record before the guest form existed
 * ("iimpresent.leave.who", which still holds its address and reason). That
 * is read as the fallback, so nobody who has used the leave mail starts the
 * guest form blank.
 */

export const STUDENT_KEYS = ["name", "reg", "phone", "hostel", "hostelOther", "room"];

const STORE = "iimpresent.student";
const LEGACY = "iimpresent.leave.who";

/** The student keys from a record, strings only, blanks left out — so a
 *  stored shape from an older version can't turn an input uncontrolled, and
 *  an empty field can't hide a filled one beneath it. */
export function studentPart(from) {
  const out = {};
  for (const k of STUDENT_KEYS) {
    if (typeof from?.[k] === "string" && from[k] !== "") out[k] = from[k];
  }
  return out;
}

/** The shared record if there is one, else the leave mail's older one —
 *  never a mix, or a field cleared in one form would come back from the
 *  other's stale copy. */
export const mergeStudent = (shared, legacy) =>
  (shared && typeof shared === "object" ? studentPart(shared) : studentPart(legacy));

/* The accessor resolved inside the try: the global itself can throw, or not
   exist at all in the smoke test. */
const local = () => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};
const read = (key) => {
  try {
    return JSON.parse(local()?.getItem(key) || "null");
  } catch {
    return null;
  }
};

export function readStudent() {
  return mergeStudent(read(STORE), read(LEGACY));
}

/**
 * Save the student keys of a form. Every key is written, blanks included:
 * clearing a field is a change too, and the other form should see it.
 */
export function writeStudent(form) {
  const out = {};
  for (const k of STUDENT_KEYS) out[k] = typeof form?.[k] === "string" ? form[k] : "";
  try {
    local()?.setItem(STORE, JSON.stringify(out));
  } catch {
    /* a private window: the form still works, it just won't be prefilled */
  }
}
