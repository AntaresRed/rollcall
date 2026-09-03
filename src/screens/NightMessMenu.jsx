import { useEffect, useMemo, useState } from "react";
import {
  CANTEENS, canteenById, filterMenu, countItems, billFor, orderText,
  DIET_FILTERS, DIET_LABEL,
} from "../lib/nightmenu";
import { telHref, whatsAppHref, prettyPhone } from "../lib/phone";

/**
 * The night canteens — a priced list per hostel, with a basket.
 *
 * Read at 1am to decide what to order, which shapes everything here. There is
 * a search box because two hundred and fifty items is too many to scroll, a
 * diet filter because "is there anything vegetarian" is the question a third
 * of the batch opens this asking, and a basket because the next thing anybody
 * does after finding four items is add up what they cost.
 *
 * The basket does NOT place an order. It writes the order out and hands it to
 * WhatsApp, where the student reads it and presses send themselves. Anything
 * else would be claiming a delivery this app cannot promise — nothing here can
 * tell whether the counter ever saw the message.
 */

const STORE = "iimpresent.night.cart";

/** Stable empty basket, so the memo above does not churn. */
const EMPTY = [];

/** One cart, belonging to one canteen. Kept across a reload, because losing a
 *  ten-item basket to a stray back-swipe at 1am is a bad night. */
function loadCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "null");
    if (raw && Array.isArray(raw.lines)) return raw;
  } catch {
    /* a private window, or site data cleared */
  }
  return { canteen: null, lines: [], where: "" };
}

export default function NightMessMenu() {
  const [id, setId] = useState(CANTEENS[0]?.id ?? null);
  const [diet, setDiet] = useState("all");
  const [query, setQuery] = useState("");
  const [showScan, setShowScan] = useState(false);
  const [cart, setCart] = useState(loadCart);
  const [showCart, setShowCart] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify(cart)); } catch { /* ignore */ }
  }, [cart]);

  const canteen = useMemo(() => canteenById(id), [id]);
  const shown = useMemo(() => filterMenu(canteen, { diet, query }), [canteen, diet, query]);
  const total = useMemo(() => countItems(canteen?.categories ?? []), [canteen]);
  const showing = countItems(shown);

  // The basket only ever belongs to the canteen on screen. Memoised because
  // the empty case would otherwise hand back a fresh array every render and
  // re-run the bill below it each time.
  const lines = useMemo(
    () => (cart.canteen === canteen?.id ? cart.lines : EMPTY),
    [cart, canteen],
  );
  const bill = useMemo(() => billFor(canteen, lines), [canteen, lines]);
  const qtyOf = (name) => lines.find((l) => l.name === name)?.qty ?? 0;

  const change = (item, by) => {
    setCart((prev) => {
      const mine = prev.canteen === canteen.id ? prev.lines : [];
      const at = mine.findIndex((l) => l.name === item.name);
      const next = [...mine];
      if (at < 0) {
        if (by > 0) next.push({ name: item.name, price: item.price, qty: by });
      } else {
        const qty = next[at].qty + by;
        if (qty <= 0) next.splice(at, 1);
        else next[at] = { ...next[at], qty };
      }
      return { canteen: canteen.id, lines: next, where: prev.where ?? "" };
    });
  };

  const switchCanteen = (next) => {
    if (next === canteen?.id) return;
    // You cannot order half from Tagore and half from Ramanujan, so this asks
    // rather than quietly merging two menus into one order.
    if (lines.length &&
        !confirm("Switching canteen empties your basket. Carry on?")) return;
    setId(next);
    setShowScan(false);
    setShowCart(false);
    if (lines.length) setCart((p) => ({ canteen: next, lines: [], where: p.where }));
  };

  if (!CANTEENS.length) {
    return <div className="empty">No night menu has been added yet.</div>;
  }

  const firstNumber = canteen?.phone?.split("/")[0].replace(/\D/g, "") ?? "";
  const message = orderText(canteen, bill.items, cart.where ?? "");

  return (
    <>
      <div className="mess-tabs" role="tablist" aria-label="Canteen">
        {CANTEENS.map((c) => (
          <button
            key={c.id}
            className="mess-tab"
            role="tab"
            aria-selected={c.id === id}
            onClick={() => switchCanteen(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {canteen && (
        <div className="canteen-head">
          <div className="canteen-name">{canteen.canteen}</div>
          <div className="canteen-meta">
            {canteen.phone && (
              <a className="canteen-call" href={telHref(firstNumber)}>{canteen.phone}</a>
            )}
            {canteen.hours && <span>{canteen.hours}</span>}
            {canteen.room_service && <span>Room service ₹{canteen.room_service}</span>}
          </div>
        </div>
      )}

      {/* The typed list is a transcription; the photograph is what the canteen
          actually charges. That makes this the most important thing on screen
          after the menu itself, so it is a filled button rather than a line of
          text somebody scrolls past. */}
      {canteen?.pages?.length > 0 && (
        <>
          <button
            className="btn scan-cta"
            aria-expanded={showScan}
            onClick={() => setShowScan((v) => !v)}
          >
            <ScanIcon />
            <span className="scan-cta-text">
              {showScan ? "Hide" : "See"} Original {canteen.name} Mess Menu
            </span>
            <span className="scan-cta-pages">
              {canteen.pages.length} page{canteen.pages.length === 1 ? "" : "s"}
            </span>
          </button>

          {showScan && (
            <div className="scan-pages">
              <p className="scan-note">
                Photographed from the menu on the wall. Tap a page to open it
                full size, where it can be zoomed.
              </p>
              {canteen.pages.map((src, i) => (
                <a key={src} href={src} target="_blank" rel="noopener noreferrer">
                  <img
                    className="scan-page"
                    src={src}
                    alt={`${canteen.canteen}, page ${i + 1} of ${canteen.pages.length}`}
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          )}
        </>
      )}

      <div className="diet-row" role="group" aria-label="Diet">
        {DIET_FILTERS.map((f) => (
          <button
            key={f.id}
            className={`diet-chip${diet === f.id ? " on" : ""}`}
            aria-pressed={diet === f.id}
            onClick={() => setDiet(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="dir-search">
        <SearchIcon />
        <input
          type="search"
          value={query}
          placeholder="Search the menu…"
          aria-label="Search the night menu"
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="dir-clear" aria-label="Clear search" onClick={() => setQuery("")}>
            ×
          </button>
        )}
      </div>

      <div className="dir-bar">
        <span className="dir-count">
          {showing === total ? `${total} items` : `${showing} of ${total}`}
        </span>
      </div>

      {!shown.length && <div className="empty">Nothing on this menu matches that.</div>}

      {shown.map((cat) => (
        <div className="night-cat" key={cat.name}>
          <div className="night-cat-head">
            {cat.name}
            <span>{cat.items.length}</span>
          </div>
          {cat.items.map((item) => {
            const qty = qtyOf(item.name);
            return (
              <div className={`night-row${qty ? " in-cart" : ""}`} key={item.name}>
                <span className={`diet-dot ${item.diet}`} title={DIET_LABEL[item.diet]} />
                <span className="night-item">{item.name}</span>
                <span className="night-price">₹{item.price}</span>
                {qty ? (
                  <span className="qty">
                    <button aria-label={`One fewer ${item.name}`} onClick={() => change(item, -1)}>−</button>
                    <b>{qty}</b>
                    <button aria-label={`One more ${item.name}`} onClick={() => change(item, 1)}>+</button>
                  </span>
                ) : (
                  <button
                    className="night-add"
                    aria-label={`Add ${item.name}`}
                    onClick={() => change(item, 1)}
                  >
                    +
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {shown.some((c) => c.items.some((i) => i.diet === "unknown")) && (
        <p className="night-note">
          A hollow dot means nobody has confirmed whether the dish is
          vegetarian. Those are shown under every filter — ask the counter
          rather than trusting this screen.
        </p>
      )}

      {showCart && bill.count > 0 && (
        <div className="cart-sheet">
          <div className="cart-head">
            Your basket · {canteen.name}
            <button
              className="mark"
              onClick={() => setCart({ canteen: null, lines: [], where: cart.where })}
            >
              Empty it
            </button>
          </div>

          {bill.items.map((i) => (
            <div className="cart-line" key={i.name}>
              <span className="qty">
                <button aria-label={`One fewer ${i.name}`} onClick={() => change(i, -1)}>−</button>
                <b>{i.qty}</b>
                <button aria-label={`One more ${i.name}`} onClick={() => change(i, 1)}>+</button>
              </span>
              <span className="cart-name">{i.name}</span>
              <span className="night-price">₹{i.total}</span>
            </div>
          ))}

          <div className="cart-sum">
            <div><span>Subtotal</span><span>₹{bill.subtotal}</span></div>
            {bill.delivery > 0 && (
              <div><span>Room service</span><span>₹{bill.delivery}</span></div>
            )}
            <div className="cart-grand"><span>Total</span><span>₹{bill.total}</span></div>
          </div>

          <label className="cart-where">
            <span>Where to deliver</span>
            <input
              type="text"
              value={cart.where ?? ""}
              placeholder="Room number and hostel"
              onChange={(e) => setCart((p) => ({ ...p, where: e.target.value }))}
            />
          </label>

          <a
            className="btn block cart-order"
            href={whatsAppHref(firstNumber, message)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Order on WhatsApp
          </a>
          <a className="btn ghost block" href={telHref(firstNumber)}>
            Call {prettyPhone(firstNumber)} instead
          </a>

          {/* Said plainly, because the button looks like it places an order and
              it does not: WhatsApp opens with the order written out and the
              student presses send. */}
          <p className="cart-note">
            This opens WhatsApp with your order written out — you still press
            send. The app can't tell whether the counter has seen it, so call
            if nobody replies.
          </p>
        </div>
      )}

      {/* Pinned, because the basket is what you are building towards and is
          otherwise a long scroll away from whatever you just added. */}
      {bill.count > 0 && (
        <>
          <div className="cart-spacer" aria-hidden="true" />
          <div className="cart-dock">
            <button className="cart-open" onClick={() => setShowCart((v) => !v)}>
              <span className="cart-count">{bill.count}</span>
              {showCart ? "Hide basket" : "View basket"}
              <span className="cart-total">₹{bill.total}</span>
            </button>
          </div>
        </>
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M2.5 11.5 6.5 8l3 2.5L12 8.5l3.5 3" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="6.75" cy="6.25" r="1.25" fill="currentColor" />
    </svg>
  );
}
