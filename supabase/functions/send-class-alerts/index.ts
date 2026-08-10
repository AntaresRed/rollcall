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

/** Is this class running on this date, given pre/post-mid-term split? */
function inSession(phase: string, date: string, term: { midterm_start: string; midterm_end: string; term_start: string; term_end: string } | null): boolean {
  if (!term) return true;
  if (date < term.term_start || date > term.term_end) return false;
  if (phase === "pre_mid") return date < term.midterm_start;
  if (phase === "post_mid") return date > term.midterm_end;
  // 'full' courses pause during the exam week
  return !(date >= term.midterm_start && date <= term.midterm_end);
}

Deno.serve(async () => {
  const started = Date.now();

  const [{ data: subs }, { data: terms }] = await Promise.all([
    admin.from("push_subscriptions").select("*"),
    admin.from("terms").select("*").eq("is_current", true).limit(1),
  ]);

  if (!subs?.length) return new Response(JSON.stringify({ sent: 0, note: "no subscribers" }));
  const term = terms?.[0] ?? null;

  // Group subscriptions by user so one student with two devices gets one lookup.
  const byUser = new Map<string, typeof subs>();
  for (const s of subs) {
    const list = byUser.get(s.user_id) ?? [];
    list.push(s);
    byUser.set(s.user_id, list);
  }

  const userIds = [...byUser.keys()];

  const [{ data: profiles }, { data: classes }] = await Promise.all([
    admin.from("profiles").select("id, lead_mins, timezone").in("id", userIds),
    admin.from("classes").select("*").in("user_id", userIds).eq("confirmed", true),
  ]);

  const leadOf = new Map(profiles?.map((p) => [p.id, p.lead_mins ?? 10]) ?? []);
  const tzOf = new Map(profiles?.map((p) => [p.id, p.timezone ?? "Asia/Kolkata"]) ?? []);

  // Cache clock maths per timezone.
  const clocks = new Map<string, LocalNow>();
  const clockFor = (tz: string) => {
    if (!clocks.has(tz)) clocks.set(tz, localNow(tz));
    return clocks.get(tz)!;
  };

  type Due = { cls: Record<string, string>; date: string };
  const due: Due[] = [];

  for (const cls of classes ?? []) {
    const tz = tzOf.get(cls.user_id) ?? "Asia/Kolkata";
    const now = clockFor(tz);
    if (cls.day_of_week !== now.weekday) continue;

    const lead = leadOf.get(cls.user_id) ?? 10;
    const start = toMinutes(cls.start_time);
    const opens = start - lead;

    // Fire once the window opens; the sweep interval is the tolerance.
    if (now.minutes < opens || now.minutes > opens + SWEEP_MINUTES) continue;
    if (!inSession(cls.term_phase, now.date, term)) continue;

    due.push({ cls, date: now.date });
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

  let sent = 0;
  const dead: string[] = [];

  await Promise.all(claimed.flatMap((d) => {
    const devices = byUser.get(d.cls.user_id) ?? [];
    const lead = leadOf.get(d.cls.user_id) ?? 10;
    const payload = JSON.stringify({
      title: `${d.cls.subject}`,
      body: `Starts in ${lead} min · ${pretty(d.cls.start_time)}${d.cls.room ? ` · ${d.cls.room}` : ""}`,
      classId: d.cls.id,
      classDate: d.date,
    });

    return devices.map(async (device) => {
      try {
        await webpush.sendNotification(
          { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
          payload,
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
