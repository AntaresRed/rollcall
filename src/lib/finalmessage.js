/**
 * The final message — the exact text that leaves for WhatsApp.
 *
 * The basket writes the order out for the student, and the student can then
 * change any of it before sending. Whatever is in the box is what goes, and it
 * is also what the history records: the only honest record of an order is the
 * words that were handed over, not the basket they were written from.
 *
 * Two states, held on the cart as `final` and `finalBase`:
 *
 *   final === null   untouched. The message is whatever the basket writes
 *                    out now, so every dish added appears in it as it is
 *                    added.
 *
 *   final is text    the student has edited it. Their text is kept, and
 *                    `finalBase` remembers what the basket wrote out at the
 *                    moment of the edit, so a later change to the basket can
 *                    be noticed rather than silently missed.
 *
 * After an edit, a newly added dish is appended to the edited text: adding
 * something is unambiguous, and losing somebody's typing to it would be
 * worse than the small chance of a line landing slightly out of place. A
 * change that cannot be applied safely to somebody else's words — a quantity,
 * a removal, a total, a room number — is not attempted. The screen says the
 * message is behind the basket and offers to rebuild it.
 */

/** A dish line as the order writers produce it: "2 x Veg Roll…". */
const ITEM = /^\s*\d+\s*x\s/i;

export const UNTOUCHED = { final: null, finalBase: "" };

/**
 * Put one dish line into a message.
 *
 * After the last line that still looks like a dish, so it joins the order
 * rather than landing under the room number. If nothing looks like a dish any
 * more it goes first, which is where the dishes were.
 */
export function insertLine(text, line) {
  const body = String(text ?? "");
  if (!body.trim()) return line;
  const rows = body.split("\n");
  let last = -1;
  rows.forEach((r, i) => { if (ITEM.test(r)) last = i; });
  if (last < 0) return `${line}\n${body}`;
  rows.splice(last + 1, 0, line);
  return rows.join("\n");
}

/** What would be sent right now. */
export const messageOf = (state, generated) =>
  (state?.final == null ? generated : state.final);

/**
 * The student typed in the box: from here on the text is theirs.
 *
 * The base is taken at the first keystroke and kept after that. Typing is not
 * the same as catching up with the basket, and a warning that vanished the
 * moment somebody touched the text would vanish exactly when it is needed.
 */
export const edited = (state, generated, text) => ({
  final: text,
  finalBase: state?.final == null ? generated : state.finalBase,
});

/**
 * A dish was added to the basket.
 *
 * `before` and `after` are what the basket wrote out either side of the
 * addition. The base moves forward only when the same insertion carries it
 * exactly to `after` — that is, when the new line is the whole of what changed.
 * On the tuck shops a total changes with it, so the base stays put and the
 * screen says the message is behind: a total in the message that disagrees
 * with the one being paid is the thing to catch.
 */
export function withAdded(state, line, after) {
  if (state?.final == null) return state ?? UNTOUCHED;
  const final = insertLine(state.final, line);
  const moved = insertLine(state.finalBase, line) === after;
  return { final, finalBase: moved ? after : state.finalBase };
}

/** The basket has moved on since the edit in some way the text does not show. */
export const isBehind = (state, generated) =>
  state?.final != null && state.finalBase !== generated;
