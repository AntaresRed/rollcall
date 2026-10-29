#!/usr/bin/env python3
"""
Build src/data/tuck.json — the tuck shops.

    python3 scripts/build_tuck.py \
        "data/Tuck Shops.xlsx" src/data/tuck.json

A third sibling of build_menu.py and build_night_menu.py. The day mess is a
week, the night canteens are lists by category, and a tuck shop is one flat
list you read standing at the counter — close enough to the night menu to
share a screen's furniture, different enough that flattening the three into
one parser would mean a change for one breaking the others.

Sheets:
  Info            Shop | Name | Phone | Hours | Delivers
  Delivery        Shop | Location                (optional)
  <TAG> Tuck      Sl No. | Item | Diet

Alongside the workbook, one directory is read rather than configured:

  public/menu/tuck/<tag>-1.jpg    photographs of its printed card, numbered;
                                  -2, -3 and so on follow

It is optional. A shop with no photographs simply doesn't offer the
"See original menu" button, the same way a canteen with no scans doesn't.

Two things worth knowing about the data:

  * No prices, and no delivery fees or payment details either. The shops
    re-price faster than anybody re-types the card, so the photographs are
    where a price is read, and the counter is who gets paid.
  * `Diet` is optional and currently blank. The app would rather mark an item
    unconfirmed than guess "Veg" from a name, because the times a guess is
    wrong are the times a vegetarian eats meat. Fill the column in and the
    filter starts working; leave it and every item is shown to everyone.
"""

import glob
import json
import os
import re
import sys

import openpyxl

DIETS = {"veg", "egg", "non-veg"}

# Every other sheet in the book is a shop's menu, so the ones that are not
# have to be named. Getting this wrong reads the delivery list as a menu and
# fails on a missing 'Sl No.' column, which is a confusing way to be told.
RESERVED = {"info", "delivery"}
COLUMNS = ["Sl No.", "Item"]


def norm(v):
    return re.sub(r"\s+", " ", str(v or "")).strip()


def die(msg):
    raise SystemExit(f"tuck: {msg}")


def read_info(ws):
    rows = [[norm(c) for c in r] for r in ws.iter_rows(values_only=True)]
    rows = [r for r in rows if any(r)]
    if not rows:
        die("Info sheet is empty")
    head = [c.lower() for c in rows[0]]

    def col(*names):
        for i, h in enumerate(head):
            if any(n in h for n in names):
                return i
        return None

    ci = {k: col(*n) for k, n in {
        "id": ("shop", "hostel"), "name": ("name",),
        "phone": ("phone",), "hours": ("hours",), "delivers": ("deliver",),
    }.items()}
    if ci["id"] is None:
        die("Info sheet has no Shop column")

    out = {}
    for r in rows[1:]:
        tag = r[ci["id"]].upper()
        if not tag:
            continue
        get = lambda k: (r[ci[k]] if ci[k] is not None and ci[k] < len(r) else "")
        delivers = get("delivers").lower()
        if delivers not in ("", "yes", "no"):
            die(f"Info: {tag} has Delivers {get('delivers')!r} — write Yes, No "
                f"or leave it blank")
        out[tag] = {"name": get("name") or tag, "phone": get("phone"),
                    "hours": get("hours"), "delivers": delivers == "yes"}
    return out


def read_items(ws):
    rows = [[norm(c) for c in r] for r in ws.iter_rows(values_only=True)]
    rows = [r for r in rows if any(r)]
    if not rows:
        die(f"{ws.title}: empty")

    head = [c.lower() for c in rows[0]]
    idx = {}
    for want in COLUMNS:
        for i, h in enumerate(head):
            if h == want.lower():
                idx[want] = i
                break
        else:
            die(f"{ws.title}: no '{want}' column (header reads {rows[0]})")
    # Optional: a card nobody has been through yet simply has no diet on it.
    diet_col = next((i for i, h in enumerate(head) if h == "diet"), None)

    items, unknown = [], []
    for r in rows[1:]:
        get = lambda i: r[i] if i is not None and i < len(r) else ""
        sl, name = (get(idx[c]) for c in COLUMNS)
        if not name:
            continue

        diet = get(diet_col).lower()
        if diet not in DIETS:
            if diet:
                unknown.append(f"{name} ({diet})")
            diet = "unknown"

        items.append({"sl": sl, "name": name, "diet": diet})

    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        dupes = sorted({n for n in names if names.count(n) > 1})
        die(f"{ws.title}: the same item twice: {', '.join(dupes)}")

    return items, unknown


def read_delivery(ws):
    """Shop -> [location], in sheet order.

    The places a shop has said it walks to. A shop that delivers without
    naming anywhere says Yes under Delivers in the Info sheet instead.

    The locations offered on screen are the distinct ones named here, in the
    order they first appear, so adding a corner of campus is a row rather
    than a code change.
    """
    rows = [[norm(c) for c in r] for r in ws.iter_rows(values_only=True)]
    rows = [r for r in rows if any(r)]
    if not rows:
        return {}, []

    head = [c.lower() for c in rows[0]]
    def col(*names):
        for i, h in enumerate(head):
            if any(n in h for n in names):
                return i
        return None
    ci = {"shop": col("shop"), "loc": col("location")}
    missing = [k for k, v in ci.items() if v is None]
    if missing:
        die(f"Delivery sheet has no {', '.join(missing)} column "
            f"(header reads {rows[0]})")

    by_shop, order = {}, []
    for r in rows[1:]:
        get = lambda k: (r[ci[k]] if ci[k] < len(r) else "")
        tag, loc = get("shop").upper(), get("loc")
        if not tag or not loc:
            continue
        by_shop.setdefault(tag, []).append(loc)
        if loc not in order:
            order.append(loc)
    return by_shop, order


# ------------------------------------------------------------------ sections
#
# The printed card has no headings. It is one numbered run down two columns,
# sandwiches at the top and Maggi at the bottom, and the sections below are
# read off that order rather than transcribed from anything.
#
# They live here rather than in a Category column because the card has no such
# column: putting one in the sheet would dress a reading of the running order
# up as something the shop wrote down. Keyed by serial range for the same
# reason — the run IS the grouping.
#
# A shop with no entry here keeps the flat list it has now, which is what the
# screen falls back to.
SECTIONS = {
    "MOHANDA": [
        (1, 9, "Sandwiches"),
        (10, 12, "Burgers & Fries"),
        (13, 17, "Patties & Pav"),
        (18, 20, "Momos"),
        (21, 25, "Eggs"),
        (26, 41, "Starters & Fried Snacks"),
        (43, 45, "Rice, Oats & Paratha"),
        (46, 48, "Soups"),
        (49, 52, "Chaat"),
        (53, 54, "Pasta"),
        (55, 60, "Drinks"),
        (61, 61, "Indian Breakfast"),
        (62, 70, "Maggi"),
    ],
    # Tagore's card runs over three photographed pages: chaat and drinks,
    # then Maggi and rice, then sandwiches. Numbered here in that order,
    # which is the order the pages are pinned up in.
    "TAGORE": [
        (1, 5, "Chaat"),
        (6, 8, "Soups"),
        (9, 17, "Drinks & Cereal"),
        (18, 31, "Maggi & Noodles"),
        (32, 36, "Eggs & Breakfast"),
        (37, 40, "Pasta & Rice"),
        (41, 43, "Corn & Popcorn"),
        (44, 56, "Sandwiches & Kulcha"),
        (57, 58, "Burgers"),
        (59, 64, "Patties"),
        (65, 68, "Fried Snacks"),
    ],
}

# -------------------------------------------------------------------- splits
#
# One printed line that is really two or more things to order.
#
# The card writes a slash three different ways and only context tells them
# apart: "Pav Bhaji / Extra Pav" is two unrelated dishes, "Paneer Masala
# Patty / with cheese" is one dish twice, and "Chicken / Veg Steamed Momos"
# is two dishes under one line. No rule reads all three correctly, so each
# line below is a reading of the printed card, checked against the
# photograph in public/menu/tuck/.
#
# The sheet keeps the card's own 63 rows. Splitting there would break the
# numbering that lets somebody transcribe from the photograph, so it happens
# here and every piece keeps its original serial number.
#
# Keyed by the printed name, so a reissued card that renames a line stops the
# build rather than quietly shipping the old reading. Same contract as
# CORRECTIONS in build_por.py.
SPLITS = {
    "MOHANDA": {
        # printed name: [names to order it by]
        "Paneer Masala Patty / with cheese": [
            "Paneer Masala Patty", "Paneer Masala Patty with Cheese"],
        "Veg Masala Patty / Veg Masala Patty With Cheese": [
            "Veg Masala Patty", "Veg Masala Patty with Cheese"],
        "Chicken Masala Patty / Chicken Masala Patty With Cheese": [
            "Chicken Masala Patty", "Chicken Masala Patty with Cheese"],
        "Vada Pav / (with Cheese)": ["Vada Pav", "Vada Pav with Cheese"],
        "Pav Bhaji / Extra Pav": ["Pav Bhaji", "Extra Pav"],
        "Chicken / Veg Steamed Momos (5 pieces)": [
            "Chicken Steamed Momos (5 pieces)", "Veg Steamed Momos (5 pieces)"],
        "Fried Momo (Veg / Chicken)": ["Fried Veg Momo", "Fried Chicken Momo"],
        "Pan Fried Veg / Chicken Momo (5 pieces)": [
            "Pan Fried Veg Momo (5 pieces)", "Pan Fried Chicken Momo (5 pieces)"],
        "Double Egg Bread Omelet (Cheese)": [
            "Double Egg Bread Omelet", "Double Egg Bread Omelet with Cheese"],
        "Chicken Sausage (Fry / Steamed)": [
            "Chicken Sausage (Fry)", "Chicken Sausage (Steamed)"],
        "Masala Rice (Veg / Egg / Chicken / Paneer)": [
            "Masala Rice (Veg)", "Masala Rice (Egg)",
            "Masala Rice (Chicken)", "Masala Rice (Paneer)"],
        "Oats (Veg / Egg / Chicken)": ["Oats (Veg)", "Oats (Egg)", "Oats (Chicken)"],
        "Tomato Soup / With Butter": ["Tomato Soup", "Tomato Soup with Butter"],
        "Veg Sweet Corn Soup / With Butter": [
            "Veg Sweet Corn Soup", "Veg Sweet Corn Soup with Butter"],
        "Hot and Sour Veg Soup / With Butter": [
            "Hot and Sour Veg Soup", "Hot and Sour Veg Soup with Butter"],
        "Sprout chat (Veg / Egg / Chicken)": [
            "Sprout Chaat (Veg)", "Sprout Chaat (Egg)", "Sprout Chaat (Chicken)"],
        "Peanut Chaat / Chips Chaat": ["Peanut Chaat", "Chips Chaat"],
        "White Sauce Pasta (Veg / Non-Veg)": [
            "White Sauce Pasta (Veg)", "White Sauce Pasta (Non-Veg)"],
        "Red Sauce Pasta (Veg / Non-Veg)": [
            "Red Sauce Pasta (Veg)", "Red Sauce Pasta (Non-Veg)"],
        "Cold / Hot Bournvita / Cold Coffee": [
            "Cold Bournvita", "Hot Bournvita", "Cold Coffee"],
        "Cold / Hot Milk / Haldi Milk Hot": ["Cold Milk", "Hot Milk", "Haldi Milk Hot"],
        "Hot / Cold Chocolate Milk": ["Hot Chocolate Milk", "Cold Chocolate Milk"],
        "Upma / Poha": ["Upma", "Poha"],
        "Plain Masala Maggi (With Cheese)": [
            "Plain Masala Maggi", "Plain Masala Maggi with Cheese"],
        "Double Masala Maggi (With Cheese)": [
            "Double Masala Maggi", "Double Masala Maggi with Cheese"],
        "Vegetable Maggi (With Cheese)": ["Vegetable Maggi", "Vegetable Maggi with Cheese"],
        "Fried Maggi (Veg / Egg / Chicken)": [
            "Fried Maggi (Veg)", "Fried Maggi (Egg)", "Fried Maggi (Chicken)"],
        "Atta Maggi (With Cheese)": ["Atta Maggi", "Atta Maggi with Cheese"],
    },
    # Tagore writes its choices as "HOT/ COLD" and, once, as a list of three
    # fillings. Split for a card somebody can search, the same reason the
    # night canteens' "(Hot/Cold)" drinks are.
    "TAGORE": {
        "Chocolate (Hot/Cold)": ["Chocolate (Hot)", "Chocolate (Cold)"],
        "Bournvita (Hot/Cold)": ["Bournvita (Hot)", "Bournvita (Cold)"],
        "Corn Flakes (Hot/Cold)": ["Corn Flakes (Hot)", "Corn Flakes (Cold)"],
        "Chocos (Hot/Cold)": ["Chocos (Hot)", "Chocos (Cold)"],
        "Maggi Pasta (Tomato / Cheese / Mushroom)": [
            "Maggi Pasta (Tomato)", "Maggi Pasta (Cheese)", "Maggi Pasta (Mushroom)"],
    },
}

# Printed lines that look splittable and are deliberately left whole. Recorded
# so that the next person to read the card does not "fix" them.
NOT_SPLIT = {
    "MOHANDA": {
        "Boiled Egg (1 piece)":
            "the card prints two prices for it — nobody has established what "
            "the second buys, and guessing would invent a dish that may not exist",
        "Chicken Sandwich Grilled (without cheese)":
            "the bracket describes the sandwich rather than offering a choice",
    },
    "TAGORE": {
        # S/W is how this card abbreviates Sandwich, exactly as the night
        # canteens write S/C for Sweet Corn. Splitting on that slash would
        # invent "Paneer Cheese Kulcha S" and "... W", which are not dishes.
        "Paneer Cheese Kulcha S/W": "S/W is the card's abbreviation for Sandwich",
        "Mushroom Cheese Kulcha S/W": "S/W is the card's abbreviation for Sandwich",
        "Chicken Cheese Kulcha S/W": "S/W is the card's abbreviation for Sandwich",
    },
}


def split_items(tag, items):
    """Expand the printed lines that are really several orderable things.

    Complains about a split whose printed name is gone, because that means
    the card was reissued and the reading below it has to be redone.
    """
    rules = SPLITS.get(tag, {})
    kept = NOT_SPLIT.get(tag, {})
    by_name = {i["name"]: i for i in items}

    stale = [f"{n!r} is no longer on the card" for n in rules if n not in by_name]
    stale += [f"{n!r} (left unsplit) is no longer on the card" for n in kept
              if n not in by_name]
    if stale:
        die(f"{tag}: the card has changed under SPLITS:\n   "
            + "\n   ".join(stale)
            + "\n   Re-read the photograph and update SPLITS in build_tuck.py.")

    out = []
    for item in items:
        rule = rules.get(item["name"])
        if not rule:
            out.append(item)
            continue
        # Each piece keeps the serial it was printed under, so a split item
        # still points back at one line on the card.
        for name in rule:
            out.append({**item, "name": name})

    # The sheet is checked for duplicate names on the way in; splitting can
    # reintroduce them by inventing a name the card already uses elsewhere.
    # It matters downstream: the basket and the screen both key by name.
    names = [i["name"] for i in out]
    dupes = sorted({n for n in names if names.count(n) > 1})
    if dupes:
        die(f"{tag}: splitting produced the same item twice: {', '.join(dupes)}"
            f"\n   Rename one of them in SPLITS.")
    return out


def categorise(tag, items):
    """Hang each item under the section its serial number falls in."""
    ranges = SECTIONS.get(tag)
    if not ranges:
        return None

    order = [name for _, _, name in ranges]
    under = {name: [] for name in order}
    homeless = []
    for item in items:
        sl = str(item.get("sl") or "")
        hit = next((n for a, b, n in ranges if sl.isdigit() and a <= int(sl) <= b), None)
        if hit is None:
            homeless.append(f"{item['name']} (Sl {sl!r})")
        else:
            under[hit].append(item)

    if homeless:
        die(f"{tag}: these items fall outside every range in SECTIONS:\n   "
            + "\n   ".join(homeless) + "\n   Widen a range, or add one.")

    empty = [n for n in order if not under[n]]
    if empty:
        die(f"{tag}: SECTIONS names sections with nothing in them: "
            f"{', '.join(empty)} — the card's numbering must have changed.")

    return [{"name": n, "items": under[n]} for n in order]


def scans(pages_dir, tag):
    """Photographs of the shop's own card, in order.

    The same convention as the night canteens, deliberately: drop
    `mohanda-1.jpg` in public/menu/tuck/ and it appears. Discovered from the
    directory rather than listed in the spreadsheet, so adding a page is a
    thing somebody can do without being told a convention twice.

    Why this matters more here than anywhere else in the app: the typed list
    carries no prices, so the picture is the only place a student can see
    what something costs — and it is what the shop actually charges.
    """
    found = []
    for ext in ("jpg", "jpeg", "png", "webp"):
        found += glob.glob(os.path.join(pages_dir, f"{tag.lower()}-*.{ext}"))

    def page_no(p):
        m = re.search(r"-(\d+)\.[a-z]+$", os.path.basename(p).lower())
        return int(m.group(1)) if m else 0

    # Served from /menu/tuck/, which is public/ and so is copied verbatim into
    # the build rather than bundled into the JavaScript. The pages are only
    # fetched when somebody actually asks to see one.
    return [f"/menu/tuck/{os.path.basename(p)}" for p in sorted(found, key=page_no)]


def build(path, pages_dir="public/menu/tuck"):
    wb = openpyxl.load_workbook(path, data_only=True)
    if "Info" not in wb.sheetnames:
        die("workbook has no Info sheet")
    info = read_info(wb["Info"])
    zones, locations = (read_delivery(wb["Delivery"])
                        if "Delivery" in wb.sheetnames else ({}, []))

    shops, warnings = [], []
    for name in wb.sheetnames:
        if name.strip().lower() in RESERVED:
            continue
        tag = norm(name).split()[0].upper()
        items, unknown = read_items(wb[name])
        meta = info.get(tag)
        if meta is None:
            die(f"'{name}' has no matching row in the Info sheet (looked for {tag})")
        # The first of "a / b" is the one called and sent orders — the same
        # rule as shopPhone() in src/lib/tuck.js.
        first = (meta["phone"] or "").split("/")[0]
        if not re.fullmatch(r"[6-9]\d{9}", re.sub(r"\D", "", first)):
            # Not fatal — a counter you walk to is still worth listing — but
            # said out loud, because the screen quietly drops the call button.
            warnings.append(f"{tag}: no usable phone number, so no call button")
        # Rows in the Delivery sheet are as good as a Yes: a shop that names
        # where it walks to delivers.
        meta = {**meta, "delivers": meta["delivers"] or bool(zones.get(tag))}
        pages = scans(pages_dir, tag)
        if not pages:
            warnings.append(f"{tag}: no photographed pages in {pages_dir} — "
                            f"the 'See original menu' button stays hidden")

        printed = len(items)
        items = split_items(tag, items)
        if len(items) != printed:
            warnings.append(f"{tag}: {printed} printed lines split into "
                            f"{len(items)} orderable items")
        # None for a shop whose running order nobody has read yet, which the
        # screen renders as the flat list it has now.
        categories = categorise(tag, items)
        if categories is None:
            warnings.append(f"{tag}: no SECTIONS, so its menu stays one flat list")

        shops.append({"id": tag.lower(), "tag": tag, **meta, "pages": pages,
                      "categories": categories, "items": items})
        warnings += [f"{tag}: {u}" for u in unknown]

    if not shops:
        die("no tuck shop sheets found")

    # Two shops printing the same card is a real thing — worth saying once, so
    # that a copy-paste mistake and a genuinely shared menu look different.
    seen = {}
    for s in shops:
        key = tuple(sorted(i["name"] for i in s["items"]))
        seen.setdefault(key, []).append(s["tag"])
    for tags in seen.values():
        if len(tags) > 1:
            warnings.append(f"identical item lists: {', '.join(tags)}")

    unknown = set(zones) - {s["tag"] for s in shops}
    if unknown:
        die(f"Delivery sheet names shops with no menu: {', '.join(sorted(unknown))}")

    return {"shops": shops, "locations": locations}, warnings


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "data/Tuck Shops.xlsx"
    dest = sys.argv[2] if len(sys.argv) > 2 else "src/data/tuck.json"
    pages_dir = sys.argv[3] if len(sys.argv) > 3 else "public/menu/tuck"

    data, warnings = build(src, pages_dir)
    with open(dest, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)

    total = sum(len(s["items"]) for s in data["shops"])
    print(f"{len(data['shops'])} tuck shops, {total} items -> {dest}")
    for s in data["shops"]:
        by = {}
        for i in s["items"]:
            by[i["diet"]] = by.get(i["diet"], 0) + 1
        split = "  ".join(f"{k} {v}" for k, v in sorted(by.items()))
        print(f"   {s['tag']:<8} {len(s['items']):>3} items   {split}")
        print(f"        {s['name']} · {s['phone'] or 'no number'}"
              + (f" · {s['hours']}" if s["hours"] else "")
              + f" · {'delivers' if s['delivers'] else 'no delivery'}"
              + f" · {len(s['pages'])} photographed page(s)")

    if warnings:
        print(f"\n{len(warnings)} thing(s) to look at:")
        for w in warnings:
            print(f"   {w}")
