import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadCatalogues, uploadCatalogue, publishCatalogue, deleteCatalogue,
  loadCataloguePayload,
} from "../lib/api";
import { activeCatalogue, validateCatalogue, diffCatalogues } from "../lib/catalogue";

const fmtWhen = (iso) =>
  iso ? new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }) : "—";

/**
 * Upload a term schedule, look at what it would change, then publish it.
 *
 * Uploading and publishing are deliberately two acts. An upload is inert — it
 * sits as a draft and no student sees anything — because publishing moves the
 * term dates, the break weeks and every saved class row at once, and that is
 * not something to discover you have done by accident.
 *
 * The file this takes is the catalogue.json that scripts/build_catalogue.py
 * produces from the institute spreadsheet. Parsing the .xlsx here would mean
 * a second implementation of seven hundred lines of parsing that has already
 * been beaten into shape against the real file, and two parsers that disagree
 * is a worse problem than one extra command.
 */
export default function ScheduleAdmin({ onBack }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [staged, setStaged] = useState(null);   // { payload, name, check }
  const [preview, setPreview] = useState(null); // { id, label, diff }
  const [result, setResult] = useState(null);

  const live = activeCatalogue();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await loadCatalogues());
      setError("");
    } catch (err) {
      setError(err.message || "Couldn't load the uploaded schedules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const stagedDiff = useMemo(
    () => (staged?.check?.ok ? diffCatalogues(live, staged.payload) : null),
    [staged, live],
  );

  const readFile = async (file) => {
    setStaged(null);
    setResult(null);
    setError("");
    if (!file) return;

    if (/\.(xlsx|xls)$/i.test(file.name)) {
      setError(
        "That's the spreadsheet itself. Run it through build_catalogue.py first, " +
        "then upload the catalogue.json it writes.",
      );
      return;
    }

    let payload;
    try {
      payload = JSON.parse(await file.text());
    } catch (err) {
      setError(`That file isn't valid JSON — ${err.message}`);
      return;
    }

    setStaged({ payload, name: file.name, check: validateCatalogue(payload) });
  };

  const doUpload = async () => {
    if (!staged?.check?.ok) return;
    setBusy("upload");
    try {
      await uploadCatalogue(staged.payload, {
        label: staged.payload.term,
        sourceName: staged.name,
      });
      setStaged(null);
      await refresh();
    } catch (err) {
      setError(err.message || "Couldn't save that upload.");
    } finally {
      setBusy("");
    }
  };

  const openPreview = async (row) => {
    setResult(null);
    setBusy(`preview:${row.id}`);
    try {
      const payload = await loadCataloguePayload(row.id);
      setPreview({ id: row.id, label: row.label, diff: diffCatalogues(live, payload) });
    } catch (err) {
      setError(err.message || "Couldn't read that upload.");
    } finally {
      setBusy("");
    }
  };

  const doPublish = async (row) => {
    if (!confirm(
      `Publish "${row.label}"?\n\n` +
      "This sets the term dates and break weeks for everyone, and corrects the " +
      "saved rows of students who have already picked these courses. It takes " +
      "effect immediately.",
    )) return;

    setBusy(`publish:${row.id}`);
    setError("");
    try {
      setResult(await publishCatalogue(row.id));
      setPreview(null);
      await refresh();
    } catch (err) {
      setError(err.message || "Couldn't publish that schedule.");
    } finally {
      setBusy("");
    }
  };

  const doDelete = async (row) => {
    if (!confirm(`Delete the upload "${row.label}"? It isn't live, so nothing changes.`)) return;
    setBusy(`delete:${row.id}`);
    try {
      await deleteCatalogue(row.id);
      if (preview?.id === row.id) setPreview(null);
      await refresh();
    } catch (err) {
      setError(err.message || "Couldn't delete that upload.");
    } finally {
      setBusy("");
    }
  };

  return (
    <>
      <div className="eyebrow">Schedule admin</div>
      <p className="screen-note">
        Upload a term schedule, check what it would change, then publish it.
        An upload on its own changes nothing for anybody.
      </p>

      {error && <div className="notice" style={{ marginBottom: 14 }}>{error}</div>}

      {result && (
        <div className="banner" style={{ marginTop: 0, marginBottom: 14 }}>
          <p>
            <strong>Published {result.term}.</strong>{" "}
            {result.courses} courses, {result.breaks} break period
            {result.breaks === 1 ? "" : "s"}, {result.term_start} to {result.term_end}.{" "}
            {result.rows_realigned === 0
              ? "No student rows needed correcting."
              : `${result.rows_realigned} student class row${result.rows_realigned === 1 ? "" : "s"} brought back in line.`}
          </p>
        </div>
      )}

      <div className="admin-live">
        <div className="admin-live-label">Live now</div>
        <div className="admin-live-term">{live.term}</div>
        <div className="admin-live-meta">
          {live.courses.length} courses · {live.calendar?.term_start} to {live.calendar?.term_end}
        </div>
      </div>

      <div className="eyebrow">Upload</div>

      <label className="admin-drop">
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => readFile(e.target.files?.[0])}
        />
        <span className="admin-drop-title">Choose a catalogue.json</span>
        <span className="admin-drop-sub">
          Produced by <code>python scripts/build_catalogue.py</code>
        </span>
      </label>

      {staged && !staged.check.ok && (
        <div className="notice" style={{ marginTop: 12, textAlign: "left" }}>
          <strong>{staged.name} can't be published.</strong>
          <ul className="admin-errors">
            {staged.check.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {staged?.check?.ok && (
        <div className="admin-staged">
          <div className="admin-staged-head">
            <strong>{staged.name}</strong>
            <span className="tag">checks out</span>
          </div>
          <div className="admin-staged-meta">
            {staged.check.summary.term} · {staged.check.summary.courses} courses ·{" "}
            {staged.check.summary.meetings} meetings ·{" "}
            {staged.check.summary.termStart} to {staged.check.summary.termEnd} ·{" "}
            {staged.check.summary.breaks} break periods
          </div>
          {stagedDiff && <DiffView diff={stagedDiff} />}
          <button
            className="btn block"
            style={{ marginTop: 12 }}
            disabled={busy === "upload"}
            onClick={doUpload}
          >
            {busy === "upload" ? "Saving…" : "Save as a draft"}
          </button>
        </div>
      )}

      <div className="eyebrow">Uploads</div>

      {loading && <div className="empty">Loading…</div>}
      {!loading && rows.length === 0 && (
        <div className="empty">Nothing uploaded yet. The app is running on its bundled copy.</div>
      )}

      {rows.map((row) => (
        <div className={`admin-row${row.is_published ? " live" : ""}`} key={row.id}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="admin-row-head">
              <span className="course">{row.label}</span>
              {row.is_published && <span className="tag signal">live</span>}
            </div>
            <div className="meta">
              <span>{row.source_name || "catalogue.json"}</span>
              <span>uploaded {fmtWhen(row.uploaded_at)}</span>
              {row.published_at && <span>published {fmtWhen(row.published_at)}</span>}
            </div>

            <div className="marks">
              <button
                className="mark"
                disabled={busy === `preview:${row.id}`}
                onClick={() => openPreview(row)}
              >
                {busy === `preview:${row.id}` ? "Reading…" : "What would change?"}
              </button>
              {!row.is_published && (
                <>
                  <button
                    className="mark"
                    disabled={busy === `publish:${row.id}`}
                    onClick={() => doPublish(row)}
                  >
                    {busy === `publish:${row.id}` ? "Publishing…" : "Publish"}
                  </button>
                  <button
                    className="mark"
                    disabled={busy === `delete:${row.id}`}
                    onClick={() => doDelete(row)}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>

            {preview?.id === row.id && <DiffView diff={preview.diff} />}
          </div>
        </div>
      ))}

      <p className="fineprint">
        Publishing sets the term dates and break weeks for every student, and
        corrects the saved rows of anyone who has already picked these courses —
        phase, venue, credit rules and end time. It never adds or removes a
        course from anybody's timetable, and never touches attendance or a
        student's own mute settings.
      </p>

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to profile
        </button>
      )}
    </>
  );
}

/**
 * What publishing would do, in the order that matters: the things that need a
 * human decision first, the merely informative last.
 */
function DiffView({ diff }) {
  const quiet =
    !diff.added.length && !diff.removed.length && !diff.changed.length &&
    !diff.meetingsMoved.length && !diff.calendarChanged.length;

  if (quiet) {
    return <div className="admin-diff"><em>Identical to what's live — publishing would change nothing.</em></div>;
  }

  return (
    <div className="admin-diff">
      {diff.meetingsMoved.length > 0 && (
        // The one difference publishing cannot repair: saved rows are matched
        // on day and start time, so a moved meeting matches nothing.
        <div className="admin-diff-warn">
          <strong>{diff.meetingsMoved.length} course{diff.meetingsMoved.length === 1 ? "" : "s"} meet at different times now</strong>
          {" — "}{diff.meetingsMoved.join(", ")}. Students who already picked
          {" "}these keep their old slots until they re-pick the course.
        </div>
      )}

      {diff.calendarChanged.length > 0 && (
        <Line label="Term dates change" value={diff.calendarChanged.join(", ")} />
      )}
      {diff.added.length > 0 && (
        <Line label={`${diff.added.length} new`} value={diff.added.join(", ")} />
      )}
      {diff.removed.length > 0 && (
        <Line label={`${diff.removed.length} gone`} value={diff.removed.join(", ")} />
      )}
      {diff.changed.length > 0 && (
        <Line
          label={`${diff.changed.length} corrected`}
          value={diff.changed.map((c) => `${c.code} (${c.fields.join(", ")})`).join("; ")}
        />
      )}
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div className="admin-diff-line">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
