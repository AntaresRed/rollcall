import { Component } from "react";

/**
 * Catches render-time crashes so a bug in one screen doesn't blank the app.
 *
 * React unmounts the entire tree when a render throws, which is why a single
 * mistake shows up as a white page with nothing to go on. This shows the
 * error and offers a way out.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("IIMPresent crashed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="crash">
        <h1>Something went wrong</h1>
        <p>
          IIMPresent hit an error and stopped. Your timetable and attendance are
          safe — they're stored on the server, not in the app.
        </p>
        <pre>{String(this.state.error?.stack || this.state.error)}</pre>
        <div className="crash-actions">
          <button className="btn" onClick={() => location.reload()}>
            Reload
          </button>
          <button
            className="btn ghost"
            onClick={async () => {
              // A stale service worker serving an old bundle is the usual
              // cause of a crash that survives a plain reload.
              if ("serviceWorker" in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
              }
              if ("caches" in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
              }
              location.reload();
            }}
          >
            Clear cache and reload
          </button>
        </div>
      </div>
    );
  }
}
