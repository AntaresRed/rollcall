#!/usr/bin/env python3
"""
Build public/startup/*.png — what an iPhone shows while the installed app
starts — and the <link> tags in index.html that point at them.

    python scripts/build_startup_images.py

Android builds its launch screen from manifest.json's background_color and
icon. iOS ignores the manifest for this: it wants an image per screen size,
matched by a media query, and with no exact match it shows plain white until
the page paints, a white flash before the light-grey opening screen.

Each image is one flat colour, the opening screen's own background, and
nothing else. Anything drawn on it would have to line up with the opening
screen to the pixel, and where that screen sits depends on each model's
status bar height, which isn't published, so a logo would jump on some
phones. A flat colour can't jump.

The colour is checked on every run against --paper in src/styles.css and
background_color in manifest.json; if either has moved, the build stops
rather than quietly bringing the white flash back as a grey one.

IPHONES lists every screen size iOS 15+ runs on. A new model with a new size
gets white until a row is added here; an existing size needs nothing. iOS
fetches the image when the app is added to the Home Screen, so a phone that
installed the app before this existed has to remove and re-add it.
"""

import json
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "startup"
INDEX = ROOT / "index.html"

COLOUR = "#F4F5F2"

# (width, height) in points as the page sees them in portrait, pixel ratio,
# and the models with that screen.
IPHONES = [
    (320, 568, 2, "SE (1st gen)"),
    (375, 667, 2, "SE (2nd, 3rd gen), 8"),
    (414, 736, 3, "8 Plus"),
    (375, 812, 3, "X, XS, 11 Pro, 12 mini, 13 mini"),
    (414, 896, 2, "XR, 11"),
    (414, 896, 3, "XS Max, 11 Pro Max"),
    (390, 844, 3, "12, 12 Pro, 13, 13 Pro, 14, 16e"),
    (428, 926, 3, "12 Pro Max, 13 Pro Max, 14 Plus"),
    (393, 852, 3, "14 Pro, 15, 15 Pro, 16"),
    (430, 932, 3, "14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus"),
    (402, 874, 3, "16 Pro, 17, 17 Pro"),
    (420, 912, 3, "Air"),
    (440, 956, 3, "16 Pro Max, 17 Pro Max"),
]

START = "<!-- startup images: built by scripts/build_startup_images.py -->"
END = "<!-- /startup images -->"


def check_colour():
    css = (ROOT / "src" / "styles.css").read_text(encoding="utf-8")
    paper = re.search(r"--paper:\s*(#[0-9A-Fa-f]{6})", css)
    manifest = json.loads((ROOT / "public" / "manifest.json").read_text(encoding="utf-8"))
    found = {
        "--paper in src/styles.css": paper.group(1) if paper else None,
        "background_color in manifest.json": manifest.get("background_color"),
    }
    wrong = {k: v for k, v in found.items() if (v or "").upper() != COLOUR.upper()}
    if wrong:
        for k, v in wrong.items():
            print(f"{k} is {v}, but the startup images are {COLOUR}", file=sys.stderr)
        sys.exit("Update COLOUR to the opening screen's background, then rebuild.")


def links():
    lines = [START]
    for w, h, dpr, models in IPHONES:
        pw, ph = w * dpr, h * dpr
        media = f"(device-width: {w}px) and (device-height: {h}px) and (-webkit-device-pixel-ratio: {dpr})"
        lines.append(f"    <!-- {models} -->")
        # iOS keeps device-width/height in portrait terms whichever way the
        # phone is held, so landscape is the same query with its own image.
        for orient, size in (("portrait", (pw, ph)), ("landscape", (ph, pw))):
            lines.append(
                f'    <link rel="apple-touch-startup-image" href="/startup/iphone-{size[0]}x{size[1]}.png" '
                f'media="{media} and (orientation: {orient})" />'
            )
    lines.append(f"    {END}")
    return "\n".join(lines)


def main():
    check_colour()

    sizes = set()
    for w, h, dpr, _ in IPHONES:
        sizes.add((w * dpr, h * dpr))
        sizes.add((h * dpr, w * dpr))

    OUT.mkdir(parents=True, exist_ok=True)
    rgb = tuple(int(COLOUR[i:i + 2], 16) for i in (1, 3, 5))
    for pw, ph in sorted(sizes):
        # One palette entry: the file is a few hundred bytes, and the colour
        # is exactly COLOUR rather than whatever a lossy encoder lands on.
        img = Image.new("RGB", (pw, ph), rgb).convert("P", palette=Image.Palette.ADAPTIVE, colors=1)
        img.save(OUT / f"iphone-{pw}x{ph}.png", optimize=True)

    wanted = {f"iphone-{pw}x{ph}.png" for pw, ph in sizes}
    stale = sorted(p.name for p in OUT.glob("*.png") if p.name not in wanted)
    for name in stale:
        (OUT / name).unlink()

    raw = INDEX.read_bytes().decode("utf-8")
    # Written back with the line endings it came with, so a Windows checkout
    # doesn't show every line of index.html as changed.
    eol = "\r\n" if "\r\n" in raw else "\n"
    html = raw.replace("\r\n", "\n")
    block = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)
    if not block.search(html):
        sys.exit(f"index.html has no {START} ... {END} block to fill in")
    html = block.sub(lambda _: links(), html)
    INDEX.write_bytes(html.replace("\n", eol).encode("utf-8"))

    print(f"{len(sizes)} images for {len(IPHONES)} screen sizes in public/startup/"
          + (f", removed {', '.join(stale)}" if stale else ""))


if __name__ == "__main__":
    main()
