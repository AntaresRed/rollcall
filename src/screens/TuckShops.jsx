import { useEffect, useMemo, useState } from "react";
import {
  SHOPS, shopById, filterItems, filterGrouped, hasDiet, shopPhone, shopPhones,
  basketFor, orderText, itemLine, LOCATIONS,
} from "../lib/tuck";
import { DIET_FILTERS, DIET_LABEL } from "../lib/nightmenu";
import { telHref, whatsAppHref, prettyPhone } from "../lib/phone";
import { loadBasket, saveBasket } from "../lib/basket";
import { recordOrder } from "../lib/orders";
import { track } from "../lib/track";
import { UNTOUCHED, messageOf, withAdded } from "../lib/finalmessage";
import FinalMessage from "./FinalMessage";

/**
 * The tuck shops — the card, a basket, and a message to send.
 *
 * No prices and no payment. The shops re-price faster than the card could be
 * re-typed, so the photographed card is where a price is read, and the
 * student pays the counter however the counter takes it.
 *
 * The order is not placed by this app either. The message opens in WhatsApp
 * for the student to send, and nothing here can see whether it happened.
 */

const BASKET = "tuck";
const LEGACY = "iimpresent.tuck.cart";
const BLANK = { shop: null, lines: [], place: "", notes: "", ...UNTOUCHED };
const EMPTY = [];

/** Cleared when the app closes; the room and registration number are not.
 *  Folded to one line per dish on the way in, for a basket saved back when
 *  the same dish could sit in it at two prices. */
const loadCart = () => {
  const cart = loadBasket(BASKET, BLANK, LEGACY);
  return { ...cart, lines: basketFor(cart.lines).items };
};

export default function TuckShops() {
  const [id, setId] = useState(SHOPS[0]?.id ?? null);
  const [diet, setDiet] = useState("all");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState(loadCart);
  const [showCart, setShowCart] = useState(false);
  const [showScan, setShowScan] = useState(false);
  // Which sections the student has opened. Empty to begin with: thirteen
  // headings you can read at a glance beats ninety-eight rows you have to
  // scroll past to learn what is on the card at all.
  const [open, setOpen] = useState(() => new Set());

  useEffect(() => { saveBasket(BASKET, cart); }, [cart]);

  const shop = useMemo(() => shopById(id), [id]);
  const shown = useMemo(() => filterItems(shop, { diet, query }), [shop, diet, query]);
  const grouped = useMemo(() => filterGrouped(shop, { diet, query }), [shop, diet, query]);
  const total = shop?.items?.length ?? 0;
  const diets = hasDiet(shop);
  const narrowed = query.trim().length > 0 || diet !== "all";
  const searching = query.trim().length > 0;
  const phone = shopPhone(shop);

  const lines = useMemo(
    () => (cart.shop === shop?.id ? cart.lines : EMPTY),
    [cart, shop],
  );
  const basket = useMemo(() => basketFor(lines), [lines]);
  const qtyOf = (name) => lines.find((l) => l.name === name)?.qty ?? 0;

  useEffect(() => {
    if (!showCart) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setShowCart(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showCart]);

  const change = (name, by) => {
    setCart((prev) => {
      const same = prev.shop === shop.id;
      const mine = same ? prev.lines : [];
      const at = mine.findIndex((l) => l.name === name);
      const next = [...mine];
      if (at < 0) {
        if (by > 0) next.push({ name, qty: by });
      } else {
        const qty = next[at].qty + by;
        if (qty <= 0) next.splice(at, 1);
        else next[at] = { ...next[at], qty };
      }
      // An emptied basket takes its message with it: whatever was typed was
      // about dishes that are no longer being ordered.
      if (!next.length) return { ...prev, shop: shop.id, lines: next, ...UNTOUCHED };
      const draft = same ? { final: prev.final ?? null, finalBase: prev.finalBase ?? "" } : UNTOUCHED;
      const kept = at < 0 && by > 0
        ? withAdded(draft, itemLine({ name, qty: by }), orderText(next, {
          place: prev.place ?? "", notes: prev.notes ?? "",
        }))
        : draft;
      return { ...prev, shop: shop.id, lines: next, ...kept };
    });
  };

  const add = (item) => change(item.name, 1);
  const drop = (item) => change(item.name, -1);

  const switchShop = (next) => {
    if (next === shop?.id) return;
    if (lines.length &&
        !confirm("Switching shop empties your basket. Carry on?")) return;
    setId(next);
    setQuery("");
    setDiet("all");
    setShowCart(false);
    setShowScan(false);
    // The other shop's sections are not these ones, and arriving with a
    // heading already open that belongs to a card you just left is noise.
    setOpen(new Set());
    if (lines.length) setCart((p) => ({ ...p, shop: next, lines: [], ...UNTOUCHED }));
  };

  if (!SHOPS.length) {
    return <div className="empty">No tuck shop menu has been added yet.</div>;
  }

  // What the basket writes out, and what will actually be sent — the same
  // until the student edits the final message.
  const written = orderText(basket.items, {
    place: cart.place ?? "", notes: cart.notes ?? "",
  });
  const message = messageOf(cart, written);

  /** Recorded on the way out, as the night canteen does. */
  const sent = () => {
    recordOrder(shop, message, { kind: "tuck" });
    track("order", `tuck:${shop.id}`);
  };

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
            {/* One link per number: a single link over "a / b" would ring
                the first whichever half was tapped. */}
            {phone ? shopPhones(shop).map((p) => (
              <a className="canteen-call" key={p} href={telHref(p)}>{prettyPhone(p)}</a>
            )) : (
              <span>Walk over — no number on file</span>
            )}
            {shop.hours && <span>{shop.hours}</span>}
            {shop.delivers && <span>Delivers</span>}
          </div>
        </div>
      )}

      {/* The typed list carries no prices; the photograph is the one place
          on screen that says what the shop charges, so it is a filled button
          rather than a line of text somebody scrolls past. */}
      {shop?.pages?.length > 0 && (
        <>
          <button
            className="btn scan-cta"
            aria-expanded={showScan}
            onClick={() => {
              if (!showScan) track("original_menu", `tuck:${shop.id}`);
              setShowScan((v) => !v);
            }}
          >
            <ScanIcon />
            <span className="scan-cta-text">
              {showScan ? "Hide" : "See"} Original {shop.name} Menu
            </span>
            <span className="scan-cta-pages">
              {shop.pages.length} page{shop.pages.length === 1 ? "" : "s"}
            </span>
          </button>

          {showScan && (
            <div className="scan-pages">
              <p className="scan-note">
                Photographed from the card on the counter. Tap a page to open
                it full size, where it can be zoomed.
              </p>
              {shop.pages.map((src, i) => (
                <a key={src} href={src} target="_blank" rel="noopener noreferrer">
                  <img
                    className="scan-page"
                    src={src}
                    alt={`${shop.name}, page ${i + 1} of ${shop.pages.length}`}
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          )}
        </>
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

      {/* Grouped when somebody has read the card's running order into
          sections, flat when nobody has. The row is the same either way — an
          ungrouped card is not a different kind of menu, just a less sorted
          one. */}
      {grouped
        ? grouped.map((cat) => {
            // A search opens whatever it found. Leaving results folded away
            // behind a closed heading would make the menu look like it has
            // nothing, which is the exact thing the search disproves.
            const isOpen = searching || open.has(cat.name);
            return (
              <div className={`night-cat${isOpen ? " open" : ""}`} key={cat.name}>
                <button
                  className="night-cat-head"
                  aria-expanded={isOpen}
                  onClick={() => setOpen((prev) => {
                    const next = new Set(prev);
                    if (next.has(cat.name)) next.delete(cat.name);
                    else next.add(cat.name);
                    return next;
                  })}
                >
                  <Chevron open={isOpen} />
                  <span className="night-cat-name">{cat.name}</span>
                  <span className="night-cat-n">{cat.items.length}</span>
                </button>
                {isOpen && cat.items.map((item) => (
                  <Row key={item.name} item={item} diets={diets}
                       qty={qtyOf(item.name)} onAdd={add} onDrop={drop} />
                ))}
              </div>
            );
          })
        : shown.map((item) => (
            <Row key={item.name} item={item} diets={diets}
                 qty={qtyOf(item.name)} onAdd={add} onDrop={drop} />
          ))}

      {showCart && basket.count > 0 && (
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
              {basket.items.map((i) => (
                <div className="cart-line" key={i.name}>
                  <span className="qty">
                    <button aria-label={`One fewer ${i.name}`}
                            onClick={() => change(i.name, -1)}>−</button>
                    <b>{i.qty}</b>
                    <button aria-label={`One more ${i.name}`}
                            onClick={() => change(i.name, 1)}>+</button>
                  </span>
                  <span className="cart-name">{i.name}</span>
                </div>
              ))}

              <fieldset className="place-pick">
                <legend>Deliver to</legend>
                <div className="place-grid">
                  {LOCATIONS.map((loc) => (
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
                    </button>
                  ))}
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
                <em>Optional.</em>
              </label>

              <FinalMessage
                cart={cart}
                written={written}
                onChange={(patch) => setCart((p) => ({ ...p, ...patch }))}
              />

              {phone && !message.trim() ? (
                <p className="cart-warn">
                  The final message is empty, so there is nothing to send.
                </p>
              ) : phone ? (
                <a
                  className="btn block cart-order"
                  href={whatsAppHref(phone, message)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={sent}
                >
                  Send order on WhatsApp
                </a>
              ) : (
                <p className="cart-warn">
                  {shop.name} has no number on file, so the order can't be sent
                  from here — take the list over to the counter.
                </p>
              )}

              <p className="cart-note">
                This opens WhatsApp with your order written out — you still press
                send. The app can't tell whether the counter has seen it.
              </p>

              <button
                className="btn ghost block cart-empty"
                onClick={() => {
                  setCart((p) => ({ ...p, shop: null, lines: [], ...UNTOUCHED }));
                  setShowCart(false);
                }}
              >
                Empty the basket
              </button>
            </div>
          </div>
        </div>
      )}

      {basket.count > 0 && (
        <>
          <div className="cart-spacer" aria-hidden="true" />
          <div className="cart-dock">
            <button className="cart-open" onClick={() => setShowCart(true)}>
              <span className="cart-count">{basket.count}</span>
              View basket
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

/**
 * One item on the card.
 *
 * Shared by the grouped and flat renderings so the two cannot drift: this is
 * the row where a thing is ordered, and having two copies of it would mean
 * fixing everything here twice.
 */
function Row({ item, diets, qty, onAdd, onDrop }) {
  return (
    <div className={`night-row tuck-row${diets ? "" : " nodiet"}${qty ? " in-cart" : ""}`}>
      {diets && (
        <span className={`diet-dot ${item.diet}`} title={DIET_LABEL[item.diet]} />
      )}
      <span className="night-item">{item.name}</span>
      <span className="night-act">
        {qty > 0 ? (
          <span className="qty">
            <button aria-label={`One fewer ${item.name}`} onClick={() => onDrop(item)}>−</button>
            <b>{qty}</b>
            <button aria-label={`One more ${item.name}`} onClick={() => onAdd(item)}>+</button>
          </span>
        ) : (
          <button
            className="night-add"
            aria-label={`Add ${item.name}`}
            onClick={() => onAdd(item)}
          >
            +
          </button>
        )}
      </span>
    </div>
  );
}

/** The same chevron the night canteens' sections use. */
function Chevron({ open }) {
  return (
    <svg
      className={`night-chev${open ? " open" : ""}`}
      width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden="true"
    >
      <path d="M5 3.5 9.5 7 5 10.5" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The same mark the night canteens use for their scans — it is the same
 *  promise, so it should not be a different picture. */
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
