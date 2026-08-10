import { useState } from "react";
import { DAYS, SLOT_STARTS, SLOT_ENDS, pretty, saveTimetable } from "../lib/api";

const blank = () => ({
  day_of_week: 1,
  start_time: "10:15",
  end_time: "11:30",
  subject: "",
  room: "",
  term_phase: "full",
  _matchedCatalogue: true,
});

export default function Confirm({ initial, onSaved, onCancel }) {
  const [rows, setRows] = useState(initial.length ? initial : [blank()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const update = (i, patch) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const remove = (i) => setRows((r) => r.filter((_, idx) => idx !== i));

  const save = async () => {
    const filled = rows.filter((r) => r.subject.trim());
    if (!filled.length) {
      setError("Add at least one class before saving.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await saveTimetable(filled);
      onSaved(saved);
    } catch (err) {
      setError(err.message || "Couldn't save. Check your connection and try again.");
      setSaving(false);
    }
  };

  const unverified = rows.filter((r) => r._matchedCatalogue === false).length;

  return (
    <div style={{ paddingTop: 20 }}>
      <h1 style={{ fontSize: 22, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
        Check what we read
      </h1>
      <p style={{ color: "var(--slate)", margin: "0 0 16px", fontSize: 14 }}>
        Fix anything that looks wrong. Alerts fire off exactly what you save here.
      </p>

      {unverified > 0 && (
        <div className="banner warn">
          <p>
            {unverified} {unverified === 1 ? "course isn't" : "courses aren't"} in our
            catalogue. That's normal for core and new courses — just check the spelling.
          </p>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {rows.map((r, i) => (
          <div
            key={i}
            className={`row-edit${r._matchedCatalogue === false ? " unverified" : ""}`}
          >
            <input
              value={r.subject}
              placeholder="Course name"
              aria-label="Course name"
              onChange={(e) => update(i, { subject: e.target.value })}
            />
            <div className="grid3">
              <select
                value={r.day_of_week}
                aria-label="Day"
                onChange={(e) => update(i, { day_of_week: Number(e.target.value) })}
              >
                {DAYS.map((d, idx) => (
                  <option key={d} value={idx + 1}>{d}</option>
                ))}
              </select>
              <select
                value={r.start_time}
                aria-label="Start time"
                onChange={(e) =>
                  update(i, {
                    start_time: e.target.value,
                    end_time: SLOT_ENDS[e.target.value] ?? r.end_time,
                  })
                }
              >
                {SLOT_STARTS.map((s) => (
                  <option key={s} value={s}>{pretty(s)}</option>
                ))}
              </select>
              <button className="linklike" onClick={() => remove(i)}>Remove</button>
            </div>
            <div className="grid3">
              <input
                value={r.room ?? ""}
                placeholder="Room"
                aria-label="Room"
                onChange={(e) => update(i, { room: e.target.value })}
              />
              <select
                value={r.term_phase}
                aria-label="Runs during"
                onChange={(e) => update(i, { term_phase: e.target.value })}
              >
                <option value="full">Whole term</option>
                <option value="pre_mid">Pre-mid term only</option>
                <option value="post_mid">Post-mid term only</option>
              </select>
              <span />
            </div>
          </div>
        ))}
      </div>

      <button
        className="btn ghost block"
        style={{ marginTop: 4 }}
        onClick={() => setRows((r) => [...r, blank()])}
      >
        Add a class
      </button>

      {error && <div className="notice">{error}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button className="btn" style={{ flex: 1 }} onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save timetable"}
        </button>
        <button className="btn ghost" onClick={onCancel} disabled={saving}>
          Back
        </button>
      </div>
    </div>
  );
}
