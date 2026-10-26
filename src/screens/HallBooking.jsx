import { useEffect, useMemo, useState } from "react";
import {
  HALL_TO, HALLS, BLANK_HALL, loadHall, saveHall, hallProblems, hallValues,
  hallSubject, hallBody, hallHtml, hallMailto, hallGmailHref, hallGmailAppHref,
} from "../lib/hallmail";
import { isIOS, isAndroid } from "../lib/platform";
import { track } from "../lib/track";
import { HALL_DRAFT_STEPS, GOOGLE_CLIENT_ID } from "../lib/gmaildraft";
import {
  useGmailDraft, useIdCopies, DraftPanel, IdPicker, Field, Line, CopyButton, copyText,
} from "./MailDraft";

/**
 * The guest house booking — a request to put up a relative at the MDC or
 * Tata Hall guest house, with their photo ID.
 *
 * The third of the mail services, and the simplest: there is no institute
 * form to fill in, so no PDF — the mail is the request, and the guest's ID is
 * its only attachment. Everything else is the guest entry's: the same Gmail
 * draft, the same ID picker, the same student details.
 */

/** Truthy once the mail can be drafted. The draft hook waits on a form PDF,
 *  which this mail doesn't have — the mail itself is what it waits for. */
const NO_FORM = { name: "", type: "" };

export default function HallBooking({
  email = "", accountName = "", onBack, backLabel = "Back to mail services",
  initial = null, initialIds = null, openDraft = false, gmailDraft = Boolean(GOOGLE_CLIENT_ID),
}) {
  // `initial` and `initialIds` bypass storage and the picker, and `openDraft`
  // unfolds the draft. Only the smoke test passes them.
  const [form, setForm] = useState(() =>
    (initial ? { ...BLANK_HALL, ...initial } : loadHall(new Date(), accountName)));
  const [copied, setCopied] = useState("");
  const [draftOpen, setDraftOpen] = useState(openDraft);

  useEffect(() => { saveHall(form); }, [form]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const ids = useIdCopies({ kind: "hall", slot: "hall-id", enabled: gmailDraft, initial: initialIds });

  const formProblems = useMemo(() => hallProblems(form), [form]);
  const formReady = formProblems.length === 0;
  const needsId = gmailDraft && ids.copies.length === 0;
  const problems = useMemo(
    () => (needsId ? hallProblems(form, { hasId: false }) : formProblems),
    [form, formProblems, needsId],
  );
  const ready = problems.length === 0;
  const subject = useMemo(() => (formReady ? hallSubject(form) : ""), [formReady, form]);
  const body = useMemo(() => (formReady ? hallBody(form) : ""), [formReady, form]);
  const nights = useMemo(() => hallValues(form).nights, [form]);

  const copy = async (which, value) => {
    if (await copyText(value)) {
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? "" : c)), 2200);
    }
  };

  /* ---------- the Gmail draft ---------- */
  const formKey = useMemo(() => JSON.stringify(form), [form]);
  const draft = useGmailDraft({
    kind: "hall",
    event: "hall_booking",
    email,
    enabled: gmailDraft,
    ready,
    pdfFile: ready ? NO_FORM : null,
    pdfFailed: false,
    formKey: `${formKey}|${ids.key}`,
    hold: ids.restoring,
    // The formatted mail, the plain text beside it, and the IDs.
    compose: async () => ({
      to: HALL_TO,
      subject,
      body,
      html: hallHtml(form),
      files: ids.named,
    }),
  });

  /* ---------- the usual way, when there is no draft ---------- */
  // Nothing to save first, so it is one tap everywhere: the mail opens
  // addressed and written, and the student attaches the ID themselves. The
  // usual way is plain text — a link can't carry the formatting.
  const ios = isIOS();
  const phone = ios || isAndroid();
  const sendHref = ios ? hallGmailAppHref(form) : phone ? hallMailto(form) : hallGmailHref(form, email);

  return (
    <>
      <div className="eyebrow">MDC &amp; Tata Hall booking</div>

      <div className="leave-form">
        <fieldset className="place-pick leave-hostel">
          <legend>Guest house</legend>
          <div className="place-grid">
            {HALLS.map((h) => (
              <button
                key={h}
                type="button"
                className={`place-chip${form.hall === h ? " on" : ""}`}
                aria-pressed={form.hall === h}
                onClick={() => setForm((f) => ({ ...f, hall: h }))}
              >
                {h}
              </button>
            ))}
          </div>
        </fieldset>

        <Field label="Name of guest">
          <input type="text" value={form.guestName} onChange={set("guestName")} />
        </Field>
        <Field label="Relation to the guest">
          <input type="text" value={form.relation} placeholder="e.g. Father" onChange={set("relation")} />
        </Field>

        <div className="leave-pair">
          <Field label="Check in date">
            <input type="date" value={form.checkIn} onChange={set("checkIn")} />
          </Field>
          <Field label="Check out date">
            <input
              type="date"
              value={form.checkOut}
              min={form.checkIn || undefined}
              onChange={set("checkOut")}
            />
          </Field>
        </div>
        {nights && <p className="hall-nights">Stay being booked: <strong>{nights}</strong></p>}

        <IdPicker ids={ids} />

        <p className="leave-sub">Your details</p>
        <Field label="Name of student">
          <input type="text" value={form.name} autoComplete="name" onChange={set("name")} />
        </Field>
        <div className="leave-pair">
          <Field label="Roll number">
            <input
              type="text"
              value={form.reg}
              placeholder="e.g. 0446/62"
              autoComplete="off"
              onChange={set("reg")}
            />
          </Field>
          <Field label="Contact number">
            <input type="tel" value={form.phone} autoComplete="tel" onChange={set("phone")} />
          </Field>
        </div>
      </div>

      {!ready && (
        <div className="leave-pending">
          {problems.map((p) => <p key={p}>{p}</p>)}
        </div>
      )}

      {draft.route && (
        <DraftPanel
          draft={draft}
          steps={HALL_DRAFT_STEPS}
          pdfFile={ready ? NO_FORM : null}
          onDownload={null}
          mailName="the booking request"
          attached={ids.copies.length > 1 ? "the photo IDs attached" : "the photo ID attached"}
          idle={`The mail goes into your Gmail Drafts with the ${ids.copies.length > 1 ? "photo IDs" : "photo ID"} attached. You press Send there. The first time, Google asks you to allow this.`}
        />
      )}
      {!draft.route && (
        <>
          <div className="leave-acts single">
            {formReady ? (
              <a
                className="btn leave-send"
                href={sendHref}
                {...(phone ? {} : { target: "_blank", rel: "noopener" })}
                onClick={() => track("hall_booking", "send")}
              >
                Send Mail
              </a>
            ) : (
              <button className="btn leave-send" disabled>Send Mail</button>
            )}
          </div>
          {formReady && (
            <p className="leave-saved">
              Attach the guest&apos;s photo ID in the mail before sending.
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
            <Line label="To" value={HALL_TO.join(", ")} copied={copied === "to"}
                  onCopy={() => copy("to", HALL_TO.join(", "))} />
            {formReady ? (
              <>
                <Line label="Subject" value={subject} copied={copied === "subject"}
                      onCopy={() => copy("subject", subject)} />
                <div className="leave-body">
                  <div className="leave-line-head">
                    <span className="leave-line-label">Mail</span>
                    <CopyButton copied={copied === "body"} onCopy={() => copy("body", body)} />
                  </div>
                  {/* Shown as it will look in Gmail: the same markup the
                      draft carries, every value escaped. */}
                  {/* eslint-disable-next-line react/no-danger */}
                  <div className="hall-preview" dangerouslySetInnerHTML={{ __html: hallHtml(form) }} />
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
