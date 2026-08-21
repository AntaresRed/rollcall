import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Vite bakes these in at build time. If they're absent the client constructor
// throws while the module is still evaluating — before React mounts, before
// any error boundary exists — and the page stays blank with nothing in the
// console to explain it. Name the problem instead.
if (!URL || !ANON) {
  throw new Error(
    "RollCall is missing its Supabase settings. Set VITE_SUPABASE_URL and " +
    "VITE_SUPABASE_ANON_KEY in the Vercel project, then redeploy — Vite reads " +
    "them at build time, so editing them alone isn't enough."
  );
}

export const supabase = createClient(URL, ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});

/** The institute domain, mirrored from the database allowlist. */
export const EXPECTED_DOMAIN = "email.iimcal.ac.in";

export function emailDomain(email) {
  return String(email ?? "").toLowerCase().split("@")[1] ?? "";
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    // A refresh token that's been revoked or has aged out can't be recovered.
    // Clearing it sends the student back to the sign-in screen, where one tap
    // restores everything — their data lives on the server, keyed to their
    // Google account, not in this browser.
    console.warn("session could not be restored:", error.message);
    await supabase.auth.signOut().catch(() => {});
    return null;
  }
  return data.session ?? null;
}

/**
 * Send the student to Google.
 *
 * `hd` asks Google to show only accounts on the institute domain — a
 * convenience, not a control, since it can be stripped from the URL. The
 * actual restriction is the trigger on auth.users, which refuses to create an
 * account for any other domain.
 */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        hd: EXPECTED_DOMAIN,
        prompt: "select_account",
      },
    },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}

/**
 * OAuth failures come back on the URL rather than as a thrown error, so the
 * app has to look for them itself. A rejected domain arrives here as the
 * message raised by the database trigger.
 */
export function readAuthError() {
  const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const fromQuery = new URLSearchParams(window.location.search);
  const raw =
    fromHash.get("error_description") ||
    fromQuery.get("error_description") ||
    fromHash.get("error") ||
    fromQuery.get("error");
  if (!raw) return null;

  window.history.replaceState({}, "", window.location.pathname);

  const text = decodeURIComponent(raw).replace(/\+/g, " ");
  if (/not eligible|requires an IIM|42501/i.test(text)) {
    return {
      kind: "domain",
      message: "That account isn't an IIM Calcutta one.",
    };
  }
  return { kind: "other", message: text };
}
