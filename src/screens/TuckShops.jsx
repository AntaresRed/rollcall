import { useEffect, useMemo, useState } from "react";
import {
  SHOPS, shopById, filterItems, hasDiet, shopPhone,
  priceOptions, lineKey, billFor, orderText, shopUpi, upiHref, shopQr, payNote,
  LOCATIONS, deliveryFor, chargesByPlace,
} from "../lib/tuck";
import { DIET_FILTERS, DIET_LABEL } from "../lib/nightmenu";
import { telHref, whatsAppHref, prettyPhone } from "../lib/phone";
import { isAndroid } from "../lib/platform";
import { loadBasket, saveBasket } from "../lib/basket";
import {
  UPI_APPS, appById, forApp, rememberedApp, rememberApp, forgetApp,
} from "../lib/upiapps";

/**
 * The tuck shops — a price card, a basket, and a message to send.
 *
 * The one thing this screen has to get right that the night canteen does not:
 * a third of the card is printed at two prices, "40 / 60" for without and
 * with cheese. Nothing can be added up until somebody says which. So an item
 * with a choice asks, and the price it was ordered at rides along on the line
 * and into the message, because that number is the only thing that says which
 * one the counter should make.
 *
 * Neither the order nor the payment is placed by this app. The message opens
 * in WhatsApp for the student to send, and the pay button hands a UPI request
 * to whichever app they already use. Nothing here can see whether either one
 * happened.
 */

const BASKET = "tuck";
const LEGACY = "iimpresent.tuck.cart";
const BLANK = { shop: null, lines: [], place: "", notes: "" };
const EMPTY = [];

/** Cleared when the app closes; the room and registration number are not. */
const loadCart = () => loadBasket(BASKET, BLANK, LEGACY);

export default function TuckShops() {
  const [id, setId] = useState(SHOPS[0]?.id ?? null);
  const [diet, setDiet] = useState("all");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState(loadCart);
  const [showCart, setShowCart] = useState(false);
  // { item, mode } while a price is being chosen, null otherwise. The same
  // question — "which of these prices?" — is asked when adding and when
  // removing, because an item can sit in the basket at more than one.
  const [choosing, setChoosing] = useState(null);

  useEffect(() => { saveBasket(BASKET, cart); }, [cart]);

  const shop = useMemo(() => shopById(id), [id]);
  const shown = useMemo(() => filterItems(shop, { diet, query }), [shop, diet, query]);
  const total = shop?.items?.length ?? 0;
  const diets = hasDiet(shop);
  const narrowed = query.trim().length > 0 || diet !== "all";
  const phone = shopPhone(shop);

  const lines = useMemo(
    () => (cart.shop === shop?.id ? cart.lines : EMPTY),
    [cart, shop],
  );
  const bill = useMemo(
    () => billFor(shop, lines, cart.place),
    [shop, lines, cart.place],
  );

  /** The basket lines for one item — one per price it was ordered at. */
  const linesFor = (name) => lines.filter((l) => l.name === name);

  /** How many of this item are in the basket, across every price it was
   *  ordered at — the number that belongs on its row. */
  const qtyOf = (name) =>
    linesFor(name).reduce((n, l) => n + l.qty, 0);

  useEffect(() => {
    if (!showCart && !choosing) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (choosing) setChoosing(null);
      else setShowCart(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showCart, choosing]);

  const change = (name, price, by) => {
    setCart((prev) => {
      const mine = prev.shop === shop.id ? prev.lines : [];
      const key = lineKey(name, price);
      const at = mine.findIndex((l) => lineKey(l.name, l.price) === key);
      const next = [...mine];
      if (at < 0) {
        if (by > 0) next.push({ name, price, qty: by });
      } else {
        const qty = next[at].qty + by;
        if (qty <= 0) next.splice(at, 1);
        else next[at] = { ...next[at], qty };
      }
      return { ...prev, shop: shop.id, lines: next };
    });
  };

  /** One price and it goes straight in; several and the student picks. */
  const add = (item) => {
    const prices = priceOptions(item);
    if (prices.length <= 1) change(item.name, prices[0] ?? 0, 1);
    else setChoosing({ item, mode: "add" });
  };

  /**
   * Take one off the row.
   *
   * Only ambiguous when the same dish is in the basket at two prices — with
   * and without cheese, say. Guessing which one to remove would be a coin
   * flip on somebody's order, so it asks, using the same dialog as adding and
   * offering only the prices actually in the basket.
   */
  const drop = (item) => {
    const mine = linesFor(item.name);
    if (mine.length === 1) change(item.name, mine[0].price, -1);
    else if (mine.length > 1) setChoosing({ item, mode: "drop" });
  };

  const switchShop = (next) => {
    if (next === shop?.id) return;
    if (lines.length &&
        !confirm("Switching shop empties your basket. Carry on?")) return;
    setId(next);
    setQuery("");
    setDiet("all");
    setShowCart(false);
    if (lines.length) setCart((p) => ({ ...p, shop: next, lines: [] }));
  };

  if (!SHOPS.length) {
    return <div className="empty">No tuck shop menu has been added yet.</div>;
  }

  const message = orderText(shop, bill.items, {
    place: cart.place, notes: cart.notes,
  });

  return (
    <>
      <div className="mess-tabs" role="tablist" aria-label="Tuck shop">
        {SHOPS.map((s) => (
          <button
            key={s.id}
            className="mess-tab"
            role="tab"
            aria-selected={s.id === id}
            onClick={() => switchShop(s.id)}
          >
            {s.name}
          </button>
        ))}
      </div>

      {shop && (
        <div className="canteen-head">
          <div className="canteen-name">{shop.name}</div>
          <div className="canteen-meta">
            {/* Only when there is a number worth tapping. A shop with none is
                still worth listing — you walk to it — but a dead link that
                looks like a phone number is worse than no link. */}
            {phone ? (
              <a className="canteen-call" href={telHref(phone)}>{prettyPhone(phone)}</a>
            ) : (
              <span>Walk over — no number on file</span>
            )}
            {shop.hours && <span>{shop.hours}</span>}
            {Number(shop.delivery) > 0 && <span>Delivery ₹{shop.delivery}</span>}
          </div>
        </div>
      )}

      <div className="night-find">
        <div className="dir-search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            placeholder={`Search ${total} items…`}
            aria-label="Search the tuck shop menu"
            autoComplete="off"
            enterKeyHint="search"
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="dir-clear" aria-label="Clear search" onClick={() => setQuery("")}>
              ×
            </button>
          )}
        </div>

        <div className="night-filters">
          {/* Hidden until the Diet column in the spreadsheet is filled in: a
              filter that can only ever return "unconfirmed" is a control that
              does nothing, and looks broken for it. */}
          {diets ? (
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
          ) : <span />}
          <span className="night-count" role="status">
            {narrowed ? `${shown.length} of ${total}` : `${total} items`}
          </span>
        </div>
      </div>

      {!shown.length && (
        <div className="night-none">
          <p>Nothing on this menu matches that.</p>
          <button
            className="btn ghost"
            onClick={() => { setQuery(""); setDiet("all"); }}
          >
            Show the whole menu
          </button>
        </div>
      )}

      {shown.map((item) => {
        const qty = qtyOf(item.name);
        const prices = priceOptions(item);
        return (
          <div
            className={`night-row tuck-row${diets ? "" : " nodiet"}${qty ? " in-cart" : ""}`}
            key={item.name}
          >
            {diets && (
              <span className={`diet-dot ${item.diet}`} title={DIET_LABEL[item.diet]} />
            )}
            <span className="night-item">{item.name}</span>
            <span className="night-price">₹{item.price}</span>
            <span className="night-act">
              {qty > 0 ? (
                <span className="qty">
                  <button
                    aria-label={`One fewer ${item.name}`}
                    onClick={() => drop(item)}
                  >
                    −
                  </button>
                  <b>{qty}</b>
                  <button aria-label={`One more ${item.name}`} onClick={() => add(item)}>
                    +
                  </button>
                </span>
              ) : (
                <button
                  className="night-add"
                  aria-label={prices.length > 1
                    ? `Add ${item.name} — choose a price`
                    : `Add ${item.name}`}
                  onClick={() => add(item)}
                >
                  +
                </button>
              )}
            </span>
          </div>
        );
      })}

      {shown.length > 0 && (
        <p className="night-note">
          Two prices means the shop's own two options — usually without and
          with cheese. Prices are transcribed from the counter's card and can
          go out of date; what they charge is what they charge.
        </p>
      )}

      {/* Which price, asked once, at the moment it matters. Guessing here —
          splitting the name on its slashes to label each price — gets "Pav
          Bhaji / Extra Pav" wrong, so the whole name stays and the price is
          what tells the counter which one. */}
      {choosing && (
        <div
          className="modal-back"
          onClick={(e) => { if (e.target === e.currentTarget) setChoosing(null); }}
        >
          <div className="modal choose-modal" role="dialog" aria-modal="true"
               aria-label={`Choose a price for ${choosing.item.name}`}>
            <div className="modal-head">
              <span>{choosing.mode === "drop" ? "Remove which one?" : "Which one?"}</span>
              <button className="modal-x" aria-label="Cancel" onClick={() => setChoosing(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <p className="choose-name">{choosing.item.name}</p>
              <p className="choose-hint">
                {choosing.mode === "drop"
                  ? "You have this at more than one price. Pick the one to take off."
                  : "The card prints this at more than one price. Pick the one you want and it goes to the counter with your order."}
              </p>

              {/* Adding offers every price on the card; removing offers only
                  the ones actually in the basket, with the count, so nobody
                  is asked to take away something they never ordered. */}
              {choosing.mode === "drop"
                ? linesFor(choosing.item.name).map((l) => (
                  <button
                    key={l.price}
                    className="btn ghost block choose-price"
                    onClick={() => {
                      change(l.name, l.price, -1);
                      setChoosing(null);
                    }}
                  >
                    ₹{l.price}
                    <span className="choose-have">{l.qty} in basket</span>
                  </button>
                ))
                : priceOptions(choosing.item).map((p) => (
                  <button
                    key={p}
                    className="btn ghost block choose-price"
                    onClick={() => { change(choosing.item.name, p, 1); setChoosing(null); }}
                  >
                    ₹{p}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {showCart && bill.count > 0 && (
        <div
          className="modal-back"
          onClick={(e) => { if (e.target === e.currentTarget) setShowCart(false); }}
        >
          <div className="modal cart-modal" role="dialog" aria-modal="true" aria-label="Your basket">
            <div className="modal-head">
              <span>Your basket · {shop.name}</span>
              <button className="modal-x" aria-label="Close basket" onClick={() => setShowCart(false)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              {bill.items.map((i) => (
                <div className="cart-line" key={lineKey(i.name, i.price)}>
                  <span className="qty">
                    <button aria-label={`One fewer ${i.name}`}
                            onClick={() => change(i.name, i.price, -1)}>−</button>
                    <b>{i.qty}</b>
                    <button aria-label={`One more ${i.name}`}
                            onClick={() => change(i.name, i.price, 1)}>+</button>
                  </span>
                  <span className="cart-name">
                    {i.name}
                    <span className="cart-each">₹{i.price} each</span>
                  </span>
                  <span className="night-price">₹{i.total}</span>
                </div>
              ))}

              {/* Broken down only when there is a charge to explain. Six
                  rupees appearing inside a total nobody can reconcile is how
                  a student decides the app is wrong. */}
              <div className="cart-sum">
                {bill.delivery > 0 && (
                  <>
                    <div><span>Subtotal</span><span>₹{bill.subtotal}</span></div>
                    <div><span>Delivery</span><span>₹{bill.delivery}</span></div>
                  </>
                )}
                <div className="cart-grand"><span>Total</span><span>₹{bill.total}</span></div>
              </div>

              {/* One question instead of two, because for this shop it is
                  also the question that sets the price: Mohan Da charges
                  fifteen across most of campus and twenty out to LVH, MDC and
                  the family quarters. Each option carries its own fee, so the
                  cost of choosing is visible before it is chosen. */}
              <fieldset className="place-pick">
                <legend>Deliver to</legend>
                <div className="place-grid">
                  {LOCATIONS.map((loc) => {
                    const fee = deliveryFor(shop, loc);
                    return (
                      <button
                        key={loc}
                        type="button"
                        className={`place-chip${cart.place === loc ? " on" : ""}`}
                        aria-pressed={cart.place === loc}
                        onClick={() => setCart((p) => ({
                          ...p, place: p.place === loc ? "" : loc,
                        }))}
                      >
                        {loc}
                        {chargesByPlace(shop) && fee > 0 && (
                          <span className="place-fee">₹{fee}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label className="cart-notes">
                <span>Order instructions</span>
                <textarea
                  rows={2}
                  value={cart.notes ?? ""}
                  placeholder="Less spicy, no onion, extra plates…"
                  onChange={(e) => setCart((p) => ({ ...p, notes: e.target.value }))}
                />
                <em>Optional. Anything the counter should know.</em>
              </label>

              {/* The fee is unknown until somewhere is chosen, so the total
                  on screen would be short and so would the payment. */}
              {chargesByPlace(shop) && !cart.place && (
                <p className="cart-warn">
                  Pick where it is going — {shop.name} charges by how far it
                  has to walk, so the total isn&apos;t settled yet.
                </p>
              )}

              {phone ? (
                <a
                  className="btn block cart-order"
                  href={whatsAppHref(phone, message)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Send order on WhatsApp
                </a>
              ) : (
                <p className="cart-warn">
                  {shop.name} has no number on file, so the order can't be sent
                  from here — take the list over to the counter.
                </p>
              )}

        <PayBlock shop={shop} total={bill.total} />

              <p className="cart-note">
                This opens WhatsApp with your order written out — you still press
                send. The app can't tell whether the counter has seen it.
              </p>

              <button
                className="btn ghost block cart-empty"
                onClick={() => {
                  setCart((p) => ({ ...p, shop: null, lines: [] }));
                  setShowCart(false);
                }}
              >
                Empty the basket
              </button>
            </div>
          </div>
        </div>
      )}

      {bill.count > 0 && (
        <>
          <div className="cart-spacer" aria-hidden="true" />
          <div className="cart-dock">
            <button className="cart-open" onClick={() => setShowCart(true)}>
              <span className="cart-count">{bill.count}</span>
              View basket
              <span className="cart-total">₹{bill.total}</span>
            </button>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Paying, where the platform allows it.
 *
 * `upi://` is an Android intent. iOS has never registered it system-wide, so
 * the same link there opens nothing at all — and a button that does nothing
 * is worse than no button. iPhones get the address to copy instead, which is
 * what they would have done anyway.
 *
 * Nothing appears until a UPI address is on file for the shop. There is no
 * way to derive one from a phone number, and a plausible guess would send
 * real money to whoever happens to own it.
 */
/**
 * Choosing which UPI app gets the payment, on either platform.
 *
 * It began as the iPhone's consolation prize — iOS never registered `upi://`
 * system-wide, so the page had to offer the list itself. Android turned out
 * to need the same thing for the opposite reason: it has a chooser, but a
 * remembered default silently swallows it, and a phone that once picked
 * WhatsApp sends every payment there without asking again. Naming the app
 * explicitly goes where it is told.
 *
 * Once an app is chosen the main button goes straight to it and the picker
 * shrinks to a line of small print — after the first time this is not a
 * decision any more, it is a button. The way back is always there, since the
 * only way to find out an app is missing is to tap it and watch nothing
 * happen.
 */
function AppPay({ pay, total }) {
  const [chosen, setChosen] = useState(rememberedApp);
  const [picking, setPicking] = useState(false);

  const app = appById(chosen);
  // With nothing chosen this stays the plain link: Android shows its chooser,
  // and iOS does nothing, which is what the QR underneath is for.
  const href = app ? forApp(pay, app.id, { android: isAndroid() }) : pay;

  const pick = (id) => {
    setChosen(rememberApp(id));
    setPicking(false);
  };

  return (
    <>
      <a className="btn block pay-btn" href={href}>
        Pay ₹{total}{app ? ` with ${app.name}` : " with UPI"}
      </a>

      <button
        className="pay-pick-toggle"
        aria-expanded={picking}
        onClick={() => setPicking((v) => !v)}
      >
        {app ? "Choose a different app" : "Choose UPI app to pay"}
        <Caret open={picking} />
      </button>

      {picking && (
        <div className="pay-pick" role="group" aria-label="UPI app">
          {/* Above the list, not below it: it is the reason to pick carefully
              rather than a footnote about what already happened. */}
          <p className="pay-pick-lead">Your choice will be remembered from next time.</p>
          {UPI_APPS.map((a) => (
            <button
              key={a.id}
              className={`pay-pick-app${a.id === chosen ? " on" : ""}`}
              aria-pressed={a.id === chosen}
              onClick={() => pick(a.id)}
            >
              {a.name}
              {a.id === chosen && <span className="pay-pick-tick">Remembered</span>}
            </button>
          ))}
          {app && (
            <button
              className="pay-pick-app pay-pick-clear"
              onClick={() => { setChosen(forgetApp()); setPicking(false); }}
            >
              Forget my choice
            </button>
          )}
          <p className="pay-pick-note">
            {/* Said plainly, because a dead scheme is indistinguishable from
                a mis-tap: nothing happens either way. */}
            If the app doesn&apos;t open, it may not be installed — try
            another, or use the QR below.
          </p>
        </div>
      )}
    </>
  );
}

function Caret({ open }) {
  return (
    <svg
      className={`pay-caret${open ? " open" : ""}`}
      width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true"
    >
      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PayBlock({ shop, total }) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const vpa = shopUpi(shop);
  const qr = shopQr(shop);
  if ((!vpa && !qr) || total <= 0) return null;

  const warn = payNote(shop);
  const note = `${shop.name} order`;
  const pay = upiHref(shop, { amount: total, note });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(vpa);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* no clipboard permission; the address is on screen to read */
    }
  };

  return (
    <div className="pay-block">
      {/* First, and unmissable. Everything under it moves real money, and a
          stand-in address is the one state where that money goes somewhere
          nobody intended. */}
      {warn && <p className="pay-warn">{warn}</p>}

      {/* The same flow on both platforms now. It reached Android late and by
          a different route: not because the phone cannot choose, but because
          it remembers a choice made once and never asks again. */}
      {pay && <AppPay pay={pay} total={total} />}

      {qr && (
        <>
          <button
            className="btn ghost block pay-alt"
            aria-expanded={showQr}
            onClick={() => setShowQr((v) => !v)}
          >
            {showQr ? "Hide" : "Show"} {shop.name}&apos;s QR
          </button>
          {showQr && (
            <div className="pay-qr">
              <img src={qr} alt={`${shop.name}'s payment QR code`} loading="lazy" />
              <p>
                {/* Said because the obvious thing to try does not work: you
                    cannot scan a code with the screen showing it. */}
                You can&apos;t scan this with the phone displaying it. Screenshot
                it and use <strong>scan from gallery</strong> in your UPI app, or
                scan it from another device. The amount isn&apos;t in the code —
                type ₹{total} yourself.
              </p>
            </div>
          )}
        </>
      )}

      {vpa && (
        <div className="pay-vpa">
          <span>{shop.name} · UPI</span>
          <code>{vpa}</code>
          <button className="btn ghost pay-copy" onClick={copy}>
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      )}

      <p className="pay-note">
        {isAndroid()
          ? "This opens your UPI app with the amount filled in."
          : "On iPhone the QR and the ID always work, whatever the button above does."}
        {" "}The app never handles the money and can&apos;t tell whether a
        payment went through. Check the name on the screen before you approve
        it, and keep the receipt.
      </p>
    </div>
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
