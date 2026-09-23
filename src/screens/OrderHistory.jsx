import { useMemo, useState } from "react";
import {
  readOrders, clearOrders, removeOrder, byDay, clockOf, textOf,
  toCsv, historyFilename, KEEP_DAYS, KIND_LABEL,
} from "../lib/orders";
import { deliverFile } from "../lib/deliver";

/**
 * The messages you have sent to a night canteen or a tuck shop.
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
   * Whole orders, never an edit: the record is of a message handed over, and
   * changing it afterwards would turn a history of what was sent into a
   * history of what somebody would rather have sent.
   */
  const forget = (order) => {
    const where = order.where || KIND_LABEL[order.kind ?? "night"];
    if (!confirm(`Remove this order to ${where} (${clockOf(order.at)}) from your history?`)) return;
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
        <b>This is what you sent, not what you ate.</b> Each order is the final
        message as it left the app. Anything you changed after that — editing
        it in WhatsApp, adding something over the phone, or cancelling — can't
        be seen from here.
      </p>

      {!history.length && (
        <div className="history-none">
          <p>Nothing sent from this device yet.</p>
          <p className="history-none-sub">
            Orders you send from a night canteen or tuck shop basket will be
            listed here.
          </p>
        </div>
      )}

      {days.map((day) => (
        <div className="history-day" key={day.label + day.orders[0].at}>
          <div className="history-day-head">{day.label}</div>

          {day.orders.map((order) => {
            const kind = KIND_LABEL[order.kind ?? "night"];
            return (
            <div className="history-card" key={order.at}>
              <div className="history-card-head">
                <span className="history-where">
                  {order.where || kind}
                  <span className="history-kind">{kind}</span>
                </span>
                <span className="history-when">{clockOf(order.at)}</span>
                {/* Per order rather than one "edit mode": there is only ever
                    one thing to do to an entry, and a mode to get into and
                    out of for a single action is more screen than it saves. */}
                <button
                  className="history-x"
                  aria-label={`Remove this order to ${order.where || kind}`}
                  title="Remove from history"
                  onClick={() => forget(order)}
                >
                  <BinIcon />
                </button>
              </div>

              {/* The message word for word, line breaks and all — it is the
                  record, so it is shown the way it was sent rather than
                  re-laid out as a list the app would be guessing at. */}
              <p className="history-msg">{textOf(order)}</p>

              {/* The basket's figure, not the message's: once the message can
                  be edited the two can differ, so it says which it is. */}
              {order.total > 0 && (
                <div className="history-foot">
                  <span>Basket total</span>
                  <span className="history-total">₹{order.total}</span>
                </div>
              )}
            </div>
            );
          })}
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
      {/* Two things said plainly: this list lives on the device, and a copy
          of each message is kept with the account. The second is the one a
          student would otherwise have no way of knowing. */}
      <p className="history-note">
        This list is kept on this device — a phone and a laptop keep separate
        histories, and clearing your browser data clears it. The last
        {" "}{KEEP_DAYS} days are kept, so save anything you want to keep
        longer. A copy of each order message is also saved with your
        IIMPresent account, and removing it here doesn&apos;t remove that copy.
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
