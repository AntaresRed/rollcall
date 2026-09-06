/**
 * Where a basket lives between one look and the next.
 *
 * Two different lifetimes, so two different stores rather than one store and
 * a pile of expiry logic:
 *
 *   sessionStorage   what you are ordering. Survives a reload and a stray
 *                    back-swipe, which is the thing that used to lose a
 *                    ten-item basket at 1am — and is cleared by the browser
 *                    itself when the tab or the installed app closes. Last
 *                    night's basket is not an order, and finding it waiting
 *                    is worse than finding nothing.
 *
 *   localStorage     your room and registration number. Those do not change
 *                    between orders, and typing them again every time is the
 *                    kind of friction that stops somebody using the basket
 *                    at all.
 *
 * Nothing here needs a clock, and nothing has to decide how stale is stale.
 * The browser already knows when the app closed.
 */

/**
 * The fields that outlive the basket. Everything else goes with the order.
 *
 * All three are facts about the person rather than about tonight: the night
 * canteen asks for a room and a registration number, the tuck shops ask which
 * corner of campus to walk to. None of them changes between orders, and being
 * asked again every time is what stops somebody using the basket at all.
 */
export const IDENTITY = ["room", "reg", "place"];

/** Split a cart into the part that persists and the part that does not. */
export function splitBasket(cart) {
  const who = {};
  const order = {};
  for (const [k, v] of Object.entries(cart ?? {})) {
    if (IDENTITY.includes(k)) who[k] = v;
    else order[k] = v;
  }
  return { who, order };
}

/**
 * Put one back together.
 *
 * `empty` supplies every key, so a stored shape from an older version cannot
 * leave a field undefined and a controlled input uncontrolled. The order is
 * only trusted when it actually carries lines; anything else is treated as
 * nothing, which is also what a fresh session looks like.
 */
export function mergeBasket(empty, who, order) {
  const usable = order && Array.isArray(order.lines) ? order : null;
  return { ...empty, ...(usable ?? {}), ...(who ?? {}) };
}

/**
 * The store, resolved inside the try rather than passed in.
 *
 * Handing `sessionStorage` to a function as an argument evaluates it at the
 * call site, so where the global does not exist — the smoke test renders
 * without a browser — it throws a ReferenceError before any catch can see it.
 */
const store = (which) => {
  try {
    return which === "session" ? sessionStorage : localStorage;
  } catch {
    return null;
  }
};

const read = (which, key) => {
  try {
    return JSON.parse(store(which)?.getItem(key) || "null");
  } catch {
    /* a private window, storage switched off, or something half-written */
    return null;
  }
};

const write = (which, key, value) => {
  try {
    store(which)?.setItem(key, JSON.stringify(value));
  } catch {
    /* nothing worth interrupting an order for */
  }
};

const whoKey = (name) => `iimpresent.${name}.who`;
const orderKey = (name) => `iimpresent.${name}.order`;

/**
 * Load a basket.
 *
 * `legacyKey` is the single localStorage entry this replaced, which held the
 * lines and the room number together. Its room and registration number are
 * worth keeping — somebody typed them — so they are lifted across once and
 * the old entry is removed. Its lines are deliberately dropped: they belong
 * to a session that has already ended.
 */
export function loadBasket(name, empty, legacyKey = null) {
  let who = read("local", whoKey(name));

  if (!who && legacyKey) {
    const old = read("local", legacyKey);
    if (old) {
      who = splitBasket(old).who;
      write("local", whoKey(name), who);
      try { store("local")?.removeItem(legacyKey); } catch { /* ignore */ }
    }
  }

  return mergeBasket(empty, who, read("session", orderKey(name)));
}

export function saveBasket(name, cart) {
  const { who, order } = splitBasket(cart);
  write("local", whoKey(name), who);
  write("session", orderKey(name), order);
}
