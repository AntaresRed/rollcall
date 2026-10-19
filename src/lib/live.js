import { VALIDATORS } from "./datasets";

/**
 * What PORs have published, held for the screens that read it.
 *
 * Plain module state, so a menu screen can ask "is there a live NH menu?"
 * without importing the Supabase client. The bundled JSON stays the fallback
 * for everything: a dataset nobody has published, a phone that has never
 * reached the server, or a payload this version of the app does not accept
 * all read exactly as they did before the dashboard existed.
 *
 * What is held is also saved on the phone, one copy per dataset with its
 * version number. A fresh start shows the saved copies at once and then asks
 * the server only for version numbers (planSync), downloading just the
 * datasets whose number has moved. Most opens cost a few hundred bytes.
 */

/** Versioned, so a later change of shape is a new key, not a misread. */
const KEY = "iimpresent-live-v1";

const live = new Map();
// Versions this app looked at and could not use: a kind it does not read yet,
// or a payload that failed its checks. Remembered for the session so the
// same unusable download isn't repeated at every check.
const refused = new Map();

const keyOf = (r) => `${r.kind}:${r.scope}`;

/** Whether this version of the app can show a row. */
const usable = (r) => {
  const check = VALIDATORS[r?.kind];
  return Boolean(check && typeof r.scope === "string" && check(r.payload, r.scope).ok);
};

/**
 * Replace everything held with these rows. A row whose payload fails its
 * kind's checks is dropped rather than shown: the database runs the same
 * checks, so this only bites when an older app meets a newer shape, and the
 * bundled copy is the right answer then.
 */
export function setLiveDatasets(rows) {
  live.clear();
  for (const r of rows ?? []) if (usable(r)) live.set(keyOf(r), r);
}

/** One dataset, just published from the dashboard on this device. */
export function setLiveDataset(row) {
  if (!usable(row)) return;
  live.set(keyOf(row), row);
  saveLive();
}

export const liveDataset = (kind, scope) => live.get(`${kind}:${scope}`) ?? null;

/**
 * A bundled list with each item replaced by its published version, matched
 * on `id`. Only items the bundle already has are replaced — a dataset is
 * granted per existing hostel or shop, so a scope the bundle doesn't know is
 * not one the app has anywhere to show.
 */
export const withLive = (kind, bundled) =>
  bundled.map((item) => live.get(`${kind}:${item.id}`)?.payload ?? item);

/**
 * What to do about the server's version list.
 *
 * `fetch`: datasets whose number differs from the one held — new, changed or
 * restored. A kind this app has no checker for is never fetched; it would
 * only be refused. `drop`: datasets held here that the server no longer
 * lists, which can only happen if versions were deleted by hand, and which
 * should go back to the bundled copy rather than linger.
 *
 * Only ever called with a list that actually arrived. A failed request is not
 * an empty list, and must not be read as "everything was unpublished".
 */
export function planSync(list) {
  const fetch = [];
  const listed = new Set();
  for (const v of Array.isArray(list) ? list : []) {
    if (!v || !VALIDATORS[v.kind] || typeof v.scope !== "string") continue;
    const k = keyOf(v);
    listed.add(k);
    if (live.get(k)?.version_id === v.version_id) continue;
    if (refused.get(k) === v.version_id) continue;
    fetch.push(k);
  }
  const drop = [...live.keys()].filter((k) => !listed.has(k));
  return { fetch, drop };
}

/**
 * Take in what was downloaded for `asked`, and let go of `drop`. A row that
 * fails its checks is remembered as refused, so it isn't fetched again; one
 * that was asked for but didn't come back (published over in between) is
 * simply asked for again next time.
 */
export function applySync({ rows = [], drop = [] } = {}) {
  for (const k of drop) live.delete(k);
  for (const r of Array.isArray(rows) ? rows : []) {
    if (usable(r)) live.set(keyOf(r), r);
    else if (r?.kind && r?.scope) refused.set(keyOf(r), r.version_id);
  }
}

/**
 * Show what was saved on this phone last time. Every saved copy goes through
 * the same checks as a fresh one: it may have been written by an older
 * version of the app, or damaged, and the bundle is better than either.
 *
 * Storage is looked up inside the try, because merely reading
 * `localStorage` can throw — in a locked-down or private browser, say.
 */
export function restoreSavedLive(storage) {
  try {
    const s = storage ?? globalThis.localStorage;
    const raw = s?.getItem(KEY);
    if (!raw) return;
    const items = JSON.parse(raw)?.items;
    for (const r of Array.isArray(items) ? items : []) {
      if (usable(r) && !live.has(keyOf(r))) live.set(keyOf(r), r);
    }
  } catch {
    /* nothing saved that can be used: the bundle stands */
  }
}

/** Save what is held, one copy per dataset. A full or missing store is fine:
 *  the next open simply downloads again. */
export function saveLive(storage) {
  try {
    const s = storage ?? globalThis.localStorage;
    s?.setItem(KEY, JSON.stringify({
      items: [...live.values()].map(({ kind, scope, version_id, payload }) =>
        ({ kind, scope, version_id, payload })),
    }));
  } catch {
    /* not saved; nothing else depends on it */
  }
}

/** For tests: forget everything, including what was refused. */
export function resetLive() {
  live.clear();
  refused.clear();
}
