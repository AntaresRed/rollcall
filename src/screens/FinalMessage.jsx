import { messageOf, edited, isBehind } from "../lib/finalmessage";

/**
 * The message box at the foot of a basket — the exact words that go to
 * WhatsApp, and into the history.
 *
 * Shared by the night canteens and the tuck shops so the two cannot drift:
 * what is sent and what is recorded has to mean the same thing in both.
 *
 * It fills itself as dishes go into the basket. Once somebody types in it, the
 * text is theirs: new dishes are still appended, but nothing else the basket
 * does is written over their words. When the basket has moved on in a way the
 * text does not show, it says so — the fix is theirs to type.
 */
export default function FinalMessage({ cart, written, onChange }) {
  const text = messageOf(cart, written);
  const behind = isBehind(cart, written);
  // Tall enough to read the whole order without scrolling inside the box,
  // short enough that a long one does not push the send button off screen.
  const rows = Math.min(12, Math.max(4, text.split("\n").length + 1));

  return (
    <label className="cart-notes cart-final">
      <span>Final message (can be edited)</span>
      <textarea
        rows={rows}
        value={text}
        spellCheck={false}
        onChange={(e) => onChange(edited(cart, written, e.target.value))}
      />
      {behind && (
        <p className="cart-final-behind" role="status">
          Your basket has changed since you edited this. New dishes have been
          added, but quantities, totals and details you changed above are not
          — check it before sending.
        </p>
      )}
      <em>The final message sent by you will be recorded in history.</em>
    </label>
  );
}
