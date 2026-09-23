import { useId } from "react";
import { messageOf, edited, isBehind, UNTOUCHED } from "../lib/finalmessage";

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
 * text does not show, it says so, and offers to start again from the basket.
 */
export default function FinalMessage({ cart, written, onChange }) {
  const id = useId();
  const text = messageOf(cart, written);
  const behind = isBehind(cart, written);
  const touched = cart?.final != null;
  // Tall enough to read the whole order without scrolling inside the box,
  // short enough that a long one does not push the send button off screen.
  const rows = Math.min(12, Math.max(4, text.split("\n").length + 1));

  return (
    // A div rather than the label the other fields use: the box carries its
    // own buttons, and a button inside a label is a tap that means two things.
    <div className="cart-notes cart-final">
      <label htmlFor={id}>Final message</label>
      <textarea
        id={id}
        rows={rows}
        value={text}
        spellCheck={false}
        onChange={(e) => onChange(edited(cart, written, e.target.value))}
      />
      {behind ? (
        <div className="cart-final-behind" role="status">
          <p>
            Your basket has changed since you edited this. New dishes have
            been added, but quantities, totals and details you changed above
            are not — check it before sending.
          </p>
          <button type="button" className="btn ghost" onClick={() => onChange(UNTOUCHED)}>
            Rebuild from basket
          </button>
        </div>
      ) : (
        <em>
          {touched ? (
            <>
              Edited. This is exactly what will be sent and kept in your
              history.{" "}
              <button type="button" className="cart-final-reset" onClick={() => onChange(UNTOUCHED)}>
                Rebuild from basket
              </button>
            </>
          ) : (
            "Written from your basket. Edit anything — this is exactly what will be sent and kept in your history."
          )}
        </em>
      )}
    </div>
  );
}
