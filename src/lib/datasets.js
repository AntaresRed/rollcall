/**
 * The datasets PORs publish from the dashboard, and the rules each must meet.
 *
 * The rules here are the readable half of a pair. The database checks the
 * same things in supabase/por-dashboard.sql, because a check that lives only
 * in the app is worth nothing against a direct API call — but a Postgres
 * exception makes a poor message for a mess secretary, so the app checks
 * first and says what is wrong in words.
 */

export const MEAL_NAMES = ["Breakfast", "Lunch", "Snacks", "Dinner"];
export const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday",
                     "Friday", "Saturday", "Sunday"];

/** How many versions of each dataset the database keeps, the live one
 *  included: prune_dataset_versions() in por-dashboard.sql. Change both. */
export const KEEP_VERSIONS = 5;

/** Kept in step with the length checks in check_day_mess(). */
export const MAX_MEAL = 600;
export const MAX_TIMING = 60;

/**
 * Every kind of dataset a POR can own. `ready` is whether the dashboard can
 * edit it yet; a kind that is granted but not ready still shows, so its owner
 * sees it is coming rather than finding nothing there.
 */
export const KINDS = {
  "day-mess":         { label: "Day mess menu", ready: true },
  "night-canteen":    { label: "Night canteen", ready: false },
  "tuck":             { label: "Tuck shop", ready: false },
  "por-contacts":     { label: "POR contacts", ready: false },
  "schedule":         { label: "Class schedule", ready: false },
  "course-list":      { label: "Course list", ready: false },
  "schedule-changes": { label: "Schedule changes", ready: false },
  "faculty":          { label: "Faculty directory", ready: false },
};

const SCOPE_NAMES = {
  nh: "NH", oh: "OH", lvh: "LVH", wh: "WH",
  mohanda: "Mohan Da", tagore: "Tagore", machaan: "Machaan",
  pgp1: "PGP1", pgp2: "PGP2",
};

/** "Day mess menu · NH". A scope of "all" adds nothing worth reading. */
export function datasetTitle(kind, scope) {
  const label = KINDS[kind]?.label ?? kind;
  if (!scope || scope === "all") return label;
  return `${label} · ${SCOPE_NAMES[scope] ?? scope.toUpperCase()}`;
}

/** One entry per dataset, in a stable order: ready ones first, then by title. */
export function datasetsFrom(access) {
  const seen = new Map();
  for (const a of access ?? []) {
    const key = `${a.kind}:${a.scope}`;
    if (!seen.has(key)) seen.set(key, { kind: a.kind, scope: a.scope, key });
  }
  return [...seen.values()].sort((x, y) =>
    Number(Boolean(KINDS[y.kind]?.ready)) - Number(Boolean(KINDS[x.kind]?.ready)) ||
    datasetTitle(x.kind, x.scope).localeCompare(datasetTitle(y.kind, y.scope)));
}

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const trimmed = (v) => (typeof v === "string" ? v.trim() : "");

/**
 * A hostel's menu as the form holds it, made ready to publish: every string
 * trimmed, and blank timings and every-day lines dropped rather than kept as
 * empty keys — the menu screen draws a Timings box for any key at all.
 * Blank meals are kept, as the build keeps them: the screen shows "—".
 */
export function cleanDayMess(h) {
  const pick = (obj) => Object.fromEntries(
    MEAL_NAMES.map((m) => [m, trimmed(obj?.[m])]).filter(([, v]) => v),
  );
  return {
    id: h.id,
    name: trimmed(h.name),
    everyday: pick(h.everyday),
    timings: pick(h.timings),
    days: WEEK.map((day) => {
      const found = (h.days ?? []).find((d) => d.day === day);
      return {
        day,
        meals: Object.fromEntries(MEAL_NAMES.map((m) => [m, trimmed(found?.meals?.[m])])),
      };
    }),
  };
}

/**
 * Whether one hostel's day mess menu can go live.
 *
 * Errors stop a publish; warnings are said and then allowed. An empty meal is
 * a warning, as it is in build_menu.py: a mess that genuinely serves nothing
 * at Sunday snacks should be able to say so.
 */
export function validateDayMess(h, scope) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(h)) return { ok: false, errors: ["The menu is empty."], warnings };

  const extra = Object.keys(h).filter((k) => !["id", "name", "days", "everyday", "timings"].includes(k));
  if (extra.length) errors.push(`Unexpected field(s): ${extra.join(", ")}.`);
  if (scope != null && h.id !== scope) {
    errors.push(`This menu is for "${h.id}", not "${scope}".`);
  }
  if (!trimmed(h.name)) errors.push("The menu has no hostel name.");

  const days = Array.isArray(h.days) ? h.days : [];
  const names = days.map((d) => d?.day);
  const missing = WEEK.filter((d) => !names.includes(d));
  if (missing.length) errors.push(`Missing: ${missing.join(", ")}.`);
  if (days.length !== WEEK.length || new Set(names).size !== names.length) {
    if (!missing.length) errors.push("Each day of the week must appear exactly once.");
  }

  const empty = [];
  for (const d of days) {
    if (!isPlainObject(d?.meals)) {
      errors.push(`${d?.day ?? "A day"} has no meals.`);
      continue;
    }
    for (const [m, v] of Object.entries(d.meals)) {
      if (!MEAL_NAMES.includes(m)) errors.push(`${d.day}: "${m}" is not one of the four meals.`);
      else if (typeof v !== "string") errors.push(`${d.day} ${m}: must be text.`);
      else if (v.length > MAX_MEAL) errors.push(`${d.day} ${m} is too long (${v.length} of ${MAX_MEAL} characters).`);
    }
    for (const m of MEAL_NAMES) if (!trimmed(d.meals[m])) empty.push(`${d.day.slice(0, 3)} ${m}`);
  }
  if (empty.length) {
    warnings.push(`${empty.length} meal${empty.length === 1 ? " is" : "s are"} empty and will show as "—": ${empty.join(", ")}.`);
  }

  for (const [field, max, what] of [["everyday", MAX_MEAL, "Every day"], ["timings", MAX_TIMING, "Timings"]]) {
    const obj = h[field] ?? {};
    if (!isPlainObject(obj)) {
      errors.push(`${what} must be listed against the four meals.`);
      continue;
    }
    for (const [m, v] of Object.entries(obj)) {
      if (!MEAL_NAMES.includes(m)) errors.push(`${what}: "${m}" is not one of the four meals.`);
      else if (typeof v !== "string") errors.push(`${what} ${m}: must be text.`);
      else if (v.length > max) errors.push(`${what} ${m} is too long (${v.length} of ${max} characters).`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Every message the dashboard shows a POR. Held here, not written inline,
 * because the help screen quotes them word for word ("if you see …, do …"),
 * and a guide quoting a message the screen no longer says is worse than none.
 */
export const MSG = {
  comingSoon: "Coming soon. Until then, send updates to the app's maintainer as before.",
  bundled: "Students see the copy built into the app",
  live: "Live · published",
  nothingGranted: "This account hasn't been given anything to look after yet.",
  loadFailed: "Couldn't load what is published. Check your internet and reload.",
  published: "Published. Students see it the next time they open IIMPresent.",
  restored: "Restored. Students see it the next time they open IIMPresent.",
  cantPublish: "Can't publish yet",
  noChanges: "No changes to publish",
  publish: "Publish to students",
  offline: "Couldn't reach IIMPresent. Check your internet and press Publish again. Nothing has changed for students.",
  notAllowed: "This account isn't allowed to publish this. Sign out, sign back in with your POR role account, and try again.",
  rejected: "IIMPresent refused this version:",
  publishFailed: "Couldn't publish. Nothing has changed for students.",
  conflict: "was published while you were editing",
};

/**
 * What a failed publish means, in words a POR can act on.
 *
 * PostgREST hands back the Postgres error: 42501 when the row-level policy
 * refuses the account, P0001 when check_day_mess() refuses the payload — and
 * that one's message was written to be read, so it is passed through.
 */
export function publishErrorMessage(err) {
  const m = String(err?.message ?? "");
  if (err?.code === "42501" || /row-level security|permission denied/i.test(m)) return MSG.notAllowed;
  if (err?.code === "P0001" && m) return `${MSG.rejected} ${m}`;
  if (/failed to fetch|networkerror|network request failed|load failed|timed? ?out/i.test(m)) return MSG.offline;
  return MSG.publishFailed;
}

/**
 * Whether an error means supabase/por-dashboard.sql hasn't been run: the
 * table or function the dashboard asks for doesn't exist. PostgREST says so
 * as PGRST205 (no such table) or PGRST202 (no such function), Postgres itself
 * as 42P01 or 42883. Only the admin can meet this — before the file is run,
 * no account is a POR, so nobody else reaches the dashboard.
 */
export const notSetUp = (err) =>
  ["PGRST202", "PGRST205", "42P01", "42883"].includes(err?.code) ||
  /schema cache|does not exist/i.test(String(err?.message ?? ""));

export const NOT_SET_UP =
  "The POR dashboard isn't switched on yet: run supabase/por-dashboard.sql in the Supabase " +
  "SQL Editor. Students aren't affected; they see the menus built into the app.";

/** What a failed load says on screen: the setup message, or the given one. */
export const loadErrorMessage = (err, fallback) => (notSetUp(err) ? NOT_SET_UP : fallback);

/** The validator for each kind the app reads from the database. */
export const VALIDATORS = {
  "day-mess": validateDayMess,
};
