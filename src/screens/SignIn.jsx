import { useState } from "react";
import { signInWithGoogle, EXPECTED_DOMAIN } from "../lib/supabase";
import { Mark } from "./Splash";

/**
 * Sign-in gate.
 *
 * The domain restriction is enforced in the database, so this screen's job is
 * only to set the expectation before someone picks the wrong Google account
 * and gets bounced with a message they don't understand.
 */
export default function SignIn({ error, onRetry }) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(null);

  const go = async () => {
    setBusy(true);
    setFailure(null);
    try {
      await signInWithGoogle();
      // The browser navigates away to Google; nothing after this runs.
    } catch (err) {
      setFailure(err.message || "Couldn't reach Google. Try again.");
      setBusy(false);
    }
  };

  return (
    <div className="signin">
      <div className="signin-mark">
        <Mark size={64} animated />
      </div>

      <h1>
        IIM<i>Present</i>
      </h1>
      <p className="signin-motto">No JST for classes.</p>
      <p className="signin-sub">
        A nudge once each class is under way, and your attendance kept above
        the line.
      </p>

      {error?.kind === "domain" && (
        <div className="notice" style={{ textAlign: "left" }}>
          {error.message} IIMPresent is open to <strong>@{EXPECTED_DOMAIN}</strong>{" "}
          accounts only. Pick your institute account and try again.
        </div>
      )}

      {error?.kind === "other" && (
        <div className="notice" style={{ textAlign: "left" }}>
          {error.message}
        </div>
      )}

      {failure && <div className="notice" style={{ textAlign: "left" }}>{failure}</div>}

      <button className="btn google" onClick={go} disabled={busy}>
        <GoogleG />
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>

      <p className="signin-note">
        Use your <strong>@{EXPECTED_DOMAIN}</strong> address. Personal Gmail
        accounts won't be able to sign in.
      </p>

      {onRetry && (
        <button className="linklike signin-retry" onClick={onRetry}>
          Something went wrong — try again
        </button>
      )}

      <p className="made-by">Made by Anuj Kapse</p>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-2.7-.4-4H24v7.3h12.1c-.2 2-1.6 5-4.5 7l-.1.3 6.5 5 .5.1c4.1-3.8 6.6-9.4 6.6-15.7z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-6.9-5.4c-1.9 1.3-4.4 2.2-7.6 2.2-5.8 0-10.7-3.8-12.500-9.1l-.3.1-6.7 5.2-.1.3C8 41.1 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.5 28.4c-.5-1.4-.8-2.9-.8-4.4 0-1.5.3-3 .7-4.4v-.3l-6.8-5.3-.2.1A22 22 0 0 0 2 24c0 3.5.9 6.9 2.4 9.9l7.1-5.5z" />
      <path fill="#EA4335" d="M24 9.5c4.1 0 6.9 1.8 8.5 3.3l6.2-6C34.9 3.4 29.9 1 24 1 15.4 1 8 6 4.4 14.1l7.1 5.5C13.3 14.3 18.2 9.5 24 9.5z" />
    </svg>
  );
}
