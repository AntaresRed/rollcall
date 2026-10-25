import { useEffect, useMemo, useState } from "react";
import {
  LEAVE_TO, LEAVE_CC, LEAVE_HOSTELS, BLANK_LEAVE, loadLeave, saveLeave,
  leaveProblems, leaveSubject, leaveBody, leaveMailto, leaveGmailHref, leaveGmailAppHref,
} from "../lib/leavemail";
import { isIOS, isAndroid, isStandalone } from "../lib/platform";
import { makeLeavePdf } from "../lib/leavepdf";
import { deliverFile } from "../lib/deliver";
import { track } from "../lib/track";
import { DRAFT_STEPS, GOOGLE_CLIENT_ID } from "../lib/gmaildraft";
import { useGmailDraft, DraftPanel, Field, Line, CopyButton, copyText } from "./MailDraft";

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
  email = "", accountName = "", onBack, backLabel = "Back to mail services",
  initial = null, openDraft = false, gmailDraft = Boolean(GOOGLE_CLIENT_ID),
}) {
  // `initial` bypasses the stored form, and `openDraft` unfolds the draft.
  // Only the smoke test passes either — it has no storage and cannot click,
  // and would otherwise never see the finished mail render. It also turns
  // `gmailDraft` off, to keep rendering the Send Mail route the app falls
  // back to.
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

  // Which form was last saved, by key: a form edited after saving has to be
  // saved again before it is the one worth attaching. A share sheet backed
  // out of is keyed the same way, so its note goes once the form changes.
  const [savedKey, setSavedKey] = useState(null);
  const [cancelledKey, setCancelledKey] = useState(null);
  const savedThis = Boolean(pdfFile) && savedKey === formKey;
  const cancelledThis = !savedThis && cancelledKey === formKey;

  // One button, three routes. Android: the mail app — Gmail's web compose
  // opens in a browser tab there, not in the Gmail app. A laptop: Gmail in
  // the institute account, because mailto there usually lands in a desktop
  // client nobody ever set up. iOS: the Gmail app, see below.
  const ios = isIOS();
  const phone = ios || isAndroid();

  // Installed to the Home Screen, iOS ignores `download` and opens the PDF in
  // a viewer instead, with nothing saved — so there, and only there, the
  // form goes through the share sheet, whose Save to Files does save it.
  // A Safari tab keeps the plain download, which lands in Files › Downloads.
  //
  // The sheet also offers Gmail, and picking it makes a mail with the form
  // and nobody to send it to. That is why nothing opens on its own after the
  // sheet: the addressed mail is always a second tap, so the worst a wrong
  // pick does is one stray draft.
  const sheet = ios && isStandalone();

  // Nothing awaits before the download starts, so a caller that opens a
  // window afterwards is still inside the tap. Only the sheet is awaited,
  // and only to learn whether it was backed out of.
  const save = async () => {
    const how = await deliverFile(pdfFile.name, pdfFile, pdfFile.type, { share: sheet });
    if (how === "cancelled") {
      setCancelledKey(formKey);
      return;
    }
    setSavedKey(formKey);
  };

  /**
   * Save the form, then open the mail. Links cannot attach anything, so the
   * student attaches the saved PDF themselves.
   *
   * On iOS that is two taps, not one. Safari asks before it downloads, and
   * leaving for another app in the same moment talks over that question; and
   * an app opened a beat after the tap, rather than by it, may not open at
   * all. So the first tap saves, and the button becomes "Open Gmail", a
   * plain link whose tap opens it. Elsewhere both happen in the one tap, the
   * download first.
   */
  const send = () => {
    if (!pdfFile) return;
    track("leave_mail", "send");
    save();
    if (ios) return;
    if (phone) {
      // A beat for the download to register before the mail app takes over.
      setTimeout(() => { window.location.href = leaveMailto(form); }, 400);
    } else {
      window.open(leaveGmailHref(form, email), "_blank", "noopener");
    }
  };

  const saveOnly = () => {
    if (!pdfFile) return;
    track("leave_mail", "save-pdf");
    save();
  };

  const sendLabel = ready && !pdfFile && !pdfFailed ? "Preparing…" : "Send Mail";

  /* ---------- the Gmail draft ----------
     Everything but the Send: the mail goes into the student's own Drafts,
     addressed, written and with the form attached. Needs Google's
     permission, and on for everyone once VITE_GOOGLE_CLIENT_ID is set.
     The machinery is shared with the guest entry mail: see MailDraft.jsx
     and src/lib/gmaildraft.js. */
  const draft = useGmailDraft({
    kind: "leave",
    event: "leave_mail",
    email,
    enabled: gmailDraft,
    ready,
    pdfFile,
    pdfFailed,
    formKey,
    compose: async () => ({
      to: LEAVE_TO,
      cc: LEAVE_CC,
      subject,
      body,
      files: [{ name: pdfFile.name, type: pdfFile.type, bytes: new Uint8Array(await pdfFile.arrayBuffer()) }],
    }),
  });
  const draftRoute = draft.route;

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
      {draftRoute && (
        <DraftPanel
          draft={draft}
          steps={DRAFT_STEPS}
          pdfFile={pdfFile}
          onDownload={saveOnly}
          mailName="the leave mail"
          attached="the form attached"
          idle="The mail goes into your Gmail Drafts with the form attached. You press Send there. The first time, Google asks you to allow this."
          saved={savedThis && (
            <p className="leave-saved">
              Leave form saved as <strong>{pdfFile.name}</strong>
            </p>
          )}
        />
      )}
      {!draftRoute && (
        <>
          {/* Side by side: the form on its own is worth having too — to print,
              to send again later, or to hand over in person. */}
          <div className="leave-acts">
            {ios && savedThis ? (
              // Gmail only, by decision: the mail goes from the institute account,
              // and that lives in the Gmail app. A plain link, so the app opens
              // from the tap itself.
              <a
                className="btn leave-send"
                href={leaveGmailAppHref(form)}
                onClick={() => track("leave_mail", "open-gmail")}
              >
                Open Gmail
              </a>
            ) : (
              <button className="btn leave-send" disabled={!pdfFile} onClick={send}>
                {sendLabel}
              </button>
            )}
            <button className="btn ghost leave-send" disabled={!pdfFile} onClick={saveOnly}>
              Download form
            </button>
          </div>
          {/* Names the file, so it can be found again from the mail's attach
              picker — a link can't attach it for them. */}
          {savedThis && (
            <p className="leave-saved">
              Leave form saved as <strong>{pdfFile.name}</strong>
            </p>
          )}
          {/* The Gmail app opens in whichever account was used last, and a link
              can't pick one — so it is said, not assumed. */}
          {ios && savedThis && (
            <p className="leave-saved">
              In Gmail, attach the form and check <strong>From</strong> is your
              @email.iimcal.ac.in address.
            </p>
          )}
          {sheet && cancelledThis && (
            <p className="leave-saved">
              The form wasn&apos;t saved. Tap Send Mail again and choose{" "}
              <strong>Save to Files</strong>.
            </p>
          )}
          {/* Said before the sheet opens, not after: it is the one place a wrong
              pick is easy to make, and Save to Files is far down its list. */}
          {sheet && !savedThis && !cancelledThis && pdfFile && (
            <p className="leave-saved">
              Send Mail saves the form first. In the list that opens, choose{" "}
              <strong>Save to Files</strong>.
            </p>
          )}
        </>
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
          {backLabel}
        </button>
      )}
    </>
  );
}
