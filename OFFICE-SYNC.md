# MBA office attendance sync — interface contract

What the MBA office attendance system (the "sender") must send to IIMPresent
(the "receiver"), and what IIMPresent does with it.

Hand this whole file to the project building the office system.

**Sections 1–6 are the sender's side of the contract — the part to build.**
Sections 7–9 describe what IIMPresent does with what arrives. They are here so
the sender's authors can see why each field is asked for, and are **not** work
for that project: the tables, policies and screens in them belong to IIMPresent
and already have an owner.

Where this file says "tell the IIMPresent side", it means raise it with the
maintainer of this repo — some of the choices below are open, and the wrong
answer assumed silently is worse than a question asked.

**What's sent, nightly:** for every student — the subjects they're enrolled in,
a status for every session date in each subject, and the office's own totals per
subject.

**One-way.** The office record is authoritative. IIMPresent only reads it, never
writes back, never recomputes the percentage, and never lets it touch a
student's own marks.

**Not peers.** The office's session list is the set of sessions that happened;
the app's timetable is only a prediction of it. So a disagreement between them is
a fact about the app's timetable, not a fault in either record, and it is
reported once, from the office's side — never as two complaints about one event.
This is the rule that keeps a single rescheduled class from filling a section's
Profile screens with noise; see §5.

---

## 1. Transport

```
POST https://<project-ref>.supabase.co/functions/v1/ingest-office-attendance
content-type: application/json
```

Push, not pull. The sender decides when a day's marking is actually finished; a
puller on a timer would eventually arrive mid-update and read a half-processed
day. Push also means the office server needs no inbound port open to the
internet — only outbound HTTPS.

The endpoint is a Supabase Edge Function deployed with `--no-verify-jwt`,
because the sender is a server with no Supabase user account and so has no JWT
to present. **That makes the signature in §2 the only thing standing between
the internet and this endpoint.** It is verified before the body is parsed.

## 2. Authentication — HMAC-SHA256, not a bearer token

| Header | Value |
|---|---|
| `x-iimp-key-id` | `k1` — names which shared secret was used, so it can be rotated without downtime |
| `x-iimp-timestamp` | Unix seconds when the request was signed |
| `x-iimp-signature` | Hex HMAC-SHA256 over the exact string `<timestamp>.<raw request body>` |

Sign the **raw body bytes** you are about to send, not a re-serialised copy — key
order and whitespace are part of what is signed.

Rejected with 401: a bad signature, a timestamp more than 300 s from the
receiver's clock, an unknown `key-id`. Rotation: the receiver accepts `k1` and
`k2` during the overlap, the sender switches to `k2`, then `k1` is dropped.

A bearer token was the alternative. HMAC is better because a token that leaks
into a proxy log, an error report or a screenshot is replayable forever, while a
signature is bound to one body and a five-minute window.

```bash
supabase secrets set OFFICE_SYNC_KEY_K1=$(openssl rand -hex 32)
```

The secret is generated on the IIMPresent side and handed over once, out of
band. Never in either repo, never in a committed `.env`, never pasted into a
chat.

### No static IP: what stands in for the allowlist

An IP allowlist was offered as a second layer. The sender has no static egress
address, so it isn't available and the signature is the only thing
authenticating the caller. That is sound on its own — an HMAC is not weakened by
the caller moving — but two things follow from it.

**Where the secret lives becomes the entire security boundary.** It must be read
at run time from a managed secret store: GitHub Actions secrets, the cloud
runner's environment, a secrets manager. Not a file on a laptop, not a shell
profile, not the repo. **If the nightly job is meant to run from someone's
laptop, move it to a scheduled cloud runner before it holds a real key.** A
laptop is a poor custodian for a long-lived shared secret and a worse one for a
job that has to run every night whether or not the lid is open.

**Prevention gives way to detection.** Rotate on a fixed cadence — 90 days — and
immediately on any suspicion; the `key-id` header exists so rotation costs no
downtime. The receiver logs every 401 and alerts on a burst of them. With the
endpoint reachable by anyone, noticing replaces blocking.

The receiver checks cheapest-first, so unauthenticated traffic costs it almost
nothing: oversized body, then missing or malformed headers, then a timestamp
outside the 300 s window, and only then the HMAC.

Worth knowing how small the blast radius is. This endpoint only writes, only to
the office mirror tables, and a complete batch replaces them every night. Someone
holding the key could write false office attendance. They could not read a single
student's record — there is no GET — could not touch `public.attendance`, where
students' own marks live, and anything they wrote would be overwritten by the
next night's send. A leaked sender key is a corruption problem with a
twelve-hour half-life, not a data breach.

## 3. Envelope

```json
{
  "contract": 1,
  "batch_id": "6f1a3c9e-...",
  "page": 1,
  "pages": 312,
  "generated_at": "2026-09-20T03:10:00+05:30",
  "as_of": "2026-09-19",
  "term": "V",
  "complete": true,
  "dry_run": false,
  "enrolments": [ ... ],
  "sessions":   [ ... ],
  "totals":     [ ... ]
}
```

| Field | Meaning |
|---|---|
| `contract` | Always `1`. Bump only for a breaking change; the receiver rejects a version it doesn't know rather than guessing. |
| `batch_id` | One UUID per nightly run, shared by all its pages. |
| `page` / `pages` | 1-based, sent sequentially. |
| `generated_at` | When the batch was built. ISO 8601 **with offset** — `+05:30`, never a bare local time. |
| `as_of` | The last class date the office has finished processing. See §5. |
| `term` | The term these records belong to. |
| `complete` | `true` if this batch covers every student and every subject for the term. Normal case; see §6. |
| `dry_run` | `true` validates everything and writes nothing. Use it while building. |

A page may carry any mix of the three arrays; they don't have to be sent in
separate batches.

## 4. The three arrays

### `enrolments[]` — what the student is officially registered for

```json
{
  "student_email": "rahul.sharma2026@email.iimcal.ac.in",
  "roll_no": "2026PGP123",
  "course_code": "PGP2-MKT-401",
  "course_title": "Marketing Research",
  "section": "C",
  "instructor": "Prof. A. Banerjee"
}
```

`student_email` is the institute Google address the student signs in with,
lowercased — that is the identity IIMPresent keys on, because sign-in is Google
restricted to `@email.iimcal.ac.in`. If the office system holds only roll
numbers, it must send a roll → email map before the first batch, and `roll_no`
stays an audit trail only.

`course_code` must be stable across the term. `instructor` is optional and used
only to help a human confirm a course mapping is right.

### `sessions[]` — a status per session date

```json
{
  "student_email": "rahul.sharma2026@email.iimcal.ac.in",
  "course_code": "PGP2-MKT-401",
  "class_date": "2026-09-18",
  "start_time": "11:45",
  "status": "absent",
  "raw_status": "A",
  "counts": true,
  "session_no": 7,
  "rescheduled": true
}
```

- **`start_time`** — required, 24-hour `HH:MM`. Together with the date it's what
  identifies a session: sixteen Term V courses run two back-to-back sittings of
  the same subject on one day, so a date alone is not unique. Send the **scheduled**
  slot as the timetable prints it, not the minute the class actually began (§5).
- **`status`** — a closed set: `present`, `absent`, `excused`, `not_held`,
  `unmarked`. `unmarked` means the office has the session but no mark yet, which
  is *not* the same as absent and must never be shown as one. `not_held` is the
  office's cancellation; it's displayed only and never cancels anything in the
  app.
- **`raw_status`** — the sender's own string, verbatim (`"A"`, `"ML"`, `"DL"`).
  Kept for debugging a bad mapping; never shown to students.
- **`counts`** — does this session count toward the denominator? Medical and duty
  leave rules are the office's, so the office states the answer rather than the
  app inferring it.
- **`session_no`** — optional. Which meeting of the course this was: 7 of the
  term's 20. Cheap to produce (it's a row number) and it makes reschedule
  matching exact instead of heuristic (§5).
- **`rescheduled`** — optional boolean. Just "this one didn't run in its usual
  slot", with no detail about where it moved from. Even this much removes most
  of the guesswork (§5).

`session_no` and `rescheduled` are both optional, and the receiver assumes
neither will arrive. §5 describes what it does with nothing but a date and a
time. Send either if it's cheap; neither is worth building new tracking for.

### `totals[]` — the official number

```json
{
  "student_email": "rahul.sharma2026@email.iimcal.ac.in",
  "course_code": "PGP2-MKT-401",
  "held": 18,
  "attended": 15,
  "excused": 1,
  "percent": 83.33,
  "standing": "ok",
  "source_updated_at": "2026-09-19T19:04:11+05:30"
}
```

**Still required, even though the session rows are now there.** IIMPresent
displays `percent` exactly as sent and never adds up the sessions to get it: the
office's rounding, leave handling and definition of "held" are its own, and a
figure the app computed itself would eventually disagree with the figure that
decides a student's term. The sessions answer *which class*; `totals` is the
number with authority.

`standing` is the office's own verdict (`ok` / `watch` / `short`), or `null` if
it doesn't produce one. The app will not invent it.

### Do not send

Names, phone numbers, addresses, grades, marks, fee status, disciplinary notes.
The receiver rejects unknown fields. Minimum data for the job, so a breach costs
as little as possible.

## 5. The parts most likely to go wrong

### `start_time` — send the scheduled slot, not the actual one

Date plus start time is what makes a session unique, on both sides. IIMPresent's
own attendance table is keyed on `(user_id, subject, class_date, start_time)`,
with the comment *"the slot has to be part of the identity or the second mark
overwrites the first"*, because sixteen Term V courses run two back-to-back
sittings of one subject in a day. The office table uses the same key, which is
what lets a dispute be pinned to an exact slot rather than a whole day.

The subtlety is *which* time. If the office records the minute the class actually
began — 10:22 for a lecture that was slotted at 10:15 — then nothing joins,
because the app knows only the published slot. Every session would look like a
mismatch, on every course, for every student.

So: **send the scheduled start time exactly as the published timetable shows it.**

The receiver doesn't trust that blindly, because the cost of being wrong is the
whole feature looking broken. Within a given student, course and date it pairs
the two sides **in time order** rather than demanding equal strings, so a
systematic offset still lines up correctly. Exact times make that pairing
trivially right; the tolerance only exists so a five-minute discrepancy can't
manufacture thousands of false alarms. If the *number* of sittings differs
between the two sides, that's a schedule disagreement, reported separately (§9).

"Scheduled" means the slot the session actually occupied *as amended*. A class
moved to 19:00 is sent as `19:00`, not as the 10:15 it was originally due at —
there is no whitelist of official slots on either side, and IIMPresent stores
arbitrary times already. See the next subsection for what makes it a reschedule.

### Rescheduled sessions

Classes get moved, sometimes to hours that were never a timetable slot. Handled
naively this is what makes the comparison produce nonsense, because a single
moved class looks like **two** faults: an office session on a date the app has no
class for, and an app session the office has no record of. Across a section where
most students never recorded the move, the Profile screen fills with warnings
that are all one event.

The office is not being asked where a session moved from. So the receiver is
built on this footing instead:

**The office's session list is the set of sessions that happened. The app's
timetable is only a prediction of it.** They are not two peers to be
reconciled — one outranks the other, and a disagreement is a fact about the
app's timetable, not a fault in either record.

That reframing alone fixes the doubled-warning problem, because an unmatched pair
is reported once, from the office's side, as a single statement of what the
office has. Matching then only decides how specific that statement can be:

1. **`session_no` present** — pair by it. Meeting 7 is meeting 7 whether it ran
   on Tuesday or the following Saturday. Exact, no heuristics.
2. **`rescheduled` present** — the flagged session is known not to be in its
   usual slot, so the receiver looks for the displaced app session rather than
   treating both as errors.
3. **Neither** — pair by **position within the course**: sort both sides by
   date and time, and line them up in order. A moved class almost always keeps
   its place in the sequence. This beats matching on date proximity, and it
   handles several moves in a term as long as none of them jumps over another
   session of the same course.
4. **Pairing by position disagrees with itself** — the two sides have different
   session counts, or an ordinal pairing implies a jump of more than ~14 days —
   the receiver stops guessing, proposes nothing, and shows the two lists as
   they are.

Nothing is ever applied automatically; see §9. A wrong guess moves a student's
attendance mark to the wrong day, which is worse than admitting two records
don't line up.

### Does the feed include sessions that haven't happened yet?

**Open question — please answer it.** If the office's list ever contains
*upcoming* sessions, not only conducted ones, it makes reschedules observable
rather than inferred, and item 3 above stops being load-bearing. The receiver keeps
each night's batch, so a session that was listed for 17 Sep yesterday and is
listed for 19 Sep today is a move the office *told* us about, without anyone
adding a field. If the feed only ever contains conducted sessions, this is
unavailable and item 3 above is the fallback.

### `as_of` — because the app is always slightly ahead

A student taps present at 10:15; the office processes that day overnight. Between
those two moments the app has a mark the office doesn't. Without a stated cutoff,
**every student would see a phantom discrepancy every afternoon**, learn within a
week that it's always nonsense, and ignore the warning on the day it's real.

`as_of` is the last class date the office has finished processing. The app
compares only its own marks on or before that date, and shows "counts classes up
to 19 Sep" on screen. It's also what distinguishes "the office has no row for
20 Sep because it hasn't got there yet" from "the office says no class was held".

## 6. Cadence, paging, responses

**Every night, send the whole term for every student.** Not a delta. Rough size:
1,000 students × 5 subjects × up to 30 sessions ≈ **150,000 session rows**, plus
5,000 enrolment and 5,000 totals rows. At 500 rows a page that's ~320 requests —
a few minutes at 03:00, and comfortably inside Supabase's limits.

A full nightly send is worth that cost because it is self-healing: a row lost to
a dropped connection, a correction the office made retroactively, a bug in last
week's export — all of it fixes itself the next night with no repair step and no
watermark logic to get subtly wrong.

If that turns out to be too heavy on the office's servers, the fallback is
sessions from the last 14 days nightly plus one full send weekly. Tell the
IIMPresent side and both will be supported — but don't switch silently, because
the reconciliation in the next paragraph depends on knowing which it's getting.

Limits: **≤ 500 rows per request** (counting all three arrays together), pages
sequential, never parallel. Rows may be split across pages however is
convenient — every row carries its own full key, so each is applied
independently and a page boundary can fall anywhere.

On a 5xx or a network failure, retry the same page with the same `batch_id`,
`page` and body, backing off 2 s, 4 s, 8 s, 16 s, 30 s. An identical re-send is
a no-op, so retrying is always safe.

When the final page of a `complete: true` batch lands, anything left over from an
older batch — a subject no longer enrolled, a session the office removed — is
marked stale rather than shown. This is why `complete` exists: a partial batch
must never trigger that sweep.

```json
{ "ok": true, "batch_id": "6f1a3c9e-...", "page": 1,
  "accepted": 498, "quarantined": 2, "errors": [] }
```

| Status | Meaning | Sender should |
|---|---|---|
| 200 | Applied, or an identical page already applied | Continue |
| 400 | Malformed body or unknown `contract` | Stop, fix, do not retry |
| 401 | Signature, timestamp or key-id rejected | Stop, alert a human |
| 409 | Same `batch_id`+`page`, **different** body | Stop — a batch was rebuilt mid-send |
| 413 | Over the row limit | Re-page smaller |
| 5xx | Receiver's fault | Retry with backoff |

A page applies atomically: all its rows or none. Rows that can't be placed — an
unmapped `course_code`, an email outside the allowed domain, `attended > held`, a
session with no matching enrolment — are *quarantined*, not rejected: the page
still returns 200, the bad rows go to a review table, and `errors[]` names each by
`row_index` with a reason. One unmapped course must not block 150,000 good rows.

An email with no IIMPresent account is **not** an error. The rows are stored
against the email and appear the moment that student first signs in.

---

## 7. Receiver: tables

```sql
-- Official enrolment. Also drives the "your course list doesn't match" check.
create table public.office_enrolment (
  student_email text not null check (student_email = lower(student_email)),
  course_code   text not null,
  course_title  text not null default '',
  section       text not null default '',
  term          text not null default '',
  instructor    text,
  batch_id      uuid not null,
  synced_at     timestamptz not null default now(),
  stale         boolean not null default false,
  primary key (student_email, course_code)
);

-- The office's per-session record. Keyed on the slot as well as the date, for
-- the same reason public.attendance is: two sittings of one subject in a day
-- are two sessions, and a date-only key lets the second overwrite the first.
create table public.office_attendance (
  student_email text not null check (student_email = lower(student_email)),
  course_code   text not null,
  class_date    date not null,
  start_time    time not null,
  status        text not null
                check (status in ('present','absent','excused','not_held','unmarked')),
  raw_status    text not null default '',
  counts        boolean not null default true,
  batch_id      uuid not null,
  synced_at     timestamptz not null default now(),
  stale         boolean not null default false,
  primary key (student_email, course_code, class_date, start_time)
);

-- The official numbers, stored as sent. Never recomputed from the rows above.
create table public.office_course_totals (
  student_email     text not null check (student_email = lower(student_email)),
  course_code       text not null,
  held              integer not null check (held >= 0),
  attended          integer not null check (attended >= 0),
  excused           integer not null default 0,
  percent           numeric(5,2),
  standing          text,
  as_of             date not null,
  source_updated_at timestamptz not null,
  batch_id          uuid not null,
  synced_at         timestamptz not null default now(),
  stale             boolean not null default false,
  primary key (student_email, course_code),
  check (attended <= held)
);

-- Office course code -> the subject string used by classes/attendance.
-- Filled in by hand. An unmapped code quarantines its rows and is reported,
-- the same way a stale CORRECTIONS entry fails a build on purpose.
create table public.office_course_map (
  course_code text primary key,
  subject     text not null,
  note        text
);

-- Rows that arrived but couldn't be placed. Holds PII; service-role only;
-- purge on a 30-day schedule.
create table public.office_sync_rejects (
  id bigserial primary key,
  batch_id uuid not null, page integer not null, row_index integer not null,
  reason text not null, payload jsonb not null,
  received_at timestamptz not null default now()
);

-- Idempotency: the body hash is what makes a retry a no-op and a rebuilt
-- batch a 409.
create table public.office_sync_log (
  batch_id uuid not null, page integer not null,
  body_sha256 text not null, rows integer not null,
  received_at timestamptz not null default now(),
  primary key (batch_id, page)
);
```

## 8. Receiver: access control

```sql
alter table public.office_enrolment      enable row level security;
alter table public.office_attendance     enable row level security;
alter table public.office_course_totals  enable row level security;

-- Select only. There is deliberately no insert/update/delete policy, so no
-- signed-in user can write these tables at all; the ingest function writes with
-- the service-role key, which bypasses RLS.
create policy "read own office enrolment" on public.office_enrolment
  for select using (lower(auth.jwt() ->> 'email') = student_email);

create policy "read own office record" on public.office_attendance
  for select using (lower(auth.jwt() ->> 'email') = student_email);

create policy "read own office totals" on public.office_course_totals
  for select using (lower(auth.jwt() ->> 'email') = student_email);
```

`office_course_map` is readable by any authenticated user (it's just course
names). `office_sync_rejects` and `office_sync_log` get RLS enabled and **no
policy at all** — service role only.

Contrast with `public.attendance`, whose policy is `for all using (auth.uid() =
user_id)`. Full write access is correct there, because that table is written from
the browser with the student's own token — and would be a hole here.

## 9. Receiver: what the student sees

On Profile, below the existing `Stats` block:

> **MBA office record** — counts classes up to 19 Sep
> Marketing Research **15/18 · 83.3%**
> Operations **12/17 · 70.6%** ⚠️ below 75%
>
> *18 Sep, 11:45 — Marketing Research. You marked present, the office has you
> absent.*

- The `as_of` date is always on screen, so a lagging sync is never mistaken for a
  live one. If it's more than 48 h old, say so plainly instead of showing a
  confident number.
- Mismatches are found by joining `office_course_map.subject` + `class_date` +
  `start_time` — exactly the identity `public.attendance` already uses — for
  dates on or before `as_of`, with the in-day pairing fallback from §5 when the
  times don't line up exactly.
- If the office has a different *number* of sittings for a date than the app has
  scheduled, that's a schedule disagreement, not a marking one. It goes to the
  maintainer's view, not to the student as a warning.
- **Reschedule mismatch** — "the office recorded Marketing Research on 19 Sep at
  19:00; your timetable has it on 17 Sep at 10:15. Was it moved?" — is offered,
  never applied. One tap runs the existing `setOverride` flow
 , which writes the `session_overrides` row
  and carries any mark already made across to where the class actually happened.
  Auto-applying it would rewrite a student's timetable and move their attendance
  on the strength of a heuristic; a proposal costs one tap and can be wrong
  safely.
- When the receiver can't pair confidently (§5 item 4) the wording drops the
  claim rather than the information: "the office has a Marketing Research session
  on 19 Sep at 19:00 that isn't on your timetable." True regardless of what
  moved where, and still enough to act on.
- `unmarked` sessions are shown as awaiting the office, never as absent.
- A `held` figure that disagrees with the app's own session count is a different
  problem: the office's list of meetings differs from the timetable. That's not
  the student's to dispute, so it's worded as a note, not a warning.
- **Enrolment mismatch** — "the office has you in Ops-B, your app says Ops-C.
  Update?" — is offered, never applied automatically. Applying it is safe: course
  changes patch the timetable in place rather than rebuilding it
  (`api.js`), and attendance rows outlive their class row
  by design (`schema.sql`), so marks already made
  survive the fix.
- The two numbers are always shown side by side and labelled. Neither is silently
  corrected from the other, and nothing here writes to `public.attendance`.
