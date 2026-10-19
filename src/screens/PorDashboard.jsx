import { useEffect, useMemo, useState } from "react";
import { loadAllPorAccess, loadLiveVersions } from "../lib/api";
import { KINDS, MSG, datasetTitle, datasetsFrom, loadErrorMessage } from "../lib/datasets";
import { setLiveDataset } from "../lib/live";
import DayMessEditor from "./DayMessEditor";
import PorHelp from "./PorHelp";

const fmtWhen = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }) : "";

const EDITORS = {
  "day-mess": DayMessEditor,
};

/**
 * Where a POR keeps their part of the app up to date.
 *
 * A role account — nhmessrep@, pgprep@ — sees this and nothing else: no
 * timetable, no tabs. It lists exactly the datasets that account was granted
 * in `por_access`, and the database refuses a publish to anything else, so
 * the list on screen is a convenience, not the lock.
 *
 * The admin reaches the same screen from Profile, passing no `access`, and
 * gets every grant there is — which is how a dataset gets checked or fixed
 * without borrowing a POR's account.
 *
 * The guide opens over whatever is on screen rather than replacing it, so
 * a POR halfway through a week's menu can read it without losing their
 * typing.
 *
 * The admin can also see the dashboard as any one role account sees it —
 * only that account's cards, its guide, its address in the header. A preview
 * of the screen and nothing more: the admin stays signed in as themselves,
 * publishes as themselves, and History says so. Acting as another account
 * would let whoever holds the admin flag write in a POR's name.
 *
 * `live`, `help` and `previewAs` exist for the smoke test, which has no
 * database and cannot tap.
 */
export default function PorDashboard({
  email, access: grants = null, onSignOut, onBack, admin = false,
  live: given = null, help: startOnHelp = false, previewAs = "",
}) {
  const [asWho, setAsWho] = useState(previewAs);
  const [live, setLive] = useState(given);
  const [help, setHelp] = useState(startOnHelp);
  const [access, setAccess] = useState(grants);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);

  useEffect(() => {
    if (grants) return undefined;
    let gone = false;
    loadAllPorAccess()
      .then((rows) => { if (!gone) setAccess(rows); })
      .catch((err) => {
        if (gone) return;
        // The raw error is for whoever debugs it, not for the screen.
        console.warn("could not load POR access", err);
        setError(loadErrorMessage(err, "Couldn't load who looks after what. Reload to try again."));
        setAccess([]);
      });
    return () => { gone = true; };
  }, [grants]);

  useEffect(() => {
    if (given) return undefined;
    let gone = false;
    // Version numbers and times only: the cards say when, not what.
    loadLiveVersions()
      .then((rows) => { if (!gone) setLive(rows); })
      .catch((err) => {
        if (gone) return;
        console.warn("could not load published versions", err);
        setError(loadErrorMessage(err, MSG.loadFailed));
        setLive([]);
      });
    return () => { gone = true; };
  }, [given]);

  const emails = useMemo(() => [...new Set((access ?? []).map((a) => a.email))].sort(), [access]);
  // What is on screen: everyone's grants, or one account's when previewing.
  const shown = useMemo(
    () => (asWho ? (access ?? []).filter((a) => a.email === asWho) : access),
    [access, asWho],
  );
  const shownEmail = asWho || email;
  const datasets = useMemo(() => datasetsFrom(shown), [shown]);
  const liveByKey = useMemo(
    () => new Map((live ?? []).map((r) => [`${r.kind}:${r.scope}`, r])),
    [live],
  );
  // Only worth saying on the admin's copy, where the cards are everyone's.
  const ownersByKey = useMemo(() => {
    const m = new Map();
    for (const a of shown ?? []) {
      const key = `${a.kind}:${a.scope}`;
      m.set(key, [...(m.get(key) ?? []), a.email]);
    }
    return m;
  }, [shown]);
  const everyone = new Set((shown ?? []).map((a) => a.email)).size > 1;

  const showHelp = () => {
    setHelp(true);
    window.scrollTo?.(0, 0);
  };
  const guide = help && (
    <PorHelp
      email={shownEmail}
      kinds={[...new Set(datasets.map((d) => d.kind))]}
      onBack={() => setHelp(false)}
    />
  );

  const opened = open && datasets.find((d) => d.key === open);
  const Editor = opened && EDITORS[opened.kind];
  if (Editor) {
    return (
      <>
        {guide}
        <div hidden={help}>
          <Editor
            scope={opened.scope}
            onBack={() => setOpen(null)}
            onHelp={showHelp}
            onPublished={(row) => {
              // This device shows the new version at once; everyone else gets it
              // on their next open.
              setLiveDataset(row);
              setLive((rows) => [
                ...(rows ?? []).filter((r) => !(r.kind === row.kind && r.scope === row.scope)),
                row,
              ]);
            }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      {guide}
      <div hidden={help}>
        <div className="eyebrow">POR dashboard</div>
        {admin && emails.length > 0 && (
          <label className="leave-field por-viewas">
            <span>See the dashboard as</span>
            <select value={asWho} onChange={(e) => { setAsWho(e.target.value); setOpen(null); }}>
              <option value="">Everyone (your admin view)</option>
              {emails.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          </label>
        )}
        {asWho && (
          <div className="banner warn" style={{ marginTop: 0, marginBottom: 14 }}>
            <p>
              Preview: this is exactly what <strong>{asWho}</strong> sees. You are still signed
              in as {email}; anything you publish is published as you, and History will say so.
            </p>
          </div>
        )}
        <p className="screen-note">
          Signed in as <strong>{shownEmail}</strong>. What you publish here goes live for every
          student the next time they open IIMPresent.
        </p>
        <button className="btn block" style={{ marginBottom: 16 }} onClick={showHelp}>
          How to use this dashboard
        </button>

        {error && <div className="notice" style={{ marginBottom: 14 }}>{error}</div>}

        {access === null && <div className="empty">Loading…</div>}
        {/* With an error showing, an empty list is the error's doing, not a
          sign the account has nothing — so it isn't said twice. */}
      {access !== null && datasets.length === 0 && !error && (
          <div className="empty">
            {MSG.nothingGranted}
          </div>
        )}

        <div className="por-cards">
          {datasets.map((d) => {
            const ready = Boolean(KINDS[d.kind]?.ready && EDITORS[d.kind]);
            const row = liveByKey.get(d.key);
            const owners = everyone ? ownersByKey.get(d.key) : null;
            const status = !ready
              ? MSG.comingSoon
              : live === null
                ? "Checking…"
                : row
                  ? `${MSG.live} ${fmtWhen(row.published_at)}`
                  : MSG.bundled;
            const body = (
              <>
                <span className="por-card-title">{datasetTitle(d.kind, d.scope)}</span>
                <span className="por-card-meta">{status}</span>
                {owners && <span className="por-card-meta">{owners.join(", ")}</span>}
              </>
            );
            return ready ? (
              <button className="por-card" key={d.key} onClick={() => setOpen(d.key)}>
                <span className="por-card-text">{body}</span>
                <span className="por-card-go" aria-hidden="true">›</span>
              </button>
            ) : (
              <div className="por-card off" key={d.key}>
                <span className="por-card-text">{body}</span>
              </div>
            );
          })}
        </div>

        {onSignOut && (
          <button className="btn ghost block" style={{ marginTop: 22 }} onClick={onSignOut}>
            Sign out
          </button>
        )}
        {onBack && (
          <button className="btn ghost block" style={{ marginTop: 22 }} onClick={onBack}>
            Back to profile
          </button>
        )}
      </div>
    </>
  );
}
