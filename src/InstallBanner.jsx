import { useEffect, useState } from "react";
import {
  installRoute, installDismissed, dismissInstall, browserHint,
} from "./lib/install";

/**
 * "Install as app", in the same shape as the alerts banner above it.
 *
 * The button does different things on different phones because the platforms
 * genuinely differ, and pretending otherwise would mean a button that does
 * nothing on half the batch. On Chromium it opens the operating system's own
 * install sheet. On an iPhone there is no such sheet to open, so it opens the
 * instructions instead — worth doing rather than hiding the banner, since
 * that is exactly where alerts quietly fail.
 *
 * It disappears for good once the app is installed, and for a month if
 * somebody says not now. A banner that cannot be got rid of is an advert.
 */
export default function InstallBanner({ compact = false }) {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [gone, setGone] = useState(() => installDismissed());
  const [how, setHow] = useState(false);

  useEffect(() => {
    // Chromium fires this when it decides the app qualifies — which may be on
    // arrival, may be after a while, may be never. Holding onto it is what
    // makes the install sheet reachable from our own button later.
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const route = installRoute({ deferred, installed });
  if (!route || gone) return null;

  const install = async () => {
    if (route !== "prompt") {
      setHow((v) => !v);
      return;
    }
    try {
      await deferred.prompt();
      // The event is single-use whichever way they answer; a dismissal is not
      // a refusal to ever install, so the banner stays until Chrome hands us
      // another one or the app actually gets installed.
      await deferred.userChoice;
    } catch {
      /* the sheet was already consumed, or the browser refused it */
    }
    setDeferred(null);
  };

  const shut = () => {
    dismissInstall();
    setGone(true);
  };

  return (
    <div className={`banner install-banner${compact ? " compact" : ""}`}>
      <p>
        {route === "ios"
          ? "Add IIMPresent to your Home Screen — on iPhone, class alerts only work once you have."
          : "Install IIMPresent as an app for a home screen icon and alerts that arrive on time."}
      </p>

      <div className="banner-acts">
        <button className="btn" onClick={install}>
          {route === "prompt" ? "Install as app" : "How?"}
        </button>
        <button className="banner-x" aria-label="Not now" onClick={shut}>×</button>
      </div>

      {how && route === "ios" && (
        <p className="banner-how">
          Tap <strong>Share</strong> at the bottom of Safari, scroll down to
          <strong> Add to Home Screen</strong>, then open IIMPresent from the
          icon it makes. Alerts will work from there.
        </p>
      )}
      {how && route === "manual" && (
        <p className="banner-how">
          Open {browserHint()}. If it isn't offered yet, use the app for a
          minute and look again — the browser decides when to allow it.
        </p>
      )}
    </div>
  );
}
