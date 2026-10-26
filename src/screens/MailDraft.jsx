import { useEffect, useMemo, useRef, useState } from "react";
import { isIOS, isAndroid } from "../lib/platform";
import { track } from "../lib/track";
import Splash from "./Splash";
import {
  askGoogle, takeRoundTrip, finishRoundTrip, heldToken, dropToken,
  mimeMessage, rawOf, saveDraft, lastDraft, gmailOpenHref,
} from "../lib/gmaildraft";
import {
  ID_ACCEPT, MAX_PDF_BYTES, MAX_ID_COPIES, MAX_TOTAL_BYTES, prepareIdCopy, namedIdCopies,
  idCopiesBytes, holdIdCopies, heldIdCopies, dropIdCopy,
} from "../lib/idcopy";

/**
 * What the mail screens share: the Gmail draft — the
 * whole mail, addressed, written and with its attachments, put in the
 * student's own Drafts for them to send — and the small pieces of form both
 * screens are built from.
 *
 * Moved here from the leave mail when the guest entry form arrived, as it
 * was: the round trip to Google's permission page, the loader over the
 * screen, the draft owed on the way back and what to say when any of it
 * fails. Two copies of that would drift apart, and the one that drifted
 * would be the one nobody tested on a phone.
 */

/** The least time each of the loader's steps is on show, in milliseconds. */
const STEP_MS = 700;
/** How long "Opening Gmail…" may stay up if the page never loses sight. */
const OPENING_MS = 10_000;
const pause = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** What to say when the trip to Google's permission page came back wrong. */
function tripMessage(error) {
  return error === "access_denied"
    ? "Google's permission wasn't given, so no draft was made."
    : "Google's permission page didn't come back properly. Try Create Gmail draft again.";
}

/**
 * The Gmail draft for one screen.
 *
 *   kind      "leave" | "guest" — which draft, and which screen a trip to
 *             Google comes back to
 *   event     the usage-count event its taps are counted under
 *   enabled   whether drafts are on at all (a Google client ID is set)
 *   compose   async () => { to, cc, subject, body, files } — read at the
 *             moment of drafting, so it is always the form as it stands
 *   hold      true while something the draft needs is still being restored
 *             after a trip (the guest's ID copy); an owed draft waits for it
 *   onMade    called once a draft is in Gmail
 */
export function useGmailDraft({
  kind, event, email, enabled, ready, pdfFile, pdfFailed, formKey, compose,
  hold = false, onMade = null,
}) {
  // The old way, for a student whose draft didn't happen — Google refused,
  // or Gmail did. Only for this visit; next time the draft is tried again.
  const [classic, setClassic] = useState(false);
  const route = enabled && !classic;
  const platform = isIOS() ? "ios" : isAndroid() ? "android" : "web";

  // What a trip to Google's permission page left behind, read once.
  const [trip] = useState(() => (enabled ? takeRoundTrip(Date.now(), kind) : { pending: false }));
  const [made, setMade] = useState(() => (enabled ? lastDraft(kind) : null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => (trip.error ? tripMessage(trip.error) : ""));
  const madeThis = made?.key === formKey ? made : null;

  // The loader over the whole screen while the draft is made: a key of the
  // steps, or null. Back from Google with a draft owed, it is up from the
  // first frame, carrying on from the opening screen that said the same.
  const [step, setStep] = useState(() => (trip.pending && !trip.error ? "drafting" : null));
  // Bumped when the loader comes down, to bring the outcome — Open Gmail, or
  // what went wrong — into view. The button sits at the foot of a long form,
  // and the return from Google lands at the top of it.
  // A trip that came back refused lands straight on what went wrong.
  const [landed, setLanded] = useState(() => (trip.error ? 1 : 0));
  const outcome = useRef(null);
  useEffect(() => {
    if (landed) outcome.current?.scrollIntoView({ block: "center" });
  }, [landed]);
  const settle = () => {
    setStep(null);
    setLanded((n) => n + 1);
  };

  // Backing out of Google's page can return to this page as it was left —
  // loader and all, from the back-forward cache — with nothing left to end it.
  useEffect(() => {
    const back = (e) => { if (e.persisted) setStep(null); };
    window.addEventListener("pageshow", back);
    return () => window.removeEventListener("pageshow", back);
  }, []);

  const makeDraft = async ({ afterTrip = false } = {}) => {
    if (!pdfFile || busy) return;
    setStep("drafting");
    const token = heldToken(email);
    if (!token) {
      track(event, "draft-ask");
      // Straight from the tap, not a frame later: the loader still paints,
      // since the page stays up until Google's answers, and a trip started
      // by a tap is the one an installed Android app keeps as its own.
      askGoogle(email, kind);
      return;
    }
    setBusy(true);
    setError("");
    let leaving = false;
    try {
      const raw = rawOf(mimeMessage(await compose()));
      // Each step stays up long enough to be read. Writing the mail takes no
      // time at all; the upload, which is where the form goes in, takes what
      // it takes.
      await pause(STEP_MS);
      setStep("attaching");
      const [draft] = await Promise.all([saveDraft(token, raw, formKey, kind), pause(STEP_MS)]);
      setMade(draft);
      track(event, "draft");
      onMade?.();
    } catch (err) {
      if (err?.status === 401 && !afterTrip) {
        // The hour ran out: ask again, which comes back here and retries.
        // Expected, so not counted as a failure.
        dropToken();
        leaving = true;
        askGoogle(email, kind);
        return;
      }
      track(event, "draft-error");
      if (err?.status === 401 || err?.status === 403) dropToken();
      setError(err?.status === 401 || err?.status === 403
        ? "Gmail didn't accept the permission. Try again, and choose Allow on Google's page."
        : err?.tooLarge
          ? "Gmail refused a mail that large. Remove a PDF, or use a photo of the ID instead."
          : "Couldn't reach Gmail. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (!leaving) settle();
    }
  };

  // Back from Google with a draft owed: make it as soon as the form PDF is
  // ready again. The ref, not state, keeps a double-run effect (React's
  // development checks do exactly that) from making two. A form that can't
  // be made — it fails its checks, or the PDF won't build — drops the loader
  // rather than leaving it up forever, and the screen says what's wrong.
  const owed = useRef(trip.pending && !trip.error);
  useEffect(() => {
    if (!owed.current) return;
    if (hold) return;
    if (ready && !pdfFile && !pdfFailed) return;
    owed.current = false;
    finishRoundTrip(kind);
    if (pdfFile) makeDraft({ afterTrip: true });
    else settle();
    // makeDraft reads the current render's form, which is the one wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, pdfFile, pdfFailed, hold]);
  useEffect(() => { if (trip.error) finishRoundTrip(kind); }, [trip.error, kind]);

  const label = ready && !pdfFile && !pdfFailed ? "Preparing…"
    : busy ? "Creating draft…"
    : made && !madeThis ? "Update Gmail draft"
    : "Create Gmail draft";

  return {
    route, setClassic, platform, trip, made, madeThis, busy, error, step, outcome,
    makeDraft, label, email, event,
  };
}

/**
 * The draft's half of the screen: Create Gmail draft and Download form, then
 * — once made — Open Gmail, and whatever went wrong. `mailName` is how the
 * student finds it in Drafts ("the leave mail"); `attached` says what went in.
 * `pdfFile` is set when the draft can be made; `canDownload` when the form
 * alone can be saved, which for the guest entry is before its ID is picked.
 * A mail with no form of its own (the hall booking) passes no `onDownload`,
 * and there is nothing to download.
 */
export function DraftPanel({
  draft, steps, pdfFile, canDownload = Boolean(pdfFile), onDownload, mailName, attached, idle,
  saved = null,
}) {
  const { platform, madeThis, made, busy, error, step, trip, outcome, makeDraft, label } = draft;

  // "Opening Gmail…" from the tap until Gmail is in front. Gmail taking a
  // second or two to come up left the button looking as if the tap hadn't
  // registered, and it got tapped again. The page going out of sight — the
  // app switch on a phone, the new tab on a laptop — is the one sign there is
  // that Gmail opened; the timeout covers a tap that opened nothing.
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    if (!opening) return undefined;
    const done = () => setOpening(false);
    const hidden = () => { if (document.visibilityState === "hidden") done(); };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", done);
    window.addEventListener("blur", done);
    const timer = setTimeout(done, OPENING_MS);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", done);
      window.removeEventListener("blur", done);
      clearTimeout(timer);
    };
  }, [opening]);

  return (
    <>
      {step && <Splash message={steps[step]} draw={!trip.pending} task />}
      {madeThis ? (
        // Done but for the Send, and Open Gmail is the one thing left to
        // do — so it stands alone, full width and in the signal colour,
        // with the form's download stepped down to a link beneath it. Two
        // equal buttons side by side read as a choice, when only one of
        // them finishes the job.
        <div className="leave-ready" ref={outcome}>
          <p className="leave-ready-head">
            <TickIcon /> Draft ready in Gmail
          </p>
          <p className="leave-saved">
            Addressed, with {attached}.{" "}
            {platform === "web"
              ? "Open it, check it and press Send."
              : `In Gmail, open Drafts, tap ${mailName} and press Send.`}
          </p>
          {/* A link, so the app opens from the tap itself — a phone opens
              another app only straight from a tap. On a laptop it goes
              into the draft, in a tab of its own. */}
          <a
            className="btn block leave-open"
            href={gmailOpenHref({ platform, email: draft.email, messageId: madeThis.messageId })}
            {...(platform === "web" ? { target: "_blank", rel: "noopener" } : {})}
            aria-busy={opening}
            onClick={() => {
              setOpening(true);
              track(draft.event, "draft-open");
            }}
          >
            {opening
              // One span, so the button's flex gap doesn't part the dots
              // from the word.
              ? <span>Opening Gmail<LoadingDots /></span>
              // A phone opens the Gmail app at the inbox, not the draft, so
              // the label spells out the path from there instead of promising
              // the draft itself. Broken by hand: left to wrap, it split the
              // steps mid-path. A laptop's tab does open the draft.
              : platform !== "web"
                ? <span>Click to open Gmail →<br />Drafts → Edit Draft → Send</span>
                : <>Open Gmail drafts and send mail<ArrowIcon /></>}
          </a>
          {onDownload && (
            <button type="button" className="leave-retry leave-alt" onClick={onDownload}>
              Download the form as well
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={`leave-acts${onDownload ? "" : " single"}`} ref={outcome}>
            <button
              className="btn leave-send"
              disabled={!pdfFile || busy}
              onClick={() => makeDraft()}
            >
              {label}
            </button>
            {onDownload && (
              <button className="btn ghost leave-send" disabled={!canDownload} onClick={onDownload}>
                Download form
              </button>
            )}
          </div>
          {busy ? null : made ? (
            <p className="leave-saved">
              The form has changed since the draft was made. Update it, and the
              draft in Gmail is replaced.
            </p>
          ) : !error && (
            <p className="leave-saved">{idle}</p>
          )}
        </>
      )}
      {error && (
        <div className="leave-pending">
          <p>
            {error}{" "}
            <button type="button" className="leave-retry" onClick={() => draft.setClassic(true)}>
              Send it the usual way
            </button>
          </p>
        </div>
      )}
      {saved}
    </>
  );
}

/* ---------- the guest's ID copies ----------
   The one attachment the app can't make and must be given. Shared by every
   mail that carries one (guest entry, hall booking); see src/lib/idcopy.js
   for where the copies are and aren't kept. */

/**
 * The IDs picked on one screen.
 *
 *   kind     the draft kind, whose trip to Google they are held across
 *   slot     where on the phone they are held, one per mail
 *   enabled  whether drafts are on — only a draft's trip needs them held
 *   initial  copies to start with, for the smoke test only
 *
 * As many as the student picks, up to MAX_ID_COPIES and a total Gmail will
 * take in one draft. Named by their order ("Guest ID 1", "Guest ID 2") only
 * when they go out.
 */
export function useIdCopies({ kind, slot, enabled, initial = null }) {
  const [copies, setCopies] = useState(initial ?? []);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const picker = useRef(null);
  const named = useMemo(() => namedIdCopies(copies), [copies]);

  const keep = (next) => {
    setCopies(next);
    if (next.length) holdIdCopies(next, slot);
    else dropIdCopy(slot);
  };

  const pick = async (e) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";               // so picking the same file again still fires
    if (!files.length) return;
    setBusy(true);
    setError("");
    const next = [...copies];
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
    keep(next);
    setError([...errors].map((code) => ({
      "too-big": `A PDF over ${Math.round(MAX_PDF_BYTES / 1048576)} MB was left out. A photo of the ID works too.`,
      type: "Only photos and PDFs can be added.",
      count: `Up to ${MAX_ID_COPIES} IDs can go in one mail.`,
      total: `Together the IDs would be over ${Math.round(MAX_TOTAL_BYTES / 1048576)} MB, too large for one mail. Photos are smaller than PDFs.`,
      unreadable: "An image couldn't be read. Try a JPEG or PNG photo, or a PDF.",
    }[code])).join(" "));
    setBusy(false);
  };
  const remove = (index) => {
    setError("");
    keep(copies.filter((_, i) => i !== index));
  };

  // Restoring from the very first render, not from the effect that does it.
  // The draft owed after a trip looks at the form before any effect has
  // put the IDs back, and a form with no ID yet looked like one that could
  // never be drafted: it gave up, and the student had to tap Create Gmail
  // draft a second time. The trip is the one the draft hook reads; it is
  // held once per page, so asking here doesn't use it up.
  const returning = () => {
    const trip = takeRoundTrip(Date.now(), kind);
    return trip.pending && !trip.error;
  };
  const [restoring, setRestoring] = useState(() => Boolean(enabled && !initial && returning()));

  // Back from Google, the copies held for the trip are put back before the
  // owed draft is made. Any other visit clears what an earlier one may have
  // left, and leaving the screen clears it too — but only once the arrival
  // has settled: React's development checks mount a screen twice, and a
  // clear between the two would delete what the second mount puts back.
  const settled = useRef(false);
  useEffect(() => {
    if (initial) return undefined;
    let live = true;
    if (enabled && returning()) {
      setRestoring(true);
      heldIdCopies(Date.now(), slot).then((got) => {
        if (!live) return;
        if (got.length) setCopies(got);
        setRestoring(false);
        settled.current = true;
      });
    } else {
      dropIdCopy(slot);
      settled.current = true;
    }
    return () => {
      live = false;
      if (settled.current) dropIdCopy(slot);
    };
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** What the draft key needs: a different set is a different mail. */
  const key = copies.map((c) => `${c.type}:${c.bytes.length}`).join(",") || "no-id";

  return { copies, named, error, busy, restoring, picker, pick, remove, key };
}

/** The picker: what has been chosen, each removable, and a button to add
 *  more. A button over a hidden input, so it looks like the rest of the
 *  form; images and PDFs both, since an ID is as often a photo as a scan. */
export function IdPicker({ ids, label = "Guest ID" }) {
  const { named, copies, busy, restoring, error, picker, pick, remove } = ids;
  return (
    <div className="leave-field guest-id">
      <span>{label}</span>
      <input ref={picker} type="file" accept={ID_ACCEPT} multiple onChange={pick} hidden />
      {named.map((c, i) => (
        <div className="guest-id-chosen" key={`${i}-${c.bytes.length}`}>
          <div className="guest-id-name">
            {c.name}
            <em>{Math.max(1, Math.round(c.bytes.length / 1024))} KB</em>
          </div>
          <button type="button" className="leave-copy" onClick={() => remove(i)}>
            Remove
          </button>
        </div>
      ))}
      {copies.length < MAX_ID_COPIES && (
        <button
          type="button"
          className="btn ghost guest-id-pick"
          disabled={busy || restoring}
          onClick={() => picker.current?.click()}
        >
          {busy || restoring ? "Preparing…" : copies.length ? "Add another ID" : "Choose photos or PDFs"}
        </button>
      )}
      {error && <p className="leave-warn">{error}</p>}
    </div>
  );
}

export function TickIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="9" cy="9" r="8" fill="currentColor" />
      <path d="m5.4 9.2 2.4 2.4 4.8-5.2" stroke="#fff" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Three dots that light up in turn, so "Opening Gmail" reads as under way
 *  rather than stuck. Each keeps its space while dim, so the label never
 *  shifts. Hidden from screen readers, which have aria-busy instead. */
function LoadingDots() {
  return (
    <span className="loading-dots" aria-hidden="true">
      <i /><i /><i />
    </span>
  );
}

/** Points onward: Open Gmail leaves the app for the last step. */
export function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.5 9h11m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The optional marker sits on the label's own line, where the eye already
 *  is, rather than under a box that has to be read past first. */
export function Field({ label, optional = false, children }) {
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

export function Line({ label, value, copied, onCopy }) {
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

export function CopyButton({ copied, onCopy }) {
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
export async function copyText(value) {
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
