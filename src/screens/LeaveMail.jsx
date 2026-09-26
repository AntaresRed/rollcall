import { useEffect, useMemo, useState } from "react";
import {
  LEAVE_TO, LEAVE_CC, LEAVE_HOSTELS, BLANK_LEAVE, loadLeave, saveLeave,
  leaveProblems, leaveSubject, leaveBody, leaveMailto, leaveGmailHref,
} from "../lib/leavemail";
import { isIOS, isAndroid } from "../lib/platform";
import { makeLeavePdf } from "../lib/leavepdf";
import { deliverFile } from "../lib/deliver";

/**
 * The leave mail — leave of more than a day, reported to the offices the
 * institute names, from the student's own iimcal address.
 *
 * Written and addressed here, sent from the student's mail: Send Mail is a
 * handover, never a send. The draft and the addresses sit folded away under
 * the button, each with its own copy button — most people never need them,
 * and they are there for the day the handover doesn't behave.
 */
export default function LeaveMail({
  email = "", accountName = "", onBack, initial = null, openDraft = false,
}) {
  // `initial` bypasses the stored form, and `openDraft` unfolds the draft.
  // Only the smoke test passes either — it has no storage and cannot click,
  // and would otherwise never see the finished mail render.
  const [form, setForm] = useState(() =>
    (initial ? { ...BLANK_LEAVE, ...initial } : loadLeave(new Date(), accountName)));
  const [copied, setCopied] = useState("");
  const [draftOpen, setDraftOpen] = useState(openDraft);

  useEffect(() => { saveLeave(form); }, [form]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const problems = useMemo(() => leaveProblems(form), [form]);
  const ready = problems.length === 0;
  const subject = useMemo(() => (ready ? leaveSubject(form) : ""), [ready, form]);
  const body = useMemo(() => (ready ? leaveBody(form) : ""), [ready, form]);

  const copy = async (which, value) => {
    if (await copyText(value)) {
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? "" : c)), 2200);
    }
  };

  // The form PDF, made ahead of the tap rather than on it. iOS only opens a
  // share sheet from inside the tap itself, and fetching the form and the
  // signature font first would use that moment up. So it is rebuilt quietly
  // a beat after each change, keyed by the form it was made from, and Send
  // Mail waits for it only if it is pressed within that beat.
  const formKey = useMemo(() => JSON.stringify(form), [form]);
  const [pdf, setPdf] = useState(null);          // { key, file } | { key, error }
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ready) return undefined;
    let live = true;
    const id = setTimeout(() => {
      makeLeavePdf(form)
        .then((file) => live && setPdf({ key: formKey, file }))
        .catch(() => live && setPdf({ key: formKey, error: true }));
    }, 350);
    return () => { live = false; clearTimeout(id); };
    // `form` is read through `formKey`, which changes exactly when it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, formKey, attempt]);
  const pdfFile = pdf?.key === formKey ? pdf.file : null;
  const pdfFailed = pdf?.key === formKey && pdf.error;

  const [saved, setSaved] = useState("");        // "" | "saved" | "cancelled"

  // One button, two routes. On a phone the mail app: Gmail's web compose
  // opens in a browser tab there, not in the Gmail app. On a laptop Gmail in
  // the institute account, because mailto there usually lands in a desktop
  // client nobody ever set up.
  const ios = isIOS();
  const phone = ios || isAndroid();

  /**
   * Save the form, then open the mail. Links cannot attach anything, so the
   * student attaches the saved PDF themselves — the note that appears says
   * so. On iOS the save is the share sheet ("Save to Files"), because a plain
   * download from a Home Screen app has nowhere useful to land; everywhere
   * else it is an ordinary download, started before the mail opens so both
   * happen inside the one tap.
   */
  const send = async () => {
    if (!pdfFile) return;
    const save = (share) => deliverFile(pdfFile.name, pdfFile, pdfFile.type, { share });
    if (ios) {
      const how = await save(true);
      if (how === "cancelled") { setSaved("cancelled"); return; }
      setSaved("saved");
      window.location.href = leaveMailto(form);
      return;
    }
    save(false);
    setSaved("saved");
    if (phone) {
      // A beat for the download to register before the mail app takes over.
      setTimeout(() => { window.location.href = leaveMailto(form); }, 400);
    } else {
      window.open(leaveGmailHref(form, email), "_blank", "noopener");
    }
  };

  const saveOnly = () => {
    if (pdfFile) deliverFile(pdfFile.name, pdfFile, pdfFile.type, { share: ios });
  };

  return (
    <>
      <div className="eyebrow">Leave mail</div>

      <div className="leave-form">
        <Field label="Date">
          <input type="date" value={form.date} onChange={set("date")} />
        </Field>
        <Field label="Name of student">
          <input type="text" value={form.name} autoComplete="name" onChange={set("name")} />
        </Field>
        <div className="leave-pair">
          <Field label="Registration no.">
            <input
              type="text"
              value={form.reg}
              placeholder="e.g. 0446/62"
              autoComplete="off"
              onChange={set("reg")}
            />
          </Field>
          <Field label="Contact while on leave">
            <input
              type="tel"
              value={form.phone}
              placeholder="98765 43210"
              autoComplete="tel"
              onChange={set("phone")}
            />
          </Field>
        </div>

        {/* Chips, like the tuck shop's delivery spots: a handful of short
            names that are the same answer every time, better seen than
            hidden in a dropdown. */}
        <fieldset className="place-pick leave-hostel">
          <legend>Hostel</legend>
          <div className="place-grid">
            {[...LEAVE_HOSTELS, "Other"].map((h) => (
              <button
                key={h}
                type="button"
                className={`place-chip${form.hostel === h ? " on" : ""}`}
                aria-pressed={form.hostel === h}
                onClick={() => setForm((f) => ({ ...f, hostel: h }))}
              >
                {h}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="leave-pair">
          {form.hostel === "Other" && (
            <Field label="Which hostel">
              <input type="text" value={form.hostelOther} onChange={set("hostelOther")} />
            </Field>
          )}
          <Field label="Room number">
            <input
              type="text"
              value={form.room}
              placeholder="e.g. 214"
              autoComplete="off"
              onChange={set("room")}
            />
          </Field>
        </div>

        <Field label="Address during leave">
          <textarea rows={3} value={form.address} onChange={set("address")} />
        </Field>
        <Field label="Reason for leave">
          <textarea rows={2} value={form.reason} onChange={set("reason")} />
        </Field>
        <Field label="Additional info" optional>
          <textarea rows={2} value={form.info} onChange={set("info")} />
        </Field>

        <div className="leave-pair">
          <Field label="Departure date">
            <input type="date" value={form.departDate} onChange={set("departDate")} />
          </Field>
          <Field label="Expected time">
            <input type="time" value={form.departTime} onChange={set("departTime")} />
          </Field>
        </div>
        <div className="leave-pair">
          <Field label="Return date">
            <input
              type="date"
              value={form.returnDate}
              min={form.departDate || undefined}
              onChange={set("returnDate")}
            />
          </Field>
          <Field label="Expected time">
            <input type="time" value={form.returnTime} onChange={set("returnTime")} />
          </Field>
        </div>
      </div>

      {/* What's missing sits right above the button it is holding back, so a
          greyed-out Send Mail never has to be puzzled over. */}
      {!ready && (
        <div className="leave-pending">
          {problems.map((p) => <p key={p}>{p}</p>)}
        </div>
      )}
      {ready && pdfFailed && (
        <div className="leave-pending">
          <p>
            Couldn&apos;t prepare the form PDF. Check your connection, then{" "}
            <button type="button" className="leave-retry" onClick={() => setAttempt((n) => n + 1)}>
              try again
            </button>.
          </p>
        </div>
      )}
      {/* Side by side: the form on its own is worth having too — to print,
          to send again later, or to hand over in person. */}
      <div className="leave-acts">
        <button className="btn leave-send" disabled={!pdfFile} onClick={send}>
          {ready && !pdfFile && !pdfFailed ? "Preparing…" : "Send Mail"}
        </button>
        <button className="btn ghost leave-send" disabled={!pdfFile} onClick={saveOnly}>
          Download form
        </button>
      </div>
      {/* Names the file, so it can be found again from the mail's attach
          picker — a link can't attach it for them. */}
      {saved === "saved" && pdfFile && (
        <p className="leave-saved">
          Leave form saved as <strong>{pdfFile.name}</strong>
        </p>
      )}
      {saved === "cancelled" && (
        <p className="leave-saved">
          The form wasn&apos;t saved. Tap Send Mail again and choose <strong>Save to Files</strong>.
        </p>
      )}

      <button
        type="button"
        className="disclosure leave-draft-toggle"
        aria-expanded={draftOpen}
        onClick={() => setDraftOpen((o) => !o)}
      >
        <span className={`disclosure-caret${draftOpen ? " open" : ""}`} />
        Copy admin e-mails or check draft
      </button>

      {draftOpen && (
        <>
          <div className="eyebrow">Mail Draft</div>
          <div className="leave-mail">
            <Line label="To" value={LEAVE_TO.join(", ")} copied={copied === "to"}
                  onCopy={() => copy("to", LEAVE_TO.join(", "))} />
            <Line label="CC" value={LEAVE_CC.join(", ")} copied={copied === "cc"}
                  onCopy={() => copy("cc", LEAVE_CC.join(", "))} />
            {ready ? (
              <>
                <Line label="Subject" value={subject} copied={copied === "subject"}
                      onCopy={() => copy("subject", subject)} />
                <div className="leave-body">
                  <div className="leave-line-head">
                    <span className="leave-line-label">Mail</span>
                    <CopyButton copied={copied === "body"} onCopy={() => copy("body", body)} />
                  </div>
                  <pre>{body}</pre>
                </div>
              </>
            ) : (
              <div className="leave-line leave-line-value leave-draft-wait">
                The subject and mail appear here once the form is filled in.
              </div>
            )}
          </div>
        </>
      )}

      {onBack && (
        <button className="btn ghost block" style={{ marginTop: 18 }} onClick={onBack}>
          Back to utils
        </button>
      )}
    </>
  );
}

/** The optional marker sits on the label's own line, where the eye already
 *  is, rather than under a box that has to be read past first. */
function Field({ label, optional = false, children }) {
  return (
    <label className="leave-field">
      <span>
        {label}
        {optional && <em className="leave-optional">Optional</em>}
      </span>
      {children}
    </label>
  );
}

function Line({ label, value, copied, onCopy }) {
  return (
    <div className="leave-line">
      <div className="leave-line-head">
        <span className="leave-line-label">{label}</span>
        <CopyButton copied={copied} onCopy={onCopy} />
      </div>
      <div className="leave-line-value">{value}</div>
    </div>
  );
}

function CopyButton({ copied, onCopy }) {
  return (
    <button type="button" className="leave-copy" onClick={onCopy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * The clipboard API, and the old select-and-copy where it is missing — a
 * page served over plain http, or an in-app browser that never implemented
 * it. False only when both fail, and then the text is still on screen.
 */
async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
