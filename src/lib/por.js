import por from "../data/por.json";

/**
 * Positions of responsibility — who holds which post, and how to reach them.
 *
 * Seven lists behind a small menu, because the batch's POR contacts arrive as
 * eight spreadsheet tabs that nobody would want flattened into one list of
 * three hundred and fifty names. The menu below is the hierarchy as the
 * council describes it, not as the workbook happens to be tabbed: "SIGs and
 * Chapters" is one screen built from two sheets, and the Sports Council sheet
 * carries its captains with it.
 *
 * Kept out of the eagerly loaded bundle — only the POR screen imports this.
 */

const lower = (s) => String(s ?? "").toLowerCase();
const squash = (s) => lower(s).replace(/[^a-z0-9]/g, "");

/** How many people a dataset holds, across all its sections. */
const sizeOf = (id) =>
  (por[id]?.sections ?? []).reduce((n, s) => n + s.people.length, 0);

/**
 * The menu, as a tree. A node either opens a further menu (`children`) or a
 * list of people (`dataset`) — never both.
 */
export const POR_MENU = [
  { id: "student-council", label: "Student Council", dataset: "student-council" },
  {
    id: "cdpo",
    label: "CDPO",
    children: [
      { id: "preparation-committee", label: "Preparation Committee", dataset: "preparation-committee" },
      { id: "placement-representatives", label: "Placement Representatives", dataset: "placement-representatives" },
    ],
  },
  {
    id: "cultural-bodies",
    label: "Cultural Bodies",
    children: [
      { id: "clubs", label: "Clubs", dataset: "clubs" },
      { id: "sigs-chapters", label: "SIGs and Chapters", dataset: "sigs-chapters" },
      { id: "cultural-cell", label: "Cultural Cell", dataset: "cultural-cell" },
    ],
  },
  { id: "7-lakes-fest", label: "7 Lakes Fest Team", dataset: "7-lakes-fest" },
  { id: "sports-council", label: "Sports Council and Captains", dataset: "sports-council" },
];

/** Everyone reachable below a node — the count shown against a menu row. */
export function countUnder(node) {
  if (!node) return 0;
  if (node.dataset) return sizeOf(node.dataset);
  return (node.children ?? []).reduce((n, c) => n + countUnder(c), 0);
}

export const porTotal = POR_MENU.reduce((n, node) => n + countUnder(node), 0);

/**
 * Walk a path of ids to the node it names.
 *
 * Returns null for a path that doesn't resolve, so a stale or hand-typed one
 * falls back to the top menu rather than rendering nothing.
 */
export function nodeAt(path = []) {
  let level = POR_MENU;
  let node = null;
  for (const id of path) {
    node = (level ?? []).find((n) => n.id === id) ?? null;
    if (!node) return null;
    level = node.children;
  }
  return node;
}

/** The nodes along a path, for the breadcrumb trail. */
export function trailOf(path = []) {
  const out = [];
  for (let i = 1; i <= path.length; i += 1) {
    const node = nodeAt(path.slice(0, i));
    if (!node) break;
    out.push(node);
  }
  return out;
}

// Each person's searchable text is derived once at module load rather than
// per keystroke — Clubs alone is a hundred and eighty rows.
const INDEX = new Map(
  Object.entries(por).map(([id, data]) => [
    id,
    (data.sections ?? []).map((section) => ({
      ...section,
      people: section.people.map((p) => {
        const text = [p.name, p.role, p.email, p.phone, section.label, section.kind]
          .filter(Boolean).join(" ");
        return { ...p, _text: lower(text), _squashed: squash(text) };
      }),
    })),
  ]),
);

/**
 * One dataset, filtered.
 *
 * Sections that end up empty are dropped, so a search never leaves a club
 * heading standing over nothing. Matching includes the section name itself —
 * searching "hult" finds everyone in Hult Prize, not just anyone called that.
 */
export function searchPor(datasetId, query = "") {
  const sections = INDEX.get(datasetId) ?? [];
  const tokens = lower(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return sections;

  return sections
    .map((section) => ({
      ...section,
      people: section.people.filter((p) =>
        tokens.every((t) => {
          // A token of pure punctuation squashes to "", and every string
          // contains "" — without this it would match everybody.
          const flat = squash(t);
          return p._text.includes(t) || (flat !== "" && p._squashed.includes(flat));
        })),
    }))
    .filter((section) => section.people.length > 0);
}

export const porLabel = (datasetId) => por[datasetId]?.label ?? "";

/**
 * A dataset's own links — a fest's website and Instagram, say.
 *
 * Most lists have none, so this returns the same empty array every time
 * rather than a fresh one, which keeps it usable straight out of a render
 * without a memo around it.
 */
const NO_LINKS = [];
export const porLinks = (datasetId) => por[datasetId]?.links ?? NO_LINKS;

/**
 * Which mark a link should wear, read off the address itself.
 *
 * Derived rather than stored so that adding a link is adding a link — nobody
 * has to remember to tag it, and a tag that disagreed with its own URL would
 * be a small lie sitting next to the truth.
 *
 * Matched on the host, not anywhere in the string: a path or query that
 * happens to mention instagram should not put its logo on somebody's own
 * website.
 */
export function linkKind(href) {
  let host = "";
  try {
    host = new URL(String(href)).hostname.toLowerCase();
  } catch {
    return "web";
  }
  const is = (domain) => host === domain || host.endsWith(`.${domain}`);
  if (is("instagram.com")) return "instagram";
  return "web";
}
export const porSize = sizeOf;
