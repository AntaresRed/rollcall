import { Component, lazy, useEffect, useState } from "react";

/**
 * How long the quiet placeholder stands in before it says something. Every
 * screen's code is under 25 kB gzipped, so on working wifi it arrives in well
 * under a second; six seconds of shimmer means the connection has stalled,
 * and a stalled fetch can sit for minutes before the browser gives up on it.
 */
const SLOW_MS = 6000;

/** A screen whose code didn't arrive, as opposed to one that crashed. */
class ScreenLoadError extends Error {}

/** Screens whose last fetch failed, each with a way to start over. */
const failed = new Set();

/**
 * Gives every failed screen a fresh start, so its next render fetches again.
 * Only ever on purpose — coming back to the page. Not on the failure itself:
 * React renders once more straight after an error, and a fresh start there
 * would refetch in a loop for as long as the file is missing.
 */
function retryFailed() {
  for (const reset of [...failed]) reset();
}

/**
 * A screen split out of the first download, fetched on first use.
 *
 * Once fetched, lazy() is handed a thenable that answers at once. A plain
 * promise answers a tick later, and React would show the placeholder for a
 * frame on a screen that is already here.
 *
 * lazy() remembers a failure for good, so starting over means a fresh lazy():
 * without that, one drop of wifi breaks the screen until the app is reloaded.
 */
export function screen(load) {
  let mod = null;
  let pending = null;
  const make = () => lazy(() => (mod ? { then: (done) => done(mod) } : fetchIt()));
  let Current = make();
  const reset = () => {
    failed.delete(reset);
    Current = make();
  };
  const fetchIt = () => (pending ??= load().then(
    (m) => (mod = m),
    (err) => {
      pending = null;
      failed.add(reset);
      throw new ScreenLoadError("This screen's code didn't load", { cause: err });
    },
  ));
  const Screen = (props) => <Current {...props} />;
  // Fetched ahead of a tap. A failure here is forgotten; the tap tries again.
  Screen.preload = () => fetchIt().catch(() => {});
  return Screen;
}

/**
 * Stands in while a screen's code arrives: quiet at first, since it is
 * usually gone in a few frames, then honest about a connection that has
 * stalled rather than leaving a blank page. A stalled fetch can't be
 * restarted from here, so the way out is a reload.
 */
export function ScreenLoading() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(id);
  }, []);

  if (!slow) return <div className="screen-loading" aria-hidden="true" />;
  return (
    <div className="empty screen-stalled" role="status">
      <p>Still loading. The connection may have dropped.</p>
      <button className="btn ghost" onClick={() => location.reload()}>Reload</button>
    </div>
  );
}

/**
 * Catches a screen whose code failed to download, so it says so in place of
 * the screen and the tabs stay usable, instead of the whole app turning into
 * the crash page. Anything else is a real crash and goes on up to the app's
 * own boundary, stack and all.
 *
 * The way out is a reload, offered straight away. There used to be a "Try
 * again" first that fetched in place, but Chrome remembers a failed import
 * for the life of the page and answers every retry with the same failure
 * without asking the server (tested 2026-11-04: three tries, one request),
 * so it never worked and only put a dead tap before the one that does. A
 * reload also covers the other cause, a new deploy that took the old build's
 * files off the server.
 *
 * App.jsx keys it by screen, so a new one means the student came back to a
 * page: that is a fresh attempt, not a replay of the last failure, in the
 * browsers that do refetch.
 */
export class ScreenBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    retryFailed();
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (!(error instanceof ScreenLoadError)) throw error;

    return (
      <div className="empty screen-stalled" role="alert">
        <p>This page didn't load. Check your connection, then reload.</p>
        <button className="btn ghost" onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}
