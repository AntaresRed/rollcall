// ============================================================
// POST /functions/v1/send-class-alerts   (called by pg_cron every 5 min)
//
// Finds classes starting inside each student's lead window, sends one web
// push per class per day, and records it so repeats never happen.
//
// Secrets required:
//   supabase secrets set VAPID_PUBLIC_KEY=...
//   supabase secrets set VAPID_PRIVATE_KEY=...
//   supabase secrets set VAPID_SUBJECT=mailto:you@example.com
// Generate the pair once with:  npx web-push generate-vapid-keys
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SWEEP_MINUTES = 5; // must match the cron interval

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const TOKEN_SECRET = Deno.env.get("ATTENDANCE_TOKEN_SECRET") ?? "";
const FUNCTIONS_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

const encoder = new TextEncoder();

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * A token naming exactly one session for one student.
 *
 * The action buttons on a notification need to write attendance without the
 * app being open, and a service worker cannot safely hold a Supabase session.
 * So the push carries this instead: it authorises one upsert, for one class,
 * on one date, and stops working a few hours later.
 */
async function mintToken(userId: string, cls: Record<string, string>, date: string) {
  if (!TOKEN_SECRET) return null;

  const claim = {
    u: userId,
    c: String(cls.id),
    s: cls.subject,
    t: String(cls.start_time).slice(0, 5),
    d: date,
    // Long enough to mark a class after it ends, short enough that a stale
    // notification in a shade can't be used days later.
    exp: Math.floor(Date.now() / 1000) + 6 * 60 * 60,
  };

  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(TOKEN_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const body = b64url(encoder.encode(JSON.stringify(claim)));
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `${body}.${b64url(sig)}`;
}

interface LocalNow {
  date: string;     // YYYY-MM-DD in the student's zone
  weekday: number;  // 1 = Mon
  minutes: number;  // minutes since local midnight
}

/** Current wall-clock time in an IANA timezone, without pulling in a date library. */
function localNow(timeZone: string): LocalNow {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdayMap[parts.weekday as string] ?? 1,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

const pretty = (t: string) => {
  const h = Number(t.slice(0, 2));
  const m = t.slice(3, 5);
  return `${((h + 11) % 12) + 1}:${m} ${h < 12 ? "am" : "pm"}`;
};

/** Don't let one student's bad data abort the whole sweep. */
const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
  try { return await fn(); } catch (err) { console.error(label, err); return null; }
};

interface Term {
  term_start: string;
  pre_mid_end: string;
  post_mid_start: string;
  term_end: string;
  breaks: { from_date: string; to_date: string }[];
}

/** Is a course of this phase actually meeting on this date? */
function inSession(phase: string, date: string, term: Term | null): boolean {
  if (!term) return true;
  if (date < term.term_start || date > term.term_end) return false;
  // Exam weeks, placement season, Puja vacation: nobody has class.
  if (term.breaks.some((b) => date >= b.from_date && date <= b.to_date)) return false;

  const inPre = date <= term.pre_mid_end;
  const inPost = date >= term.post_mid_start;
  if (phase === "pre_mid") return inPre;
  if (phase === "post_mid") return inPost;
  return inPre || inPost;
}

Deno.serve(async () => {
  const started = Date.now();

  /** PostgREST caps an unbounded select at 1000 rows, silently. Page through. */
  async function fetchAll<T>(
    build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  ): Promise<T[]> {
    const PAGE = 1000;
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await build(from, from + PAGE - 1);
      if (error) throw error;
      if (!data?.length) break;
      out.push(...data);
      if (data.length < PAGE) break;
    }
    return out;
  }

  const [subs, { data: terms }] = await Promise.all([
    fetchAll<Record<string, string>>((from, to) =>
      admin.from("push_subscriptions").select("*").range(from, to)),
    admin.from("terms").select("*, term_breaks(*)").eq("is_current", true).limit(1),
  ]);

  if (!subs.length) {
    return new Response(JSON.stringify({ sent: 0, note: "no subscribers" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
  const raw = terms?.[0] ?? null;
  const term: Term | null = raw
    ? { ...raw, breaks: raw.term_breaks ?? [] }
    : null;

  // Group subscriptions by user so one student with two devices gets one lookup.
  const byUser = new Map<string, typeof subs>();
  for (const s of subs) {
    const list = byUser.get(s.user_id) ?? [];
    list.push(s);
    byUser.set(s.user_id, list);
  }

  const userIds = [...byUser.keys()];

  // A 1000-element `in(...)` filter overflows the request URL, so both of
  // these are fetched wholesale and filtered in memory. At campus scale the
  // tables are small; revisit if this ever serves more than one institute.
  const subscribed = new Set(userIds);

  const [profiles, allClasses] = await Promise.all([
    fetchAll<{ id: string; lead_mins: number; timezone: string }>((from, to) =>
      admin.from("profiles").select("id, lead_mins, timezone").range(from, to)),
    fetchAll<Record<string, string>>((from, to) =>
      admin.from("classes").select("*")
        .eq("confirmed", true)
        .eq("muted", false)          // per-course mute
        .range(from, to)),
  ]);

  const classes = allClasses.filter((c) => subscribed.has(c.user_id));

  // Rescheduled and cancelled occurrences. A moved class must not alert on the
  // date it was originally due, and must alert on the date it actually runs.
  const overrides = (await fetchAll<Record<string, string | null>>((from, to) =>
    admin.from("session_overrides").select("*").range(from, to)))
    .filter((o) => subscribed.has(String(o.user_id)));

  const movedFrom = new Set(
    overrides.map((o) => `${o.class_id}|${String(o.original_date).slice(0, 10)}`),
  );
  const classById = new Map(classes.map((c) => [String(c.id), c]));

  const leadOf = new Map(profiles.map((p) => [p.id, p.lead_mins ?? 10]));
  const tzOf = new Map(profiles.map((p) => [p.id, p.timezone ?? "Asia/Kolkata"]));

  // Cache clock maths per timezone.
  const clocks = new Map<string, LocalNow>();
  const clockFor = (tz: string) => {
    if (!clocks.has(tz)) clocks.set(tz, localNow(tz));
    return clocks.get(tz)!;
  };

  type Due = { cls: Record<string, string>; date: string };
  const due: Due[] = [];

  for (const cls of classes) {
    const tz = tzOf.get(cls.user_id) ?? "Asia/Kolkata";
    const now = clockFor(tz);

    // A fixed-date session runs once, on its own date; a weekly one repeats.
    if (cls.session_date) {
      if (String(cls.session_date).slice(0, 10) !== now.date) continue;
    } else if (cls.day_of_week !== now.weekday) {
      continue;
    }

    const lead = leadOf.get(cls.user_id) ?? 10;
    const start = toMinutes(cls.start_time);
    // Clamped so an early-morning class with a long lead can't open "yesterday".
    const opens = Math.max(0, start - lead);

    // Fire anywhere between the window opening and the class starting, not on
    // one exact tick. A single skipped sweep — a cold start, a pg_cron hiccup,
    // a slow function — used to mean the alert was lost for good. Now the next
    // sweep still catches it, and the atomic alert_log claim below guarantees
    // it's still delivered exactly once.
    if (now.minutes < opens || now.minutes > start) continue;
    // Published dates already avoid exam weeks and vacations, so a dated
    // session is authoritative and skips the phase window entirely.
    if (!cls.session_date && !inSession(cls.term_phase, now.date, term)) continue;

    if (movedFrom.has(`${cls.id}|${now.date}`)) continue;  // moved away

    due.push({ cls, date: now.date });
  }

  // Sessions moved *into* today. Their date and slot come from the override,
  // not from the class row's weekly pattern.
  for (const o of overrides) {
    if (!o.new_date) continue;
    const userId = String(o.user_id);
    const now = clockFor(tzOf.get(userId) ?? "Asia/Kolkata");
    if (String(o.new_date).slice(0, 10) !== now.date) continue;

    const base = classById.get(String(o.class_id));
    if (!base || base.muted) continue;

    const startTime = o.new_start
      ? String(o.new_start).slice(0, 5)
      : String(base.start_time).slice(0, 5);
    const endTime = o.new_end
      ? String(o.new_end).slice(0, 5)
      : String(base.end_time).slice(0, 5);

    const lead = leadOf.get(userId) ?? 10;
    const start = toMinutes(startTime);
    const opens = Math.max(0, start - lead);
    if (now.minutes < opens || now.minutes > start) continue;

    due.push({
      cls: { ...base, start_time: startTime, end_time: endTime, _moved: true },
      date: now.date,
    });
  }

  if (!due.length) {
    return new Response(JSON.stringify({ sent: 0, ms: Date.now() - started }));
  }

  // Claim each (class, date) atomically — the insert fails if another sweep
  // already sent it, which is our dedupe.
  const claimed: Due[] = [];
  for (const d of due) {
    const { error } = await admin
      .from("alert_log")
      .insert({ class_id: d.cls.id, class_date: d.date });
    if (!error) claimed.push(d);
  }

  // Minted up front so the send loop stays synchronous per device.
  const tokens = new Map<string, string>();
  for (const d of claimed) {
    const t = await mintToken(String(d.cls.user_id), d.cls, d.date);
    if (t) tokens.set(`${d.cls.id}|${d.date}`, t);
  }

  let sent = 0;
  const dead: string[] = [];

  await Promise.all(claimed.flatMap((d) => {
    const devices = byUser.get(d.cls.user_id) ?? [];
    const lead = leadOf.get(d.cls.user_id) ?? 10;
    const token = tokens.get(`${d.cls.id}|${d.date}`) ?? null;
    const payload = JSON.stringify({
      title: `${d.cls.subject}`,
      body: `Starts in ${lead} min · ${pretty(d.cls.start_time)}${d.cls.room ? ` · ${d.cls.room}` : ""}`
        + (d.cls._moved ? " · rescheduled" : ""),
      // Shown on platforms that can't render action buttons (iOS, Firefox),
      // where tapping through to the app is the only route.
      hint: "Tap to mark attendance",
      classId: d.cls.id,
      classDate: d.date,
      // With these the action buttons write straight to the database; without
      // them the service worker falls back to opening the app.
      markToken: token,
      markUrl: `${FUNCTIONS_BASE}/mark-attendance`,
      // The service worker drops the alert if it arrives after this. Belt and
      // braces alongside TTL, since a push service may still deliver late.
      expiresAt: Date.now() + (toMinutes(d.cls.end_time ?? d.cls.start_time) - toMinutes(d.cls.start_time) + lead) * 60_000,
      startsAt: `${d.date} ${d.cls.start_time}`,
    });

    return devices.map(async (device) => {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          payload,
          {
            // Without a TTL, web-push defaults to four weeks: a phone that is
            // offline or dozing at send time gets the alert whenever it next
            // wakes — which is how "your class starts in 10 minutes" arrives
            // at midnight. Expire it instead of delivering it stale.
            TTL: 15 * 60,
            // Normal urgency lets Android defer delivery until the device
            // leaves Doze, which is exactly the wrong behaviour for a
            // time-critical alert.
            urgency: "high",
            topic: `c${String(d.cls.id).replace(/-/g, "").slice(0, 12)}`,
          },
        );
        sent++;
        await admin.from("push_subscriptions")
          .update({ last_ok_at: new Date().toISOString() })
          .eq("id", device.id);
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 = the browser threw the subscription away.
        if (status === 404 || status === 410) dead.push(device.id);
        else console.error("push failed", status, err);
      }
    });
  }));

  if (dead.length) {
    await admin.from("push_subscriptions").delete().in("id", dead);
  }

  return new Response(JSON.stringify({
    sent, pruned: dead.length, ms: Date.now() - started,
  }), { headers: { "Content-Type": "application/json" } });
});
