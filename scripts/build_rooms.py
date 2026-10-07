#!/usr/bin/env python3
"""
Build src/data/rooms.json — how to find a room, for J-Maps and every venue
chip in the app.

    python scripts/build_rooms.py \
        "../rollcall-resources/Rooms/Campus Rooms.xlsx" src/data/rooms.json

The workbook was put together room by room with the people who walk these
buildings, so it is the only place a description is written. It has:

  * `Buildings` — one row per building: its Google Maps link and which tabs
    hold its rooms. A student is sent to the building first and follows the
    description from its door, so a building without a link stops the build.
  * One tab of rooms per building (the Amphitheatre's tab joins NAB, whose
    descriptions it uses). Only `Confirmed` rows ship; `No description
    (final)` rows are rooms deliberately left out. Any other status with a
    description is an unfinished draft and stops the build.
  * Rule tabs (`NAB hallways`, `CDPO groups`) — one row per series and floor,
    e.g. "K-2xx (any)". NAB's K and M rooms open off a hallway and CDPO's E and
    W rooms off a side of the building, so the description belongs to the
    group, not the room: the app applies the rule to any number in it,
    including faculty offices no list ever named. A listed room inside a rule
    must say exactly what the rule says, or the two have drifted and the build
    stops.

ALIASES below are the other names a room goes by — what the class schedule
calls it. Each must point at a room that exists, checked on every run.
"""

import json
import re
import sys

import openpyxl

# Building tab name in the workbook -> id in the app.
IDS = {"NAB": "nab", "OAB": "oab", "CDPO Building": "cdpo", "Tata Hall": "tata"}

# Tabs that are lists of single rooms, and tabs that are rules.
ROOM_TABS = {"NAB", "Amphitheatre", "OAB", "CDPO Building", "Tata Hall"}
RULE_TABS = {"NAB hallways", "CDPO groups"}

FLOORS = ["Ground", "1st", "2nd", "3rd", "4th"]

# Another name -> the room's own name in the workbook.
ALIASES = {
    # The class schedule's names for the two amphis in use.
    "Amphi (East-150)": "Amphi 150E",
    "Amphi (West-100)": "Amphi 100W",
    # CR-1's door is also numbered 225; the layout board puts CR1 where 225
    # would be.
    "225": "CR-1",
}

CONFIRMED = "Confirmed"
LEFT_OUT = "No description (final)"


def die(msg):
    raise SystemExit(f"rooms: {msg}")


def norm(v):
    return re.sub(r"\s+", " ", str(v or "")).strip()


def key(s):
    """The app's lookup key: "Amphi (East-150)" and "amphi east 150" agree."""
    return re.sub(r"[^a-z0-9]", "", s.lower())


def rows_of(ws):
    head = [norm(c.value) for c in ws[1]]
    for r in ws.iter_rows(min_row=2, values_only=True):
        row = dict(zip(head, (norm(v) for v in r)))
        if any(row.values()):
            yield row


def need(row, col, where):
    if col not in row:
        die(f"{where}: no '{col}' column")
    return row[col]


def build(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    unknown = set(wb.sheetnames) - ROOM_TABS - RULE_TABS - {"Buildings"}
    if unknown:
        die(f"tabs this build doesn't know: {sorted(unknown)}")

    buildings, tab_of = {}, {}
    for row in rows_of(wb["Buildings"]):
        name = need(row, "Building", "Buildings")
        if name not in IDS:
            die(f"Buildings: unknown building '{name}'")
        link = need(row, "Google Maps", "Buildings")
        if not link.startswith("https://"):
            die(f"Buildings: {name} has no Google Maps link")
        buildings[name] = {"id": IDS[name], "name": name, "map": link, "rooms": []}
        for tab in need(row, "Room tabs", "Buildings").split(","):
            tab = tab.strip()
            if tab not in ROOM_TABS | RULE_TABS:
                die(f"Buildings: {name} names a tab that isn't there: '{tab}'")
            tab_of[tab] = name
    missing = set(IDS) - set(buildings)
    if missing:
        die(f"Buildings: no row for {sorted(missing)}")
    orphans = (ROOM_TABS | RULE_TABS) & set(wb.sheetnames) - set(tab_of)
    if orphans:
        die(f"tabs no building claims: {sorted(orphans)}")

    seen = {}
    for tab in wb.sheetnames:
        if tab not in ROOM_TABS:
            continue
        b = buildings[tab_of[tab]]
        for row in rows_of(wb[tab]):
            room = need(row, "Room", tab)
            status = need(row, "Status", tab)
            desc = need(row, "Description", tab)
            floor = need(row, "Floor", tab)
            if status == LEFT_OUT:
                continue
            if status != CONFIRMED:
                die(f"{tab}: {room} is '{status}' — confirm it or mark it '{LEFT_OUT}'")
            if not desc:
                die(f"{tab}: {room} is confirmed but has no description")
            if floor not in FLOORS:
                die(f"{tab}: {room} has floor '{floor}'")
            k = key(room)
            if k in seen:
                die(f"{room} is listed twice ({seen[k]} and {tab})")
            seen[k] = tab
            b["rooms"].append({"room": room, "floor": floor,
                               "name": row.get("Name", ""), "description": desc})

    rules = []
    for tab in wb.sheetnames:
        if tab not in RULE_TABS:
            continue
        b = buildings[tab_of[tab]]
        for row in rows_of(wb[tab]):
            covers = need(row, "Covers", tab)
            desc = need(row, "Description", tab)
            m = re.fullmatch(r"([A-Z])-(\d)x+( \(any\))?", covers)
            if not m or not desc:
                continue        # a named list ("C-1, C-2") or a floor with no such rooms
            series, digit = m.group(1), int(m.group(2))
            floor = need(row, "Floor", tab)
            if FLOORS.index(floor) != digit - 1:
                die(f"{tab}: {covers} is on the {floor} floor, but its number says otherwise")
            rules.append({"building": b["id"], "series": series, "digit": digit,
                          "floor": floor, "description": desc})

    groups = [(r["series"], r["digit"]) for r in rules]
    if len(set(groups)) != len(groups):
        die("two rules cover the same series and floor")

    # A listed room inside a rule must agree with it.
    by_group = {(r["series"].lower(), str(r["digit"])): r for r in rules}
    for b in buildings.values():
        for rm in b["rooms"]:
            m = re.fullmatch(r"([a-z])(\d)\d+", key(rm["room"]))
            rule = m and by_group.get((m.group(1), m.group(2)))
            if rule and (rule["building"] != b["id"] or rule["description"] != rm["description"]):
                die(f"{rm['room']} says something different from the "
                    f"{rule['series']}-{rule['digit']}xx rule — update one of them")

    for alias, target in ALIASES.items():
        if key(alias) in seen:
            die(f"alias '{alias}' is also a room of its own")
        if key(target) not in seen:
            die(f"alias '{alias}' points at '{target}', which isn't a confirmed room")

    for b in buildings.values():
        b["rooms"].sort(key=lambda r: FLOORS.index(r["floor"]))     # stable
    order = sorted(buildings.values(), key=lambda b: list(IDS.values()).index(b["id"]))
    return {"buildings": order, "rules": rules, "aliases": ALIASES}


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "../rollcall-resources/Rooms/Campus Rooms.xlsx"
    dest = sys.argv[2] if len(sys.argv) > 2 else "src/data/rooms.json"

    data = build(src)
    with open(dest, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)

    print(f"{sum(len(b['rooms']) for b in data['buildings'])} rooms -> {dest}")
    for b in data["buildings"]:
        print(f"   {b['name']:<14} {len(b['rooms']):3} rooms")
    print(f"   {len(data['rules'])} rules, {len(data['aliases'])} aliases")
