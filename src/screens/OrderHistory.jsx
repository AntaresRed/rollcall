import { useMemo, useState } from "react";
import {
  readOrders, clearOrders, removeOrder, byDay, clockOf, itemCount,
  toCsv, historyFilename, KEEP_DAYS,
} from "../lib/nightorders";
import { deliverFile } from "../lib/deliver";

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

  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState("");

  const exportCsv = async () => {
    try {
      await navigator.clipboard.writeText(toCsv(history));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* no clipboard permission — nothing is lost, the list is still on screen */
    }
  };

  /**
   * The same rows, as a file.
   *
   * A spreadsheet is what people actually want this for — totalling a month,
   * splitting a bill — and a `.csv` opens straight into Excel, Sheets and
   * Numbers with its columns intact. A real `.xlsx` would need a library
   * several times the size of this whole app to say the same thing.
   */
  const downloadCsv = async () => {
    try {
      const how = await deliverFile(historyFilename(now), toCsv(history), "text/csv");
      if (how === "cancelled") return;
      setSaved(how === "shared" ? "Sent" : "Saved to your downloads");
      setTimeout(() => setSaved(""), 3000);
    } catch {
      setSaved("Couldn't save the file — try Copy instead");
      setTimeout(() => setSaved(""), 4000);
    }
  };

  /**
   * Forget one order.
   *
   * Whole orders, not the dishes inside one: the record is of a basket handed
   * over, and editing its contents afterwards would turn a history of what
   * was sent into a history of what somebody would rather have sent.
   */
  const forget = (order) => {
    const what = `${itemCount(order)} item${itemCount(order) === 1 ? "" : "s"}`
      + ` from ${order.where || "the night canteen"}`;
    if (!confirm(`Remove this order — ${what} — from your history?`)) return;
    setHistory(removeOrder(order.at));
  };

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
                {/* Per order rather than one "edit mode": there is only ever
                    one thing to do to an entry, and a mode to get into and
                    out of for a single action is more screen than it saves. */}
                <button
                  className="history-x"
                  aria-label={`Remove this order from ${order.where || "the night canteen"}`}
                  title="Remove from history"
                  onClick={() => forget(order)}
                >
                  <BinIcon />
                </button>
              </div>

              <ul className="history-items">
                {order.items.map((i) => (
                  <li key={i.name}>
                    <span className="history-qty">{i.qty}</span>
                    <span className="history-name">{i.name}</span>
                    {i.price > 0 && <span className="history-cost">₹{i.price}</span>}
                  </li>
                ))}
              </ul>

              <div className="history-foot">
                <span>
                  {itemCount(order)} item{itemCount(order) === 1 ? "" : "s"}
                  {(order.room || order.reg) && " · "}
                  {order.room && `Room ${order.room}`}
                  {order.room && order.reg && " · "}
                  {order.reg && order.reg}
                </span>
                {order.total > 0 && <span className="history-total">₹{order.total}</span>}
              </div>
            </div>
          ))}
        </div>
      ))}

      {history.length > 0 && (
        <>
          {/* Two ways out, because they are wanted at different moments. The
              file is for keeping — it opens in Excel or Sheets with its
              columns intact. The clipboard is for sending someone a couple of
              lines in a message, where a downloaded file is a nuisance. */}
          <button className="btn block history-export" onClick={downloadCsv}>
            {saved || "Download as a spreadsheet (.csv)"}
          </button>
          <button className="btn ghost block history-copy" onClick={exportCsv}>
            {copied ? "Copied — paste it anywhere" : "Or copy it to the clipboard"}
          </button>
          <button className="btn ghost block history-clear" onClick={empty}>
            Clear this history
          </button>
        </>
      )}

      {/* Said once, at the bottom, where somebody wondering why their laptop
          shows nothing will be looking. */}
      <p className="history-note">
        Kept on this device only — a phone and a laptop keep separate
        histories, and clearing your browser data clears this too. The last
        {" "}{KEEP_DAYS} days are kept, so save anything you want to keep
        longer.
      </p>

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 14 }} onClick={onBack}>
          Back to the menu
        </button>
      )}
    </>
  );
}

function BinIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-8"
            stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.8 7v4M9.2 7v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
