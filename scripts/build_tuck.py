#!/usr/bin/env python3
"""
Build src/data/tuck.json — the tuck shops.

    python3 scripts/build_tuck.py \
        "data/Tuck Shops.xlsx" src/data/tuck.json

A third sibling of build_menu.py and build_night_menu.py. The day mess is a
week, the night canteens are priced lists by category, and a tuck shop is one
flat priced list you read standing at the counter — close enough to the night
menu to share a screen's furniture, different enough that flattening the three
into one parser would mean a change for one breaking the others.

Sheets:
  Info            Shop | Name | Phone | Hours | Delivery (Rs) | UPI | Payment note
  Delivery        Shop | Location | Fee (Rs)      (optional)
  <TAG> Tuck      Sl No. | Item | Price | Diet

Alongside the workbook, two directories are read rather than configured:

  public/tuck/<tag>.png           the shop's own payment QR
  public/menu/tuck/<tag>-1.jpg    photographs of its printed price card,
                                  numbered; -2, -3 and so on follow

Both are optional. A shop with no photographs simply doesn't offer the
"See original menu" button, the same way a canteen with no scans doesn't.

Two things worth knowing about the data:

  * Prices are kept exactly as printed. Half this card is written "40 / 60"
    or "45 (65)" — one item at two prices, with and without cheese — and
    picking one of those numbers to store would be inventing a fact. There is
    no basket here, so nothing needs to add them up.
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
# have to be named. Getting this wrong reads the tariff as a price card and
# fails on a missing 'Sl No.' column, which is a confusing way to be told.
RESERVED = {"info", "delivery"}
COLUMNS = ["Sl No.", "Item", "Price"]


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
        "phone": ("phone",), "hours": ("hours",), "upi": ("upi", "vpa"),
        "pay_note": ("payment note",), "delivery": ("delivery",),
    }.items()}
    if ci["id"] is None:
        die("Info sheet has no Shop column")

    out = {}
    for r in rows[1:]:
        tag = r[ci["id"]].upper()
        if not tag:
            continue
        get = lambda k: (r[ci[k]] if ci[k] is not None and ci[k] < len(r) else "")
        out[tag] = {"name": get("name") or tag, "phone": get("phone"),
                    "hours": get("hours"), "upi": get("upi"),
                    "pay_note": get("pay_note"), "delivery": get("delivery")}
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
        sl, name, price = (get(idx[c]) for c in COLUMNS)
        if not name:
            continue
        if not price:
            die(f"{ws.title}: '{name}' has no price")

        diet = get(diet_col).lower()
        if diet not in DIETS:
            if diet:
                unknown.append(f"{name} ({diet})")
            diet = "unknown"

        items.append({"sl": sl, "name": name, "price": price, "diet": diet})

    names = [i["name"] for i in items]
    if len(set(names)) != len(names):
        dupes = sorted({n for n in names if names.count(n) > 1})
        die(f"{ws.title}: the same item twice: {', '.join(dupes)}")

    return items, unknown


def qr_for(qr_dir, tag):
    """The shop's own payment QR, if somebody has put one there.

    Discovered from the directory rather than named in the spreadsheet, the
    same way the night menu finds its photographed pages: adding one is
    dropping `mohanda.png` next to the others.

    Deliberately the shop's OWN image rather than a code generated here from
    the UPI address. Generating one means encoding a payment instruction, and
    a subtly wrong encoding is a payment that goes somewhere subtly wrong. The
    printed code on the counter is the one already known to work.
    """
    for ext in ("png", "jpg", "jpeg", "webp"):
        hit = glob.glob(os.path.join(qr_dir, f"{tag.lower()}.{ext}"))
        if hit:
            return f"/tuck/{os.path.basename(hit[0])}"
    return None


def read_delivery(ws):
    """Shop -> [(location, fee)], in sheet order.

    A shop charging one flat rate says so in the Info sheet and needs no rows
    here. A shop charging by where it is walking to gets a row per place —
    Mohan Da is fifteen rupees across most of campus and twenty out to LVH,
    MDC and the family quarters.

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
    ci = {"shop": col("shop"), "loc": col("location"), "fee": col("fee")}
    missing = [k for k, v in ci.items() if v is None]
    if missing:
        die(f"Delivery sheet has no {', '.join(missing)} column "
            f"(header reads {rows[0]})")

    by_shop, order = {}, []
    for r in rows[1:]:
        get = lambda k: (r[ci[k]] if ci[k] < len(r) else "")
        tag, loc, fee = get("shop").upper(), get("loc"), get("fee")
        if not tag or not loc:
            continue
        if not re.fullmatch(r"\d+", fee):
            die(f"Delivery: {tag} / {loc} has fee {fee!r}, which is not a "
                f"whole number of rupees")
        by_shop.setdefault(tag, []).append({"location": loc, "fee": int(fee)})
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
# apart: "Pav Bhaji / Extra Pav" is two unrelated dishes at two prices,
# "Paneer Masala Patty / with cheese" is one dish twice, and "Chicken / Veg
# Steamed Momos" is two dishes at one price. No rule reads all three
# correctly, so each line below is a reading of the printed card, checked
# against the photograph in public/menu/tuck/.
#
# The sheet keeps the card's own 63 rows. Splitting there would break the
# numbering that lets somebody transcribe from the photograph, so it happens
# here and every piece keeps its original serial number.
#
# The printed price is repeated so the build can verify it. If the shop
# re-prices something and the sheet is updated, these numbers go stale — and a
# stale split is a wrong price on a menu, which is the failure worth being
# loud about. Same contract as CORRECTIONS in build_por.py.
SPLITS = {
    "MOHANDA": {
        # printed name: (printed price, [(name, price), ...])
        "Paneer Masala Patty / with cheese": ("40 / 60", [
            ("Paneer Masala Patty", 40), ("Paneer Masala Patty with Cheese", 60)]),
        "Veg Masala Patty / Veg Masala Patty With Cheese": ("40 / 60", [
            ("Veg Masala Patty", 40), ("Veg Masala Patty with Cheese", 60)]),
        "Chicken Masala Patty / Chicken Masala Patty With Cheese": ("50 / 70", [
            ("Chicken Masala Patty", 50), ("Chicken Masala Patty with Cheese", 70)]),
        "Vada Pav / (with Cheese)": ("50 / 70", [
            ("Vada Pav", 50), ("Vada Pav with Cheese", 70)]),
        "Pav Bhaji / Extra Pav": ("50 / 15", [
            ("Pav Bhaji", 50), ("Extra Pav", 15)]),
        "Chicken / Veg Steamed Momos (5 pieces)": ("70", [
            ("Chicken Steamed Momos (5 pieces)", 70),
            ("Veg Steamed Momos (5 pieces)", 70)]),
        "Fried Momo (Veg / Chicken)": ("80 / 80", [
            ("Fried Veg Momo", 80), ("Fried Chicken Momo", 80)]),
        "Pan Fried Veg / Chicken Momo (5 pieces)": ("100", [
            ("Pan Fried Veg Momo (5 pieces)", 100),
            ("Pan Fried Chicken Momo (5 pieces)", 100)]),
        "Double Egg Bread Omelet (Cheese)": ("45 (65)", [
            ("Double Egg Bread Omelet", 45),
            ("Double Egg Bread Omelet with Cheese", 65)]),
        "Chicken Sausage (Fry / Steamed)": ("80", [
            ("Chicken Sausage (Fry)", 80), ("Chicken Sausage (Steamed)", 80)]),
        "Masala Rice (Veg / Egg / Chicken / Paneer)": ("50 / 70 / 75 / 75", [
            ("Masala Rice (Veg)", 50), ("Masala Rice (Egg)", 70),
            ("Masala Rice (Chicken)", 75), ("Masala Rice (Paneer)", 75)]),
        "Oats (Veg / Egg / Chicken)": ("40 / 60 / 65", [
            ("Oats (Veg)", 40), ("Oats (Egg)", 60), ("Oats (Chicken)", 65)]),
        "Tomato Soup / With Butter": ("35 / 45", [
            ("Tomato Soup", 35), ("Tomato Soup with Butter", 45)]),
        "Veg Sweet Corn Soup / With Butter": ("35 / 45", [
            ("Veg Sweet Corn Soup", 35), ("Veg Sweet Corn Soup with Butter", 45)]),
        "Hot and Sour Veg Soup / With Butter": ("35 / 45", [
            ("Hot and Sour Veg Soup", 35),
            ("Hot and Sour Veg Soup with Butter", 45)]),
        "Sprout chat (Veg / Egg / Chicken)": ("45 / 60 / 65", [
            ("Sprout Chaat (Veg)", 45), ("Sprout Chaat (Egg)", 60),
            ("Sprout Chaat (Chicken)", 65)]),
        "Peanut Chaat / Chips Chaat": ("45", [
            ("Peanut Chaat", 45), ("Chips Chaat", 45)]),
        "White Sauce Pasta (Veg / Non-Veg)": ("70 / 95", [
            ("White Sauce Pasta (Veg)", 70), ("White Sauce Pasta (Non-Veg)", 95)]),
        "Red Sauce Pasta (Veg / Non-Veg)": ("80 / 105", [
            ("Red Sauce Pasta (Veg)", 80), ("Red Sauce Pasta (Non-Veg)", 105)]),
        "Cold / Hot Bournvita / Cold Coffee": ("50 / 50 / 50", [
            ("Cold Bournvita", 50), ("Hot Bournvita", 50), ("Cold Coffee", 50)]),
        "Cold / Hot Milk / Haldi Milk Hot": ("25 / 30 / 30", [
            ("Cold Milk", 25), ("Hot Milk", 30), ("Haldi Milk Hot", 30)]),
        "Hot / Cold Chocolate Milk": ("50 / 50", [
            ("Hot Chocolate Milk", 50), ("Cold Chocolate Milk", 50)]),
        "Upma / Poha": ("55 / 50", [("Upma", 55), ("Poha", 50)]),
        "Plain Masala Maggi (With Cheese)": ("45 (65)", [
            ("Plain Masala Maggi", 45), ("Plain Masala Maggi with Cheese", 65)]),
        "Double Masala Maggi (With Cheese)": ("50 (70)", [
            ("Double Masala Maggi", 50), ("Double Masala Maggi with Cheese", 70)]),
        "Vegetable Maggi (With Cheese)": ("50 / 70", [
            ("Vegetable Maggi", 50), ("Vegetable Maggi with Cheese", 70)]),
        "Fried Maggi (Veg / Egg / Chicken)": ("50 / 70 / 75", [
            ("Fried Maggi (Veg)", 50), ("Fried Maggi (Egg)", 70),
            ("Fried Maggi (Chicken)", 75)]),
        "Atta Maggi (With Cheese)": ("50 / 70", [
            ("Atta Maggi", 50), ("Atta Maggi with Cheese", 70)]),
    },
    # Tagore writes its choices as "HOT/ COLD" and, once, as a list of three
    # fillings. Same price either way in every case, so this buys nothing at
    # the till — it buys a card somebody can search, the same reason the night
    # canteens' "(Hot/Cold)" drinks are split.
    "TAGORE": {
        "Chocolate (Hot/Cold)": ("48", [
            ("Chocolate (Hot)", 48), ("Chocolate (Cold)", 48)]),
        "Bournvita (Hot/Cold)": ("42", [
            ("Bournvita (Hot)", 42), ("Bournvita (Cold)", 42)]),
        "Corn Flakes (Hot/Cold)": ("45", [
            ("Corn Flakes (Hot)", 45), ("Corn Flakes (Cold)", 45)]),
        "Chocos (Hot/Cold)": ("50", [
            ("Chocos (Hot)", 50), ("Chocos (Cold)", 50)]),
        "Maggi Pasta (Tomato / Cheese / Mushroom)": ("55", [
            ("Maggi Pasta (Tomato)", 55), ("Maggi Pasta (Cheese)", 55),
            ("Maggi Pasta (Mushroom)", 55)]),
    },
}

# Printed lines that look splittable and are deliberately left whole. Recorded
# so that the next person to read the card does not "fix" them.
NOT_SPLIT = {
    "MOHANDA": {
        "Boiled Egg (1 piece)":
            "two prices, one name — nobody has established what the second "
            "buys, and guessing would put a price on a dish that may not exist",
        "Chicken Sandwich Grilled (without cheese)":
            "one price; the bracket describes the sandwich rather than "
            "offering a choice",
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

    Complains about anything stale — a split whose printed name is gone, or
    whose price has moved — because that means the card was reissued and the
    reading below it has to be redone.
    """
    rules = SPLITS.get(tag, {})
    kept = NOT_SPLIT.get(tag, {})
    by_name = {i["name"]: i for i in items}

    stale = [f"{n!r} is no longer on the card" for n in rules if n not in by_name]
    stale += [f"{n!r} (left unsplit) is no longer on the card" for n in kept
              if n not in by_name]
    for name, (price, _) in rules.items():
        got = by_name.get(name)
        if got and got["price"] != price:
            stale.append(f"{name!r} now costs {got['price']!r}, not {price!r} — "
                         f"the split prices under it are out of date")
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
        for name, price in rule[1]:
            out.append({**item, "name": name, "price": str(price)})

    # The sheet is checked for duplicate names on the way in; splitting can
    # reintroduce them by inventing a name the card already uses elsewhere.
    # It matters downstream: the basket keys a line by name and price, and the
    # screen keys a row by name.
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
    """Photographs of the shop's own price card, in order.

    The same convention as the night canteens, deliberately: drop
    `mohanda-1.jpg` in public/menu/tuck/ and it appears. Discovered from the
    directory rather than listed in the spreadsheet, so adding a page is a
    thing somebody can do without being told a convention twice.

    Why this matters more here than anywhere else in the app: the typed list
    is a transcription and the photograph is what the shop actually charges.
    Half this card is written "40 / 60", a third of it has been re-priced by
    hand, and the only honest answer to "is this still right?" is the picture.
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


def build(path, qr_dir="public/tuck", pages_dir="public/menu/tuck"):
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
        if not re.fullmatch(r"[6-9]\d{9}", re.sub(r"\D", "", meta["phone"] or "")):
            # Not fatal — a counter you walk to is still worth listing — but
            # said out loud, because the screen quietly drops the call button.
            warnings.append(f"{tag}: no usable phone number, so no call button")
        upi = (meta.get("upi") or "").strip()
        if upi and not re.fullmatch(r"[a-z0-9.\-_]{2,}@[a-z]{2,}", upi, re.I):
            # Never nearly-right: a malformed address sends money nowhere, and
            # the student only finds out standing at the counter.
            die(f"{tag}: '{upi}' is not a UPI address (it should look like "
                f"name@bank)")
        if not upi:
            warnings.append(f"{tag}: no UPI address, so no pay button")
        if meta.get("pay_note"):
            # A note on a payment is only ever there because the payee is not
            # yet the right one. Shouted, because forgetting it means real
            # money going to the wrong person.
            warnings.append(f"{tag}: PAYMENT NOTE IS SET — {meta['pay_note']}")
        qr = qr_for(qr_dir, tag)
        if not upi and not qr:
            warnings.append(f"{tag}: no UPI address and no QR, so no way to pay "
                            f"from the app")
        mine = zones.get(tag, [])
        if mine and meta.get("delivery"):
            die(f"{tag}: has both a flat Delivery (Rs) in Info and rows in "
                f"the Delivery sheet — pick one")
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

        shops.append({"id": tag.lower(), "tag": tag, **meta,
                      "qr": qr, "pages": pages, "zones": mine,
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
    qr_dir = sys.argv[3] if len(sys.argv) > 3 else "public/tuck"
    pages_dir = sys.argv[4] if len(sys.argv) > 4 else "public/menu/tuck"

    data, warnings = build(src, qr_dir, pages_dir)
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
        fees = sorted({z["fee"] for z in s["zones"]})
        charge = (f"Rs {'/'.join(str(f) for f in fees)} by location"
                  if fees else (f"Rs {s['delivery']} flat" if s["delivery"] else "no delivery fee"))
        print(f"        {s['name']} · {s['phone'] or 'no number'}"
              + (f" · {s['hours']}" if s["hours"] else "")
              + f" · {charge}"
              + f" · {len(s['pages'])} photographed page(s)")

    if warnings:
        print(f"\n{len(warnings)} thing(s) to look at:")
        for w in warnings:
            print(f"   {w}")
