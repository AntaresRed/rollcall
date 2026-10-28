import { useEffect, useState } from "react";

/**
 * There is more below: a fade over the last rows above the tab bar, and a
 * small arrow in it that bobs. Tapping the arrow scrolls most of a screen.
 *
 * Long screens ended at the tab bar with nothing to say they went on, and
 * the rest went unseen. Wordless on purpose — a "scroll for more" line is one
 * more thing to read on every screen.
 *
 * One instance, in the app shell, watching the page rather than any screen:
 * every screen gets it, including when a date opens and makes the page
 * longer. It measures the content, not the page — the shell pads its foot so
 * the last card clears the tab bar, and that padding is not "more".
 *
 * Stands aside while the tuck shop's cart pill is up: the pill sits in the
 * same spot and fades the list behind it already.
 */

// How much content has to be out of sight before the cue shows: about half a
// card. Less than that and the screen is, to the eye, already all there.
const HIDDEN_PX = 48;

export default function ScrollCue() {
  const [more, setMore] = useState(false);

  useEffect(() => {
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const shell = document.querySelector(".shell");
        const nav = document.querySelector(".tabs");
        if (!shell || document.querySelector(".cart-dock")) {
          setMore(false);
          return;
        }
        const foot = parseFloat(getComputedStyle(shell).paddingBottom) || 0;
        const contentEnd = shell.getBoundingClientRect().bottom - foot;
        const seenTo = window.innerHeight - (nav?.getBoundingClientRect().height ?? 0);
        setMore(contentEnd - seenTo > HIDDEN_PX);
      });
    };

    check();
    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    // Content changing height without a scroll: a date opening, a screen
    // swapping in, a list arriving from the network.
    const root = document.getElementById("root");
    const ro = typeof ResizeObserver !== "undefined" && root ? new ResizeObserver(check) : null;
    ro?.observe(root);
    // The cart pill comes and goes without changing the page's height.
    const mo = typeof MutationObserver !== "undefined" && root ? new MutationObserver(check) : null;
    mo?.observe(root, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, []);

  const down = () => {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.scrollBy({ top: Math.round(window.innerHeight * 0.8), behavior: still ? "auto" : "smooth" });
  };

  return (
    <>
      <div className={`scroll-fade${more ? "" : " gone"}`} aria-hidden="true" />
      <button
        type="button"
        className={`scroll-more${more ? "" : " gone"}`}
        aria-label="Scroll down"
        aria-hidden={!more}
        tabIndex={more ? 0 : -1}
        onClick={down}
      >
        <svg width="22" height="22" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path d="M4.5 7 9 11.5 13.5 7" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </>
  );
}
