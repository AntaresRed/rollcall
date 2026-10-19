import { useEffect, useMemo, useState } from "react";
import { loadDatasetHistory, publishDataset } from "../lib/api";
import {
  MEAL_NAMES, WEEK, MSG, KEEP_VERSIONS, cleanDayMess, validateDayMess, datasetTitle,
  publishErrorMessage, loadErrorMessage,
} from "../lib/datasets";
import { bundledHostel } from "../lib/menu";

const KIND = "day-mess";

// Tall enough to show the whole list without a box-inside-a-box scrollbar.
// About 36 characters fit a line in the phone-width column.
const rowsFor = (text) => Math.max(2, Math.ceil(String(text ?? "").length / 36));

const fmtWhen = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }) : "—";

/**
 * One hostel's day mess menu, edited in place and published to students.
 *
 * The form opens on what students are being shown right now — the last
 * published version, or the copy built into the app if nothing has been — so
 * a mess secretary changes the two dishes that changed rather than typing out
 * a week. Publishing is live at once; the history below is the way back.
 *
 * `history` exists for the smoke test, which has no database.
 */
export default function DayMessEditor({ scope, onBack, onPublished, onHelp, history: given = null }) {
  const [versions, setVersions] = useState(given);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  // Null until the first keystroke: the form shows `base` until then, and
  // goes back to null after a publish, a restore or a discard, so it always
  // reopens on what students are actually shown.
  const [edits, setEdits] = useState(null);

  useEffect(() => {
    if (given) return undefined;
    let gone = false;
    loadDatasetHistory(KIND, scope, KEEP_VERSIONS)
      .then((rows) => { if (!gone) setVersions(rows); })
      .catch((err) => {
        if (gone) return;
        console.warn("could not load this dataset's history", err);
        setError(loadErrorMessage(err, MSG.loadFailed));
        setVersions([]);
      });
    return () => { gone = true; };
  }, [scope, given]);

  // What students see now: the newest published version, else the bundle.
  const base = useMemo(() => {
    if (!versions) return null;
    const raw = versions[0]?.payload ?? bundledHostel(scope);
    return raw ? cleanDayMess(raw) : null;
  }, [versions, scope]);

  const form = edits ?? base;

  const cleaned = useMemo(() => (form ? cleanDayMess(form) : null), [form]);
  const check = useMemo(
    () => (cleaned ? validateDayMess(cleaned, scope) : { ok: false, errors: [], warnings: [] }),
    [cleaned, scope],
  );
  const dirty = Boolean(cleaned && base) && JSON.stringify(cleaned) !== JSON.stringify(base);

  const title = datasetTitle(KIND, scope);
  const name = base?.name ?? scope.toUpperCase();

  const setMeal = (day, meal, value) => setEdits((f) => {
    const cur = f ?? base;
    return {
      ...cur,
      days: cur.days.map((d) => (d.day === day ? { ...d, meals: { ...d.meals, [meal]: value } } : d)),
    };
  });
  const setLine = (field, meal, value) => setEdits((f) => {
    const cur = f ?? base;
    return { ...cur, [field]: { ...cur[field], [meal]: value } };
  });

  const publish = async (payload, { restoredFrom = null, ask } = {}) => {
    setBusy(true);
    setError("");
    setDone("");
    try {
      // The role account is shared by the whole team, so two people can have
      // this open at once — and whoever published second would otherwise
      // wipe the first one's changes without either of them knowing.
      const [latest] = await loadDatasetHistory(KIND, scope, 1);
      if (latest && latest.id !== (versions?.[0]?.id ?? null)) {
        setVersions(await loadDatasetHistory(KIND, scope, KEEP_VERSIONS));
        const go = confirm(
          `A newer version ${MSG.conflict}: ${latest.created_by_email ?? "another account"}, ` +
          `${fmtWhen(latest.created_at)}.\n\n` +
          "OK publishes yours anyway. It replaces theirs, and theirs stays in History.\n" +
          "Cancel keeps your changes on screen so you can look at History first.",
        );
        if (!go) {
          setError(`A newer version ${MSG.conflict}. It is now at the top of History, and your changes are still on screen.`);
          return;
        }
      } else if (!confirm(ask)) {
        return;
      }
      const row = await publishDataset(KIND, scope, payload, { restoredFrom });
      // The database has just pruned the oldest if there were more than
      // KEEP_VERSIONS; the list here drops it too rather than offer a version
      // that is no longer there.
      setVersions((v) => [row, ...(v ?? [])].slice(0, KEEP_VERSIONS));
      setEdits(null);
      onPublished?.({
        kind: KIND, scope, version_id: row.id, payload: row.payload, published_at: row.created_at,
      });
      setDone(restoredFrom ? MSG.restored : MSG.published);
    } catch (err) {
      setError(publishErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    if (dirty && !confirm("Leave without publishing? Your changes will be lost.")) return;
    onBack?.();
  };

  if (!versions) {
    return (
      <>
        <div className="eyebrow">{title}</div>
        <div className="empty">Loading…</div>
      </>
    );
  }

  if (!base || !form) {
    return (
      <>
        <div className="eyebrow">{title}</div>
        <div className="notice">This hostel isn't in the app yet, so there is nothing to edit.</div>
        {onBack && <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>Back</button>}
      </>
    );
  }

  const live = versions[0] ?? null;

  return (
    <>
      <div className="eyebrow">{title}</div>

      <div className="admin-live">
        <div className="admin-live-label">Students see</div>
        <div className="admin-live-term">
          {live ? `Published ${fmtWhen(live.created_at)}` : "The copy built into the app"}
        </div>
        <div className="admin-live-meta">
          {live
            ? `by ${live.created_by_email ?? "an unknown account"}`
            : "Nothing has been published from here yet."}
        </div>
      </div>

      <p className="screen-note" style={{ marginTop: 12 }}>
        Change what has changed and press <strong>Publish</strong> at the bottom. It goes live
        straight away. The last {KEEP_VERSIONS} versions stay below, so a mistake is one tap
        from undone.
      </p>
      {onHelp && (
        <button className="btn ghost block" style={{ marginBottom: 14 }} onClick={onHelp}>
          How to use this page
        </button>
      )}

      {error && <div className="notice" style={{ marginBottom: 14 }}>{error}</div>}
      {done && !dirty && <div className="banner" style={{ marginTop: 0, marginBottom: 14 }}><p>{done}</p></div>}

      <section className="por-block">
        <h3 className="por-h">Timings</h3>
        <p className="por-hint">Optional, exactly as the mess prints them. Leave a meal blank to show no time.</p>
        <div className="por-grid">
          {MEAL_NAMES.map((m) => (
            <label className="leave-field" key={m}>
              <span>{m}</span>
              <input
                value={form.timings?.[m] ?? ""}
                maxLength={60}
                placeholder="e.g. 8 AM to 10:30 AM"
                onChange={(e) => setLine("timings", m, e.target.value)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="por-block">
        <h3 className="por-h">Served every day</h3>
        <p className="por-hint">Optional. Shown once above the week rather than repeated in every day.</p>
        {MEAL_NAMES.map((m) => (
          <label className="leave-field" key={m}>
            <span>{m}</span>
            <textarea
              rows={rowsFor(form.everyday?.[m])}
              value={form.everyday?.[m] ?? ""}
              onChange={(e) => setLine("everyday", m, e.target.value)}
            />
          </label>
        ))}
      </section>

      {WEEK.map((day) => {
        const d = form.days.find((x) => x.day === day);
        return (
          <section className="por-block" key={day}>
            <h3 className="por-h">{day}</h3>
            {MEAL_NAMES.map((m) => (
              <label className="leave-field" key={m}>
                <span>{m}</span>
                <textarea
                  rows={rowsFor(d?.meals?.[m])}
                  value={d?.meals?.[m] ?? ""}
                  placeholder="Dishes, separated by commas"
                  onChange={(e) => setMeal(day, m, e.target.value)}
                />
              </label>
            ))}
          </section>
        );
      })}

      <div className="por-publish">
        {check.errors.length > 0 && (
          <div className="notice" style={{ marginTop: 0, textAlign: "left" }}>
            <strong>{MSG.cantPublish}</strong>
            <ul className="admin-errors">
              {check.errors.map((e) => <li key={e}>{e}</li>)}
            </ul>
          </div>
        )}
        {dirty && check.warnings.length > 0 && (
          <div className="banner warn" style={{ marginTop: check.errors.length ? 10 : 0 }}>
            {check.warnings.map((w) => <p key={w}>{w}</p>)}
          </div>
        )}
        <button
          className="btn block"
          style={{ marginTop: 12 }}
          disabled={!dirty || !check.ok || busy}
          onClick={() => publish(cleaned, {
            ask: `Publish ${name}'s day mess menu? Every student sees it the next time they open IIMPresent.`,
          })}
        >
          {busy ? "Publishing…" : dirty ? MSG.publish : MSG.noChanges}
        </button>
        {dirty && (
          <button className="btn ghost block" style={{ marginTop: 8 }} disabled={busy} onClick={() => setEdits(null)}>
            Discard changes
          </button>
        )}
      </div>

      <div className="eyebrow" style={{ marginTop: 26 }}>History</div>
      <p className="por-hint" style={{ margin: "0 0 6px" }}>
        The last {KEEP_VERSIONS} versions are kept. Each new publish, a restore included, removes
        the oldest.
      </p>
      {versions.length === 0 && (
        <div className="empty">Nothing published yet. Students see the copy built into the app.</div>
      )}
      {versions.map((v, i) => (
        <div className={`admin-row${i === 0 ? " live" : ""}`} key={v.id}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="admin-row-head">
              <span className="course">{fmtWhen(v.created_at)}</span>
              {i === 0 && <span className="tag signal">live</span>}
              {v.restored_from && <span className="tag quiet">restored</span>}
            </div>
            <div className="meta">{v.created_by_email ?? "unknown account"}</div>
          </div>
          {i > 0 && (
            <button
              className="mark"
              disabled={busy}
              onClick={() => publish(v.payload, {
                restoredFrom: v.id,
                ask: `Put the version from ${fmtWhen(v.created_at)} back live? Any unpublished changes here are discarded.`,
              })}
            >
              Restore
            </button>
          )}
        </div>
      ))}

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={leave}>
          Back to dashboard
        </button>
      )}
    </>
  );
}
