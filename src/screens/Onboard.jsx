import { useRef, useState } from "react";
import { parseTimetableImage } from "../lib/api";

export default function Onboard({ onParsed, onManual, onUsePicker }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");

  const handle = async (file) => {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      const rows = await parseTimetableImage(file);
      onParsed(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (busy) {
    return (
      <div className="intro" style={{ textAlign: "center", paddingTop: 80 }}>
        <div className="spinner" />
        <h1 style={{ fontSize: 22 }}>Reading your timetable</h1>
        <p>Picking out day columns, slot times, and course names.</p>
      </div>
    );
  }

  return (
    <div className="intro">
      <h1>Your timetable,<br />on time.</h1>
      <p>
        Upload a screenshot of your personal grid and RollCall will read it. Picking
        from the Term V list is faster and never misreads anything.
      </p>

      <div
        className={`dropzone${over ? " over" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files[0]); }}
      >
        <div className="big">Choose your timetable image</div>
        <div className="small">PNG or JPG · a screenshot reads better than a photo</div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => handle(e.target.files[0])}
      />

      {error && <div className="notice">{error}</div>}

      <p style={{ marginTop: 20, fontSize: 13.5 }}>
        {onUsePicker && (
          <>
            <button className="linklike" style={{ color: "var(--signal)" }} onClick={onUsePicker}>
              Pick from the Term V list instead
            </button>
            {" · "}
          </>
        )}
        <button className="linklike" style={{ color: "var(--signal)" }} onClick={onManual}>
          Enter classes by hand
        </button>
      </p>
    </div>
  );
}
