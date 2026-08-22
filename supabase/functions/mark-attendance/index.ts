// ============================================================
// POST /functions/v1/mark-attendance
// Body: { token: "<signed>", status: "present" | "absent" | "cancelled" }
//
// Lets a notification action button write attendance without the app being
// opened. A service worker has no Supabase session — it can't, safely — so
// instead each alert carries a token that names exactly one session for one
// student and expires a few hours later. Possession of the token is the
// authorisation, and the only way to hold it is to have received that push.
//
//   supabase secrets set ATTENDANCE_TOKEN_SECRET=$(openssl rand -hex 32)
//   supabase functions deploy mark-attendance --no-verify-jwt
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SECRET = Deno.env.get("ATTENDANCE_TOKEN_SECRET")!;

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const encoder = new TextEncoder();

function b64urlDecode(s: string): Uint8Array {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = pad + "=".repeat((4 - (pad.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function hmacKey() {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

interface Claim {
  u: string;   // user id
  c: string;   // class id
  s: string;   // subject
  t: string;   // start time, HH:MM
  d: string;   // class date
  exp: number; // seconds since epoch
}

async function verify(token: string): Promise<Claim | null> {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig) return null;

  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(),
    b64urlDecode(sig),
    encoder.encode(body),
  );
  if (!ok) return null;

  let claim: Claim;
  try {
    claim = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    return null;
  }

  if (!claim.u || !claim.c || !claim.d || !claim.s) return null;
  if (typeof claim.exp !== "number" || claim.exp * 1000 < Date.now()) return null;

  return claim;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    if (!SECRET) {
      console.error("ATTENDANCE_TOKEN_SECRET is not set");
      return json({ error: "Server not configured." }, 500);
    }

    const { token, status } = await req.json();

    if (!["present", "absent", "cancelled"].includes(status)) {
      return json({ error: "Unknown status." }, 400);
    }

    const claim = await verify(token);
    if (!claim) {
      // Covers a forged token, a tampered one, and one that has simply aged
      // out — none of which the student can act on, so they read the same.
      return json({ error: "That alert has expired. Open RollCall to mark it." }, 401);
    }

    console.log("mark request", {
      user: claim.u, subject: claim.s, date: claim.d, slot: claim.t, status,
    });

    const { error } = await admin.from("attendance").upsert(
      {
        user_id: claim.u,
        class_id: claim.c,
        subject: claim.s,
        start_time: claim.t,
        class_date: claim.d,
        status,
      },
      { onConflict: "user_id,subject,class_date,start_time" },
    );

    if (error) {
      console.error("upsert failed", error);
      return json({ error: "Couldn't save that." }, 500);
    }

    // Read back rather than trusting the write: this is what the student's
    // record now actually says.
    const { data: saved } = await admin
      .from("attendance")
      .select("status, class_date, start_time")
      .eq("user_id", claim.u)
      .eq("subject", claim.s)
      .eq("class_date", claim.d)
      .eq("start_time", claim.t)
      .maybeSingle();

    return json({
      ok: true,
      subject: claim.s,
      requested: status,
      status: saved?.status ?? status,
      classDate: saved?.class_date ?? claim.d,
      startTime: String(saved?.start_time ?? claim.t).slice(0, 5),
    });
  } catch (err) {
    console.error(err);
    return json({ error: "Something broke." }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}