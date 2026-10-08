// ============================================================
// POST /functions/v1/send-broadcasts   (called by a pg_cron job you schedule)
//
// Sends every row of public.broadcasts that is due, unclaimed and not yet
// expired, to everyone, one cohort, or one user, as the row says.
//
// Takes no input, by design: see supabase/broadcasts.sql. Deploy with
//   supabase functions deploy send-broadcasts --no-verify-jwt
// It reuses the VAPID secrets already set for send-class-alerts.
// ============================================================

// Same pins as send-class-alerts, for the same reason: a floating range is
// re-resolved on every cold boot and can fail before any handler exists.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.2";
import webpush from "npm:web-push@3.6.7";

const BUILD = "2026-10-08b";

// Sends in flight at once. A cohort is a few hundred devices; this keeps the
// push services from seeing one burst of all of them.
const CHUNK = 100;

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface Broadcast {
  id: number;
  title: string;
  body: string;
  all_users: boolean;
  cohort_year: number | null;
  only_user: string | null;
  send_at: string;
  expires_at: string;
}

interface Sub { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

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

async function audience(b: Broadcast): Promise<Sub[]> {
  // Fetched wholesale and filtered here: a few hundred ids in an `in(...)`
  // filter overflows the request URL.
  const subs = await fetchAll<Sub>((from, to) =>
    admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").range(from, to));
  if (b.all_users) return subs;

  let users: Set<string>;
  if (b.only_user) {
    users = new Set([b.only_user]);
  } else {
    const profiles = await fetchAll<{ id: string }>((from, to) =>
      admin.from("profiles").select("id").eq("cohort_year", b.cohort_year!).range(from, to));
    users = new Set(profiles.map((p) => p.id));
  }
  return subs.filter((s) => users.has(s.user_id));
}

async function deliver(b: Broadcast) {
  const now = Date.now();
  const expires = Date.parse(b.expires_at);

  // Claim first. A row comes back only if this run took it, so two runs that
  // overlap cannot both send.
  const { data: claim, error: claimErr } = await admin.from("broadcasts")
    .update({ claimed_at: new Date().toISOString() })
    .eq("id", b.id).is("claimed_at", null)
    .select("id");
  if (claimErr) throw claimErr;
  if (!claim?.length) return { id: b.id, skipped: "claimed elsewhere" };

  if (now >= expires) {
    await admin.from("broadcasts")
      .update({ finished_at: new Date().toISOString(), sent: 0, note: "expired before sending" })
      .eq("id", b.id);
    return { id: b.id, skipped: "expired" };
  }

  let sent = 0;
  let failed = 0;
  const dead: string[] = [];
  try {
    const devices = await audience(b);

    // The service worker shows this exactly like a class alert, "Mark present"
    // button included, and that is accepted. The button is harmless only
    // because this payload carries no classId and no markToken: with neither,
    // a press writes nothing and just opens the app. Never add them here.
    //
    // No expiresAt either. The worker replaces a late push carrying one with
    // "A class alert arrived too late to be useful", which would be wrong
    // here. The TTL below does that job at the push service instead.
    const payload = JSON.stringify({
      kind: "broadcast",
      broadcastId: b.id,
      title: b.title,
      body: b.body,
    });
    const ttl = Math.max(60, Math.floor((expires - now) / 1000));

    for (let i = 0; i < devices.length; i += CHUNK) {
      await Promise.all(devices.slice(i, i + CHUNK).map(async (device) => {
        try {
          await webpush.sendNotification(
            { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
            payload,
            // High, so a dozing Android phone shows it at the time it was
            // meant for rather than whenever it next wakes. No `topic`: Apple
            // rejects ours (see send-class-alerts).
            { TTL: ttl, urgency: "high" },
          );
          sent++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // 404/410: the browser discarded the subscription for good.
          if (status === 404 || status === 410) dead.push(device.id);
          else { failed++; console.error("push failed", b.id, status, err); }
        }
      }));
    }

    if (dead.length) await admin.from("push_subscriptions").delete().in("id", dead);

    // Reached nobody but might on a later run: hand the claim back so the next
    // cron tick retries, still bounded by expires_at.
    if (sent === 0 && failed > 0) {
      await admin.from("broadcasts").update({ claimed_at: null, failed }).eq("id", b.id);
      return { id: b.id, devices: devices.length, sent, failed, retrying: true };
    }

    await admin.from("broadcasts").update({
      finished_at: new Date().toISOString(),
      devices: devices.length, sent, pruned: dead.length, failed,
    }).eq("id", b.id);
    return { id: b.id, devices: devices.length, sent, pruned: dead.length, failed };
  } catch (err) {
    // Thrown before anything went out (a failed read, most likely): release
    // the claim so the next tick tries again. After a send has landed, keep
    // it — a second copy is worse than a few missed devices.
    if (sent === 0) await admin.from("broadcasts").update({ claimed_at: null }).eq("id", b.id);
    throw err;
  }
}

Deno.serve(async () => {
  const started = Date.now();
  try {
    const due = await fetchAll<Broadcast>((from, to) =>
      admin.from("broadcasts").select("*")
        .is("claimed_at", null)
        .lte("send_at", new Date().toISOString())
        .order("send_at")
        .range(from, to));

    const results = [];
    for (const b of due) results.push(await deliver(b));

    return new Response(JSON.stringify({ results, ms: Date.now() - started, build: BUILD }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("broadcast run failed", err);
    return new Response(JSON.stringify({
      error: "broadcast run failed",
      message: String((err as { message?: string })?.message ?? err),
      ms: Date.now() - started,
      build: BUILD,
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
