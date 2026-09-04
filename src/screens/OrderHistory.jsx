import { useMemo, useState } from "react";
import { readOrders, clearOrders, byDay, clockOf, itemCount } from "../lib/nightorders";

/**
 * The baskets you have sent to a night canteen.
 *
 * Read once and held, rather than re-read on every render: this is a device's
 * own file and nothing else on screen writes to it while it is open.
 *
 * The warning at the top is not decoration. The app hands an order to WhatsApp
 * and stops being able to see it, so everything below is what was sent, not
 * what arrived — and the one thing a history like this must not do is let
 * somebody settle an argument with the counter using it.
 */
export default function OrderHistory({ onBack, now = new Date() }) {
  const [history, setHistory] = useState(readOrders);
  const days = useMemo(() => byDay(history, now), [history, now]);

  const empty = () => {
    if (!confirm("Delete your order history on this device?")) return;
    clearOrders();
    setHistory([]);
  };

  return (
    <>
      <div className="eyebrow">Order history</div>

      <p className="history-warn">
        <b>This is what you sent, not what you ate.</b> Anything you changed
        after leaving the app — editing the message in WhatsApp, adding
        something over the phone, or cancelling — can't be seen from here.
      </p>

      {!history.length && (
        <div className="history-none">
          <p>Nothing sent from this device yet.</p>
          <p className="history-none-sub">
            Orders you send from the night canteen basket will be listed here.
          </p>
        </div>
      )}

      {days.map((day) => (
        <div className="history-day" key={day.label + day.orders[0].at}>
          <div className="history-day-head">{day.label}</div>

          {day.orders.map((order) => (
            <div className="history-card" key={order.at}>
              <div className="history-card-head">
                <span className="history-where">{order.where || "Night canteen"}</span>
                <span className="history-when">{clockOf(order.at)}</span>
              </div>

              <ul className="history-items">
                {order.items.map((i) => (
                  <li key={i.name}>
                    <span className="history-qty">{i.qty}</span>
                    {i.name}
                  </li>
                ))}
              </ul>

              <div className="history-foot">
                {itemCount(order)} item{itemCount(order) === 1 ? "" : "s"}
              </div>
            </div>
          ))}
        </div>
      ))}

      {history.length > 0 && (
        <button className="btn ghost block history-clear" onClick={empty}>
          Clear this history
        </button>
      )}

      {/* Said once, at the bottom, where somebody wondering why their laptop
          shows nothing will be looking. */}
      <p className="history-note">
        Kept on this device only — a phone and a laptop keep separate
        histories, and clearing your browser data clears this too. The last
        twenty orders are kept.
      </p>

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 14 }} onClick={onBack}>
          Back to the menu
        </button>
      )}
    </>
  );
}
