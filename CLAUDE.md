# IIMPresent (rollcall)

A React + Vite PWA for IIM Calcutta students: weekly timetable from the published
schedule, push alerts before class, attendance against the 75% line, plus mess
menus, night-canteen and tuck-shop ordering over WhatsApp with UPI payment, and
faculty / POR / student contact directories. Backend is Supabase (Postgres, RLS,
Edge Functions, pg_cron). Deployed on Vercel.

## Where things are

- `src/App.jsx` — shell, boot, tabs. `src/screens/` — one file per screen,
  lazy-loaded. `src/lib/` — data and logic; keep it free of React.
- `src/data/*.json` — **generated**. Never hand-edit; rebuild from the source
  workbook (see below).
- `scripts/build_*.py` — one builder per dataset. `scripts/smoke.mjs` — test runner.
- `supabase/schema.sql` + migration files; `supabase/functions/` holds
  `send-class-alerts` and `mark-attendance`.
- `templates/` — blank, correctly shaped example of every input file, each with a
  README. Regenerate with `python scripts/build_templates.py`.
- `test/logic.mjs` (data layer) and `test/smoke.jsx` (renders every screen).
- **Source material lives outside the repo**, in the sibling folder
  `../rollcall-resources/` (menu workbooks, photos, PDFs, schedules).

## Commands

```bash
npm run dev      # local dev server
npm run build    # eslint + all tests + vite build — run before saying anything works
npm run smoke    # tests only
```

`npm run build` must end with `64/64 screens rendered` and `all logic checks passed`.

The app needs `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and
`VITE_VAPID_PUBLIC_KEY` (see `.env.example`). Screens that need sign-in can't be
reached locally without them. To look at a screen, use the throwaway harness
`preview.html` + `src/_preview.jsx` (gitignored), then delete both.

## Data pipeline

Workbook in `../rollcall-resources/` → `scripts/build_<x>.py` → `src/data/<x>.json`.

- Build to a temp path first, diff it against the current JSON, then copy it in.
- **Corrections are declarative tables inside the build scripts, and each is
  verified on every run:** `CORRECTIONS` / `ADDITIONS` / `EXTRA_DATASETS` in
  `build_por.py`, `SECTIONS` / `SPLITS` / `NOT_SPLIT` in `build_tuck.py`,
  `SPLITS` in `build_night_menu.py`, `NAME_FIXES` / `DEAN_NAMES` /
  `STRAY_TITLES` / `ROOM_FIXES` / `EXTRA_PEOPLE` in `build_directory_tsv.py`,
  and `data/overrides.json` for schedule
  amendments. When one goes stale the build fails **on purpose**. Update the
  entry against the source; never weaken the check.
- Printed cards stay faithful in the workbook, with the card's own row numbers.
  Splits and grouping happen in the build script, and split items keep their
  original serial number.
- Photos are found by filename, not listed anywhere:
  `public/menu/night/<tag>-<n>.jpg`, `public/menu/tuck/<tag>-<n>.jpg`,
  `public/tuck/<tag>.png` (payment QR). A shop or canteen with no photos simply
  hides its "See original menu" button.
- Faculty directory: the MBA office's workbook (`Faculty Directory 2026
  -2027_Updated - Copy.xlsx`) is the source of truth. `build_directory_tsv.py`
  flattens it into `FacultyDirectory.tsv`, which feeds `build_directory.py`
  (the directory screen) and `build_faculty.py` → `build_catalogue.py`
  (instructor emails); `build_pgp1_catalogue.py` reads `directory.json`.
  Rebuild all four after a directory change.
- **Hazard:** `build_catalogue.py` also rewrites
  `supabase/repair-stale-classes.sql`. Never point it at a template.

## House rules

- **Diet:** never infer "veg" from a dish name. Unknown is shown under every
  filter and marked unconfirmed.
- **Slashes are not always choices.** `S/C` (Sweet Corn), `H/S` (Hot & Sour) and
  `S/W` (Sandwich) are abbreviations and must never be split. Splits are named
  lists, never a pattern.
- **Prices** stay as printed strings (`"40 / 60"`, `"45 (65)"`).
- **Cohorts** are the graduating year parsed from the email. `null` means
  unknown. It must never be treated as "unfiltered".
- **UPI:** only a shop's own address or QR. Never derive or guess one.
- **Reschedules:** a `session_overrides` row with no `new_date` means
  "rescheduled, date not decided" — the app no longer cancels classes, and
  older rows once labelled "cancelled" are read the same way. It raises no
  alert and isn't asked about. A mark made before it was rescheduled is parked
  on the published slot and kept out of the totals by `countedAttendance`
  until a date is set.
- Pin exact dependency versions in Edge Functions.
- Tests of parsing logic use literal fixtures, not real menu rows — rows get
  split or renamed and the test silently stops testing anything.
- Measure before optimizing; don't change working code for unmeasurable gains.
- Comments in this codebase explain *why*. Match that density and voice.

## Known traps

- Sticky elements: an ancestor with `overflow: hidden` or a fixed `height`
  breaks `position: sticky`. Use `overflow: clip`; `#root` uses `min-height`.
- The tab bar height is measured into `--nav-h` in `App.jsx`. Don't hardcode it.
- Access `localStorage` / `sessionStorage` inside `try` — the accessor itself can
  throw.
- Anything imported by `SignIn` or `InstallBanner` must not pull in the Supabase
  client (that's why `src/lib/platform.js` exists) — a missing env var would
  blank the sign-in screen.
- On this Windows machine, bash heredocs mangle backslashes. Write files with
  the file tools instead.

## Out-of-date docs

`README.md` and `START-HERE.md` describe anonymous sign-in and Gemini image
parsing, and mention `supabase/functions/_shared/catalogue.ts`. None of that is
current. Sign-in is Google, restricted to `@email.iimcal.ac.in`
(see `GOOGLE-SIGNIN.md` and `allowed_email_domains` in `schema.sql`).
`RUNBOOK.md` is the reliable deploy and push-testing guide.
