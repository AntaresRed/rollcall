import { useEffect, useMemo, useRef, useState } from "react";
import {
  GUEST_TO, GUEST_CC, GUEST_HOSTELS, BLANK_GUEST, loadGuest, saveGuest,
  guestProblems, guestSubject, guestBody, guestMailto, guestGmailHref, guestGmailAppHref,
} from "../lib/guestmail";
import { makeGuestPdf, guestLayout } from "../lib/guestpdf";
import {
  ID_ACCEPT, MAX_PDF_BYTES, MAX_ID_COPIES, MAX_TOTAL_BYTES, prepareIdCopy, namedIdCopies,
  idCopiesBytes, holdIdCopies, heldIdCopies, dropIdCopy,
} from "../lib/idcopy";
import { isIOS, isAndroid, isStandalone } from "../lib/platform";
import { deliverFile } from "../lib/deliver";
import { track } from "../lib/track";
import { GUEST_DRAFT_STEPS, GOOGLE_CLIENT_ID, takeRoundTrip } from "../lib/gmaildraft";
import { useGmailDraft, DraftPanel, Field, Line, CopyButton, copyText } from "./MailDraft";

/**
 * The guest entry mail — a visitor to a student hostel, reported to the
 * offices the institute names, from the student's own iimcal address, with
 * the signed entry form and a masked copy of the guest's ID.
 *
 * The leave mail's twin (LeaveMail.jsx), and built the same way on purpose:
 * the same Gmail draft, the same fallback, the same remembered details. What
 * is its own is the ID copy, which is the one attachment the app can't make
 * and must be given — see src/lib/idcopy.js for where it is and isn't kept.
 */
export default function GuestEntry({
  email = "", accountName = "", onBack, backLabel = "Back to mail services",
  initial = null, initialIds = null, openDraft = false, gmailDraft = Boolean(GOOGLE_CLIENT_ID),
}) {
  // `initial` and `initialIds` bypass storage and the picker, and `openDraft`
  // unfolds the draft. Only the smoke test passes them — it has no storage
  // and cannot click, and would otherwise never see the finished mail.
  const [form, setForm] = useState(() =>
    (initial ? { ...BLANK_GUEST, ...initial } : loadGuest(new Date(), accountName)));
  const [copied, setCopied] = useState("");
  const [draftOpen, setDraftOpen] = useState(openDraft);

  useEffect(() => { saveGuest(form); }, [form]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const choose = (key, otherKey) => (value) =>
    setForm((f) => ({ ...f, [key]: value, ...(value !== "Other" ? { [otherKey]: "" } : {}) }));

  /* ---------- the ID copies ---------- */
  // One per guest, or both sides of one card: as many as the student picks,
  // up to MAX_ID_COPIES and a total Gmail will take in one draft. Named by
  // their order ("Guest ID 1", "Guest ID 2") only when they go out.
  const [idCopies, setIdCopies] = useState(initialIds ?? []);
  const [idError, setIdError] = useState("");
  const [idBusy, setIdBusy] = useState(false);
  const picker = useRef(null);
  const namedIds = useMemo(() => namedIdCopies(idCopies), [idCopies]);

  const keepIds = (next) => {
    setIdCopies(next);
    if (next.length) holdIdCopies(next);
    else dropIdCopy();
  };

  const pickIds = async (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";               // so picking the same file again still fires
    if (!files.length) return;
    setIdBusy(true);
    setIdError("");
    const next = [...idCopies];
    const errors = new Set();
    for (const file of files) {
      if (next.length >= MAX_ID_COPIES) { errors.add("count"); break; }
      try {
        const copy = await prepareIdCopy(file);
        if (idCopiesBytes(next) + copy.bytes.length > MAX_TOTAL_BYTES) { errors.add("total"); continue; }
        next.push(copy);
      } catch (err) {
        errors.add(err?.code ?? "unreadable");
      }
    }
    keepIds(next);
    setIdError([...errors].map((code) => ({
      "too-big": `A PDF over ${Math.round(MAX_PDF_BYTES / 1048576)} MB was left out. A photo of the ID works too.`,
      type: "Only photos and PDFs can be added.",
      count: `Up to ${MAX_ID_COPIES} IDs can go in one mail.`,
      total: `Together the IDs would be over ${Math.round(MAX_TOTAL_BYTES / 1048576)} MB, too large for one mail. Photos are smaller than PDFs.`,
      unreadable: "An image couldn't be read. Try a JPEG or PNG photo, or a PDF.",
    }[code])).join(" "));
    setIdBusy(false);
  };
  const removeId = (index) => {
    setIdError("");
    keepIds(idCopies.filter((_, i) => i !== index));
  };

  /* ---------- checks ---------- */
  // The form's own answers decide whether the PDF can be made; the ID copy
  // only whether the draft can. Picking the ID last doesn't wait on the PDF.
  const formProblems = useMemo(() => guestProblems(form), [form]);
  const formReady = formProblems.length === 0;
  const needsId = gmailDraft && idCopies.length === 0;
  const problems = useMemo(
    () => (needsId ? guestProblems(form, { hasId: false }) : formProblems),
    [form, formProblems, needsId],
  );
  const ready = problems.length === 0;
  const subject = useMemo(() => (formReady ? guestSubject(form) : ""), [formReady, form]);
  const body = useMemo(() => (formReady ? guestBody(form) : ""), [formReady, form]);
  const cut = useMemo(() => (formReady ? guestLayout(form).cut : false), [formReady, form]);

  const copy = async (which, value) => {
    if (await copyText(value)) {
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? "" : c)), 2200);
    }
  };

  // The form PDF, made a beat after each change rather than on the tap, as
  // the leave mail's is: iOS only opens a share sheet from inside the tap.
  const formKey = useMemo(() => JSON.stringify(form), [form]);
  const [pdf, setPdf] = useState(null);          // { key, file } | { key, error }
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!formReady) return undefined;
    let live = true;
    const id = setTimeout(() => {
      makeGuestPdf(form)
        .then((file) => live && setPdf({ key: formKey, file }))
        .catch(() => live && setPdf({ key: formKey, error: true }));
    }, 350);
    return () => { live = false; clearTimeout(id); };
    // `form` is read through `formKey`, which changes exactly when it does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formReady, formKey, attempt]);
  const pdfFile = pdf?.key === formKey ? pdf.file : null;
  const pdfFailed = pdf?.key === formKey && pdf.error;

  /* ---------- the Gmail draft ---------- */
  // The draft's key covers the ID copies too: a different set is a
  // different mail, and Update Gmail draft should say so.
  const draftKey = `${formKey}|${idCopies.map((c) => `${c.type}:${c.bytes.length}`).join(",") || "no-id"}`;
  // Restoring from the very first render, not from the effect that does it.
  // The draft owed after a trip looks first — its effect runs before the
  // restore's — and a form with no ID yet looked like one that could never
  // be drafted: it gave up, and the student had to tap Create Gmail draft a
  // second time. The trip is the same one the draft hook reads; it is held
  // once per page, so asking here doesn't use it up.
  const [restoring, setRestoring] = useState(() => {
    if (!gmailDraft || initialIds) return false;
    const trip = takeRoundTrip(Date.now(), "guest");
    return trip.pending && !trip.error;
  });
  const draft = useGmailDraft({
    kind: "guest",
    event: "guest_entry",
    email,
    enabled: gmailDraft,
    ready,
    // Only a complete mail — ID included — counts as ready to draft, so a
    // draft owed after a trip never goes out without the ID it promises.
    pdfFile: ready ? pdfFile : null,
    pdfFailed,
    formKey: draftKey,
    hold: restoring,
    compose: async () => ({
      to: GUEST_TO,
      cc: GUEST_CC,
      subject,
      body,
      files: [
        { name: pdfFile.name, type: pdfFile.type, bytes: new Uint8Array(await pdfFile.arrayBuffer()) },
        ...namedIds,
      ],
    }),
  });

  // Back from Google, the ID copies held for the trip are put back on the form
  // before the owed draft is made. Any other visit clears what an earlier
  // one may have left, and leaving the screen clears it too.
  //
  // Leaving clears it only once the arrival has settled: React's development
  // checks mount a screen twice, and a clear between the two would delete
  // the copy the second mount is about to put back.
  const settled = useRef(false);
  useEffect(() => {
    if (initialIds) return undefined;
    let live = true;
    if (draft.trip.pending && !draft.trip.error) {
      setRestoring(true);
      heldIdCopies().then((got) => {
        if (!live) return;
        if (got.length) setIdCopies(got);
        setRestoring(false);
        settled.current = true;
      });
    } else {
      dropIdCopy();
      settled.current = true;
    }
    return () => {
      live = false;
      if (settled.current) dropIdCopy();
    };
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- the usual way, when there is no draft ---------- */
  // As the leave mail does it: save the form, then open the mail; the
  // student attaches the form and the ID copy themselves. See LeaveMail.jsx
  // for why iOS takes two taps and the installed app uses the share sheet.
  const ios = isIOS();
  const phone = ios || isAndroid();
  const sheet = ios && isStandalone();
  const [savedKey, setSavedKey] = useState(null);
  const [cancelledKey, setCancelledKey] = useState(null);
  const savedThis = Boolean(pdfFile) && savedKey === formKey;
  const cancelledThis = !savedThis && cancelledKey === formKey;

  const save = async () => {
    const how = await deliverFile(pdfFile.name, pdfFile, pdfFile.type, { share: sheet });
    if (how === "cancelled") {
      setCancelledKey(formKey);
      return;
    }
    setSavedKey(formKey);
  };
  const send = () => {
    if (!pdfFile) return;
    track("guest_entry", "send");
    save();
    if (ios) return;
    if (phone) {
      setTimeout(() => { window.location.href = guestMailto(form); }, 400);
    } else {
      window.open(guestGmailHref(form, email), "_blank", "noopener");
    }
  };
  const saveOnly = () => {
    if (!pdfFile) return;
    track("guest_entry", "save-pdf");
    save();
  };

  return (
    <>
      <div className="eyebrow">Guest entry</div>

      <div className="leave-form">
        <Field label="Date">
          <input type="date" value={form.date} onChange={set("date")} />
        </Field>

        <Field label="Name of guest(s)">
          <input
            type="text"
            value={form.guestNames}
            placeholder="Separate names with commas"
            onChange={set("guestNames")}
          />
        </Field>
        <Field label="Guest's address">
          <textarea rows={2} value={form.guestAddress} onChange={set("guestAddress")} />
        </Field>
        <div className="leave-pair">
          <Field label="Guest mobile no(s).">
            <input
              type="tel"
              value={form.guestMobiles}
              autoComplete="off"
              onChange={set("guestMobiles")}
            />
          </Field>
          <Field label="Relationship to you">
            <input
              type="text"
              value={form.relationship}
              placeholder="e.g. Father"
              onChange={set("relationship")}
            />
          </Field>
        </div>

        <HostelChips
          legend="Hostel the guest will visit"
          value={form.visitHostel}
          other={form.visitHostelOther}
          onPick={choose("visitHostel", "visitHostelOther")}
          onOther={set("visitHostelOther")}
        />

        <div className="leave-pair">
          <Field label="Arrival date">
            <input type="date" value={form.arriveDate} onChange={set("arriveDate")} />
          </Field>
          <Field label="Expected time">
            <input type="time" value={form.arriveTime} onChange={set("arriveTime")} />
          </Field>
        </div>
        <div className="leave-pair">
          <Field label="Departure date">
            <input
              type="date"
              value={form.departDate}
              min={form.arriveDate || undefined}
              onChange={set("departDate")}
            />
          </Field>
          <Field label="Expected time">
            <input type="time" value={form.departTime} onChange={set("departTime")} />
          </Field>
        </div>

        <Field label="Reason(s) for visit">
          <textarea
            rows={3}
            value={form.reason}
            onChange={set("reason")}
          />
        </Field>

        {/* A button over a hidden input, so the picker looks like the rest
            of the form. Images and PDFs both: an ID is as often a photo as
            a scan. */}
        <div className="leave-field guest-id">
          <span>Guest ID</span>
          <input
            ref={picker}
            type="file"
            accept={ID_ACCEPT}
            multiple
            onChange={pickIds}
            hidden
          />
          {namedIds.map((c, i) => (
            <div className="guest-id-chosen" key={`${i}-${c.bytes.length}`}>
              <div className="guest-id-name">
                {c.name}
                <em>{Math.max(1, Math.round(c.bytes.length / 1024))} KB</em>
              </div>
              <button type="button" className="leave-copy" onClick={() => removeId(i)}>
                Remove
              </button>
            </div>
          ))}
          {idCopies.length < MAX_ID_COPIES && (
            <button
              type="button"
              className="btn ghost guest-id-pick"
              disabled={idBusy || restoring}
              onClick={() => picker.current?.click()}
            >
              {idBusy || restoring ? "Preparing…"
                : idCopies.length ? "Add another ID" : "Choose photos or PDFs"}
            </button>
          )}
          {idError && <p className="leave-warn">{idError}</p>}
        </div>

        <p className="leave-sub">Your details</p>
        <Field label="Name of student">
          <input type="text" value={form.name} autoComplete="name" onChange={set("name")} />
        </Field>
        <div className="leave-pair">
          <Field label="MBA registration no.">
            <input
              type="text"
              value={form.reg}
              placeholder="e.g. 0446/62"
              autoComplete="off"
              onChange={set("reg")}
            />
          </Field>
          <Field label="Your mobile no.">
            <input
              type="tel"
              value={form.phone}
              autoComplete="tel"
              onChange={set("phone")}
            />
          </Field>
        </div>
        <HostelChips
          legend="Your hostel"
          value={form.hostel}
          other={form.hostelOther}
          onPick={choose("hostel", "hostelOther")}
          onOther={set("hostelOther")}
        />
        <div className="leave-pair">
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
      </div>

      {!ready && (
        <div className="leave-pending">
          {problems.map((p) => <p key={p}>{p}</p>)}
        </div>
      )}
      {formReady && pdfFailed && (
        <div className="leave-pending">
          <p>
            Couldn&apos;t prepare the form PDF. Check your connection, then{" "}
            <button type="button" className="leave-retry" onClick={() => setAttempt((n) => n + 1)}>
              try again
            </button>.
          </p>
        </div>
      )}
      {cut && (
        <p className="leave-saved">
          A long answer is set smaller on the form, and shortened where it still
          won&apos;t fit. The mail carries it in full.
        </p>
      )}

      {draft.route && (
        <DraftPanel
          draft={draft}
          steps={GUEST_DRAFT_STEPS}
          pdfFile={ready ? pdfFile : null}
          canDownload={Boolean(pdfFile)}
          onDownload={saveOnly}
          mailName="the guest entry mail"
          attached={`the form and the ${idCopies.length > 1 ? "ID copies" : "ID copy"} attached`}
          idle={`The mail goes into your Gmail Drafts with the form and the ${idCopies.length > 1 ? "ID copies" : "ID copy"} attached. You press Send there. The first time, Google asks you to allow this.`}
          saved={savedThis && (
            <p className="leave-saved">
              Guest form saved as <strong>{pdfFile.name}</strong>
            </p>
          )}
        />
      )}
      {!draft.route && (
        <>
          <div className="leave-acts">
            {ios && savedThis ? (
              <a
                className="btn leave-send"
                href={guestGmailAppHref(form)}
                onClick={() => track("guest_entry", "open-gmail")}
              >
                Open Gmail
              </a>
            ) : (
              <button className="btn leave-send" disabled={!pdfFile} onClick={send}>
                {formReady && !pdfFile && !pdfFailed ? "Preparing…" : "Send Mail"}
              </button>
            )}
            <button className="btn ghost leave-send" disabled={!pdfFile} onClick={saveOnly}>
              Download form
            </button>
          </div>
          {savedThis && (
            <p className="leave-saved">
              Guest form saved as <strong>{pdfFile.name}</strong>. Attach it and the
              guest&apos;s ID copy in the mail.
            </p>
          )}
          {ios && savedThis && (
            <p className="leave-saved">
              In Gmail, check <strong>From</strong> is your @email.iimcal.ac.in address.
            </p>
          )}
          {sheet && cancelledThis && (
            <p className="leave-saved">
              The form wasn&apos;t saved. Tap Send Mail again and choose{" "}
              <strong>Save to Files</strong>.
            </p>
          )}
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
            <Line label="To" value={GUEST_TO.join(", ")} copied={copied === "to"}
                  onCopy={() => copy("to", GUEST_TO.join(", "))} />
            {formReady ? (
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

/** The hostels as chips, as on the leave mail, with "Other" opening a box. */
function HostelChips({ legend, value, other, onPick, onOther }) {
  return (
    <>
      <fieldset className="place-pick leave-hostel">
        <legend>{legend}</legend>
        <div className="place-grid">
          {[...GUEST_HOSTELS, "Other"].map((h) => (
            <button
              key={h}
              type="button"
              className={`place-chip${value === h ? " on" : ""}`}
              aria-pressed={value === h}
              onClick={() => onPick(h)}
            >
              {h}
            </button>
          ))}
        </div>
      </fieldset>
      {value === "Other" && (
        <Field label="Which hostel">
          <input type="text" value={other} onChange={onOther} />
        </Field>
      )}
    </>
  );
}
