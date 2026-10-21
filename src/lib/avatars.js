/**
 * The animal DPs a student can pick instead of their Google photo.
 *
 * Google sends a picture link even for an account with no photo — its own
 * one-letter circle — and nothing in that link says which kind it is. So the
 * app can't swap the letter out by itself; the student chooses, and
 * `profiles.avatar` keeps the key. Null is "my Google photo", which is where
 * everyone starts.
 *
 * Drawn here rather than shipped as image files: a dozen small SVGs add a few
 * KB to the bundle, stay sharp at any size, and need no request to show.
 *
 * The keys are also listed in the check constraint in
 * supabase/profile-avatar.sql. test/logic.mjs compares the two, so adding an
 * animal here fails the build until the database knows it too — otherwise
 * picking it would be refused on save.
 */

const D = "#1C1F24", W = "#FFF6EA", PINK = "#FF8FB1", GOLD = "#FFD23F";

// The ears on most of these are one shape drawn twice, facing each way.
const mirror = (s) => `<g transform="translate(100 0) scale(-1 1)">${s}</g>`;

export const AVATARS = [
  // Monty is the one that comes first, on purpose: a college joke. He is a
  // monitor lizard, and the cigarette is the point.
  { key: "monty", name: "Monty", bg: "#3D5A80", art: `
    <path d="M6 100Q10 72 28 60L50 68Q38 84 40 100Z" fill="#5E6B3A"/>
    <path d="M22 60Q20 40 42 35Q62 32 80 41Q91 46 89 52Q87 58 74 60Q54 64 40 71Q26 73 22 60Z" fill="#6F7D45"/>
    <path d="M40 71Q54 64 74 60Q87 58 89 52Q86 62 70 65Q52 70 42 76Z" fill="#5E6B3A"/>
    <path d="M48 57Q66 57 87 52" stroke="#2F3520" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <g fill="#D8C45A">
      <circle cx="30" cy="50" r="2.4"/><circle cx="36" cy="60" r="2"/><circle cx="58" cy="40" r="2"/>
      <circle cx="68" cy="44" r="1.8"/><circle cx="56" cy="49" r="1.6"/><circle cx="24" cy="76" r="2.4"/>
      <circle cx="34" cy="86" r="2.2"/><circle cx="18" cy="90" r="2"/><circle cx="30" cy="68" r="1.8"/>
    </g>
    <path d="M36 41Q45 34 54 40" stroke="#4E5A2E" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="45" cy="45" r="5.5" fill="#E9C46A"/>
    <ellipse cx="45.5" cy="46" rx="1.6" ry="3.4" fill="${D}"/>
    <path d="M39.5 45A5.5 5.5 0 0 1 50.5 45Z" fill="#5E6B3A"/>
    <path d="M39.5 45h11" stroke="#2F3520" stroke-width="1.4" stroke-linecap="round"/>
    <ellipse cx="83" cy="45.5" rx="1.8" ry="1.2" fill="#2F3520"/>
    <path d="M69 57.5L91 63" stroke="#F4F1EA" stroke-width="4.6" stroke-linecap="round"/>
    <path d="M69 57.5L75 59" stroke="#D98E32" stroke-width="4.6" stroke-linecap="round"/>
    <circle cx="91.5" cy="63" r="4.5" fill="#FF7A1A" opacity=".35"/>
    <circle cx="91.5" cy="63" r="2.4" fill="#FF5A1F"/>
    <path d="M91 58q-5-6 0-11q5-5 0-10q-4-5 1-10" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".55"/>` },

  { key: "cat", name: "Cat", bg: "#7C5CFF", art: `
    <path d="M24 46L22 18L44 32Z" fill="#9AA0A8"/><path d="M27 40L26 25L38 33Z" fill="#FFB3C7"/>
    ${mirror(`<path d="M24 46L22 18L44 32Z" fill="#9AA0A8"/><path d="M27 40L26 25L38 33Z" fill="#FFB3C7"/>`)}
    <ellipse cx="50" cy="58" rx="30" ry="27" fill="#9AA0A8"/>
    <path d="M20 58Q20 14 50 14Q80 14 80 58" fill="none" stroke="${GOLD}" stroke-width="6" stroke-linecap="round"/>
    <rect x="12" y="49" width="14" height="22" rx="7" fill="${GOLD}"/><rect x="74" y="49" width="14" height="22" rx="7" fill="${GOLD}"/>
    <ellipse cx="39" cy="55" rx="4.5" ry="6" fill="${D}"/><ellipse cx="61" cy="55" rx="4.5" ry="6" fill="${D}"/>
    <circle cx="40.5" cy="53" r="1.6" fill="#fff"/><circle cx="62.5" cy="53" r="1.6" fill="#fff"/>
    <path d="M46 64h8l-4 4z" fill="${PINK}"/>
    <path d="M50 68q-4 5-8 1M50 68q4 5 8 1" stroke="${D}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M32 65l-8-1M32 69l-8 2M68 65l8-1M68 69l8 2" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".85"/>` },

  { key: "fox", name: "Fox", bg: "#2EC4B6", art: `
    <path d="M22 50L26 14L46 34Z" fill="#FF7A1A"/><path d="M28 40L29 24L39 33Z" fill="#2B1B17"/>
    ${mirror(`<path d="M22 50L26 14L46 34Z" fill="#FF7A1A"/><path d="M28 40L29 24L39 33Z" fill="#2B1B17"/>`)}
    <path d="M18 46Q50 22 82 46Q78 72 50 88Q22 72 18 46Z" fill="#FF7A1A"/>
    <path d="M18 46Q34 54 50 88Q22 72 18 46Z" fill="${W}"/><path d="M82 46Q66 54 50 88Q78 72 82 46Z" fill="${W}"/>
    <path d="M34 54q5-6 10 0M56 54q5-6 10 0" stroke="#2B1B17" stroke-width="3" fill="none" stroke-linecap="round"/>
    <circle cx="34" cy="64" r="4" fill="${PINK}" opacity=".7"/><circle cx="66" cy="64" r="4" fill="${PINK}" opacity=".7"/>
    <ellipse cx="50" cy="80" rx="5" ry="4" fill="#2B1B17"/>
    <circle cx="20" cy="56" r="4" fill="none" stroke="${GOLD}" stroke-width="2.2"/>` },

  { key: "panda", name: "Panda", bg: "#FF9F1C", art: `
    <circle cx="26" cy="30" r="11" fill="${D}"/><circle cx="74" cy="30" r="11" fill="${D}"/>
    <ellipse cx="50" cy="56" rx="32" ry="29" fill="#fff"/>
    <ellipse cx="38" cy="52" rx="8" ry="11" transform="rotate(30 38 52)" fill="${D}"/>
    <ellipse cx="62" cy="52" rx="8" ry="11" transform="rotate(-30 62 52)" fill="${D}"/>
    <circle cx="39" cy="51" r="3" fill="#fff"/><circle cx="61" cy="51" r="3" fill="#fff"/>
    <circle cx="39.6" cy="51.6" r="1.5" fill="${D}"/><circle cx="60.4" cy="51.6" r="1.5" fill="${D}"/>
    <ellipse cx="50" cy="64" rx="5" ry="3.5" fill="${D}"/>
    <circle cx="57" cy="77" r="11" fill="${PINK}"/><circle cx="53" cy="73" r="3" fill="#fff" opacity=".65"/>` },

  { key: "owl", name: "Owl", bg: "#3A86FF", art: `
    <path d="M22 42Q22 88 50 90Q78 88 78 42Q78 28 50 30Q22 28 22 42Z" fill="#8D5A3B"/>
    <ellipse cx="50" cy="78" rx="17" ry="12" fill="#D9B48F"/>
    <circle cx="38" cy="52" r="11" fill="#fff" stroke="#FFC83D" stroke-width="3"/>
    <circle cx="62" cy="52" r="11" fill="#fff" stroke="#FFC83D" stroke-width="3"/>
    <circle cx="39" cy="53" r="5.5" fill="${D}"/><circle cx="61" cy="53" r="5.5" fill="${D}"/>
    <circle cx="40.5" cy="51" r="1.7" fill="#fff"/><circle cx="62.5" cy="51" r="1.7" fill="#fff"/>
    <path d="M45 62h10l-5 8z" fill="#FF9F1C"/>
    <path d="M35 27v6q15 6 30 0v-6z" fill="#11151A"/>
    <path d="M22 22L50 10L78 22L50 33Z" fill="#11151A"/>
    <path d="M50 21L73 26v10" stroke="${GOLD}" stroke-width="2" fill="none"/><circle cx="73" cy="37" r="2.6" fill="${GOLD}"/>` },

  { key: "frog", name: "Frog", bg: "#6C4AB6", art: `
    <circle cx="32" cy="37" r="13" fill="#8BD346"/><circle cx="68" cy="37" r="13" fill="#8BD346"/>
    <ellipse cx="50" cy="63" rx="36" ry="25" fill="#8BD346"/>
    <circle cx="32" cy="36" r="8.5" fill="#fff"/><circle cx="68" cy="36" r="8.5" fill="#fff"/>
    <circle cx="33" cy="37" r="4.5" fill="${D}"/><circle cx="67" cy="37" r="4.5" fill="${D}"/>
    <circle cx="46" cy="56" r="1.4" fill="#2D5A12"/><circle cx="54" cy="56" r="1.4" fill="#2D5A12"/>
    <path d="M28 64Q50 84 72 64" stroke="#2D5A12" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="25" cy="68" rx="5" ry="3.5" fill="${PINK}" opacity=".85"/><ellipse cx="75" cy="68" rx="5" ry="3.5" fill="${PINK}" opacity=".85"/>
    <path d="M41 41V29L45.5 34L50 26L54.5 34L59 29V41Z" fill="${GOLD}" stroke="#E0A800" stroke-width="1" stroke-linejoin="round"/>` },

  { key: "penguin", name: "Penguin", bg: "#00B4D8", art: `
    <circle cx="50" cy="62" r="31" fill="${D}"/>
    <path d="M50 52Q38 38 30 52Q24 74 50 89Q76 74 70 52Q62 38 50 52Z" fill="#fff"/>
    <circle cx="40" cy="58" r="3.5" fill="${D}"/><circle cx="60" cy="58" r="3.5" fill="${D}"/>
    <circle cx="41" cy="57" r="1.1" fill="#fff"/><circle cx="61" cy="57" r="1.1" fill="#fff"/>
    <path d="M43 65h14l-7 7z" fill="#FF9F1C"/>
    <circle cx="34" cy="68" r="3.5" fill="${PINK}" opacity=".8"/><circle cx="66" cy="68" r="3.5" fill="${PINK}" opacity=".8"/>
    <path d="M37 34L52 6L65 35Z" fill="${GOLD}"/>
    <path d="M46 18l8 1M42 26l15 2" stroke="#7C5CFF" stroke-width="3" stroke-linecap="round"/>
    <circle cx="52" cy="7" r="4.5" fill="#FF5D8F"/>` },

  { key: "koala", name: "Koala", bg: "#FF8C61", art: `
    <circle cx="22" cy="40" r="16" fill="#9AA0A8"/><circle cx="22" cy="40" r="9" fill="#F3D9E0"/>
    <circle cx="78" cy="40" r="16" fill="#9AA0A8"/><circle cx="78" cy="40" r="9" fill="#F3D9E0"/>
    <ellipse cx="50" cy="58" rx="28" ry="27" fill="#B4BAC2"/>
    <circle cx="40" cy="52" r="3.5" fill="${D}"/><circle cx="60" cy="52" r="3.5" fill="${D}"/>
    <circle cx="40" cy="52" r="8.5" fill="#fff" fill-opacity=".25" stroke="#11151A" stroke-width="2.6"/>
    <circle cx="60" cy="52" r="8.5" fill="#fff" fill-opacity=".25" stroke="#11151A" stroke-width="2.6"/>
    <path d="M48.5 52h3" stroke="#11151A" stroke-width="2.6"/>
    <ellipse cx="50" cy="66" rx="7" ry="10" fill="#3A3F47"/>
    <ellipse cx="47.5" cy="62" rx="1.6" ry="3" fill="#fff" opacity=".45"/>` },

  { key: "monkey", name: "Monkey", bg: "#FFD166", art: `
    <circle cx="20" cy="54" r="11" fill="#7A4A2E"/><circle cx="20" cy="54" r="6" fill="#E8C29B"/>
    <circle cx="80" cy="54" r="11" fill="#7A4A2E"/><circle cx="80" cy="54" r="6" fill="#E8C29B"/>
    <circle cx="50" cy="54" r="31" fill="#7A4A2E"/>
    <path d="M47 24q3-10 8-2q3-7 8-1" stroke="#7A4A2E" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path d="M50 46Q42 34 34 40Q26 48 32 60Q24 74 50 85Q76 74 68 60Q74 48 66 40Q58 34 50 46Z" fill="#E8C29B"/>
    <circle cx="41" cy="51" r="3.5" fill="${D}"/><circle cx="59" cy="51" r="3.5" fill="${D}"/>
    <circle cx="47" cy="62" r="1.6" fill="#5A3520"/><circle cx="53" cy="62" r="1.6" fill="#5A3520"/>
    <path d="M37 68Q50 82 63 68Z" fill="#5A3520"/><path d="M41 69h18l-1.5 3h-15z" fill="#fff"/>` },

  { key: "shiba", name: "Shiba", bg: "#118AB2", art: `
    <path d="M22 46L24 16L44 30Z" fill="#E8913A"/><path d="M27 38L28 24L37 31Z" fill="${W}"/>
    ${mirror(`<path d="M22 46L24 16L44 30Z" fill="#E8913A"/><path d="M27 38L28 24L37 31Z" fill="${W}"/>`)}
    <ellipse cx="50" cy="56" rx="32" ry="28" fill="#E8913A"/>
    <path d="M24 64Q34 56 50 62Q66 56 76 64Q70 84 50 84Q30 84 24 64Z" fill="${W}"/>
    <ellipse cx="38" cy="43" rx="4" ry="2.5" fill="${W}"/><ellipse cx="62" cy="43" rx="4" ry="2.5" fill="${W}"/>
    <circle cx="39" cy="52" r="3.5" fill="${D}"/><circle cx="61" cy="52" r="3.5" fill="${D}"/>
    <ellipse cx="50" cy="64" rx="5" ry="3.5" fill="${D}"/>
    <path d="M47 72q3 8 6 0z" fill="${PINK}"/>
    <path d="M50 67v4M44 71q6 4 12 0" stroke="${D}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M22 79Q50 92 78 79L50 100Z" fill="#E63946"/>
    <circle cx="42" cy="88" r="1.8" fill="#fff"/><circle cx="58" cy="88" r="1.8" fill="#fff"/><circle cx="50" cy="94" r="1.8" fill="#fff"/>` },

  { key: "llama", name: "Llama", bg: "#9B5DE5", art: `
    <path d="M31 42Q22 14 32 14Q39 20 39 40Z" fill="#F5E6CC"/><path d="M69 42Q78 14 68 14Q61 20 61 40Z" fill="#F5E6CC"/>
    <rect x="30" y="30" width="40" height="64" rx="20" fill="#F5E6CC"/>
    <circle cx="37" cy="36" r="7" fill="#fff"/><circle cx="46" cy="31" r="8" fill="#fff"/>
    <circle cx="55" cy="31" r="8" fill="#fff"/><circle cx="63" cy="36" r="7" fill="#fff"/>
    <ellipse cx="41" cy="54" rx="3" ry="4" fill="${D}"/><ellipse cx="59" cy="54" rx="3" ry="4" fill="${D}"/>
    <path d="M37 50l-2-2M63 50l2-2" stroke="${D}" stroke-width="1.6" stroke-linecap="round"/>
    <ellipse cx="50" cy="74" rx="14" ry="10" fill="#E9D3AE"/>
    <path d="M44 71q2 2 4 0M52 71q2 2 4 0M46 78q4 3 8 0" stroke="#7A5A3A" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <g transform="translate(70 24)">
      <circle cx="0" cy="-5" r="4" fill="${PINK}"/><circle cx="4.8" cy="-1.5" r="4" fill="${PINK}"/>
      <circle cx="3" cy="4" r="4" fill="${PINK}"/><circle cx="-3" cy="4" r="4" fill="${PINK}"/>
      <circle cx="-4.8" cy="-1.5" r="4" fill="${PINK}"/><circle r="3" fill="${GOLD}"/>
    </g>` },
];

export const avatarByKey = (key) => AVATARS.find((a) => a.key === key) ?? null;

/** The whole picture as SVG markup, background included. */
export const avatarSvg = (a) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${a.bg}"/>${a.art}</svg>`;

/**
 * An <img> source for a stored key, or null for anything this build can't
 * draw — no pick, or a key from a newer build that a phone still running an
 * older one has never heard of. Null falls back to the Google photo, which is
 * a better answer than a blank circle.
 *
 * A data URI rather than inline SVG, so the screen draws it with the same
 * <img> the Google photo uses and this file needs no React.
 */
export function avatarSrc(key) {
  const a = avatarByKey(key);
  return a ? `data:image/svg+xml,${encodeURIComponent(avatarSvg(a))}` : null;
}

// ---------- DPs drawn for one person ----------
//
// Not in this file on purpose: anything here downloads to every phone. They
// come from public.exclusive_avatars (profile-avatar.sql), which hands each
// account its own rows only, so the picture and the address it was made for
// never reach anyone else.

const ONLY = /^only-[a-z0-9-]{1,40}$/;

/**
 * The rows that can actually be drawn, in the shape the picker uses. A row
 * that doesn't look like what the database promises is left out rather than
 * drawn wrong.
 */
export function usableExclusive(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) =>
      r && typeof r.key === "string" && ONLY.test(r.key) &&
      typeof r.name === "string" && r.name &&
      typeof r.svg === "string" && r.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'))
    // A missing or odd caption isn't worth losing the picture over.
    .map((r) => ({ ...r, caption: typeof r.caption === "string" && r.caption.trim() ? r.caption : "Just for you" }));
}

/** An <img> source for one of those rows. */
export const exclusiveSrc = (row) => `data:image/svg+xml,${encodeURIComponent(row.svg)}`;
