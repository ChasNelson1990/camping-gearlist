#!/usr/bin/env python3
"""Regenerate data.js, research-data.js and first-aid-data.js from the CSV
files under data/.

Run this after editing any of the CSVs:

    python3 scripts/extract_data.py

Requires only the Python standard library (csv) - no pandas/openpyxl
needed. Writes plain JS files that the static site loads with a plain
<script> tag - no build step, no client-side parsing.
"""
import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
RESEARCH_DIR = DATA_DIR / "research"


def cell(row, i):
    return row[i].strip() if i < len(row) else ""


def field(row, key):
    return (row.get(key) or "").strip()


def parse_num(s):
    s = s.strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def is_true(s):
    return s.strip().upper() == "TRUE"


# ---------------------------------------------------------------------------
# pack / anjo -> data.js
# ---------------------------------------------------------------------------

PACK_REQUIRED_COLUMNS = {
    "name", "category", "number", "weight_g", "cost_gbp", "comment",
    "current", "season", "overnight", "long_trek", "car_camp", "on_body",
    "archived",
}
ANJO_REQUIRED_COLUMNS = {
    "name", "number", "weight_g", "cost_gbp", "comment", "current",
    "overnight", "long_trek", "car_camp", "on_body",
}


def check_columns(fieldnames, required, label):
    missing = required - set(fieldnames or [])
    if missing:
        raise SystemExit(
            f"{label} is missing column(s): {sorted(missing)}. Update the "
            f"CSV header or PACK_REQUIRED_COLUMNS/ANJO_REQUIRED_COLUMNS in "
            f"scripts/extract_data.py to match."
        )


# Items that get their own dedicated checklist page (linked from their entry
# on the main checklist) instead of just being a single line with a weight.
ITEM_DETAIL_PAGES = {
    "First aid kit": {"url": "first-aid-kit.html", "label": "🩹 open kit checklist"},
    "Repair kit": {"url": "repair-kit.html", "label": "🛠️ open kit checklist"},
}

# Items whose listed weight is a depleting/per-trip substance rather than
# durable gear - excluded from the weight-class calculation (which is meant
# to track base weight, like the spreadsheet's own Ultralight/Light/Trad/
# Heavy classification did) and flagged in the UI. Hand-picked rather than
# driven by the sheet's "Con. / trip" column: that column is also set on
# reusable containers (Reservoir, Wine bladders, gas canisters) where the
# listed weight is the container itself, not the substance it holds - only
# true consumables are listed here.
#
# Value is None for a flagged-but-unscaled consumable (no known per-night
# amount, so it just keeps its flat sheet weight - see Poo bags), or a dict:
#   parent:  item this nests under in the UI, or None for standalone
#   amount:  suggested quantity per night (editable in the UI afterwards) -
#            or, if scalesWithNights is False, a fixed per-trip quantity
#   unit:    "g", "ml" (both count 1:1 towards weight, in grams), or "l"
#            (counts x1000)
#   comment: overrides the item's own sheet comment, if given
#   overnight/longTrek/carCamp: overrides that trip-type flag, if given
#   scalesWithNights: if False, `amount` is a fixed total (not multiplied
#            by nights) - see Wine, which is capped at 2 bladders regardless
#            of trip length
#   max:     upper bound the UI stepper won't exceed, if given
#   step:    fixed stepper increment, overriding the default magnitude-based
#            step size, if given
#
# Pack and anjo are separate dicts because a couple of names exist on both
# sides ("Water", "Food") and need different parents/amounts on each.
PACK_CONSUMABLE = {
    "Gas can (100 g)": {"parent": "Stove with stash bag", "amount": 100, "unit": "g"},
    "Coffee": {"parent": "Grinder", "amount": 14, "unit": "g"},
    "Water": {"parent": "Reservoir", "amount": 2, "unit": "l"},
    "Food": {
        "parent": "Small drybag for food", "amount": 880, "unit": "g",
        "comment": "787 g/night if going ultralight (previously tracked as a separate \"Food UL\" line)",
        # Food UL (now merged away) was the sheet's only longTrek-flagged food
        # row; Food's own row is overnight/carCamp only. Without this
        # override, merging them would leave longTrek with no food item at
        # all - this restores the union of both rows' original coverage.
        "longTrek": True,
    },
    "Suncream": {"parent": None, "amount": 50, "unit": "g"},
    "Talc": {"parent": None, "amount": 9.4, "unit": "g"},
    "Wet wipes": {"parent": None, "amount": 20, "unit": "g"},
    "Vaseline": {"parent": None, "amount": 43.25, "unit": "g"},
    "Smidge": {"parent": "Midge net", "amount": 100, "unit": "g"},
    "Toothpaste": {"parent": "Toothbrush", "amount": 5, "unit": "g"},
    "Poo bags": None,
    "Beer": None,
    # Synthetic - see synthetic_pack_items(). One bladder (0.75 l) by
    # default; up to 2 bladders (1.5 l) is the real-world cap, not a
    # per-night rate, so it doesn't scale with trip length.
    "Wine": {
        "parent": "Wine bladders", "amount": 0.75, "unit": "l",
        "scalesWithNights": False, "max": 1.5, "step": 0.75,
        "overnight": True, "longTrek": False, "carCamp": True,
    },
}
ANJO_CONSUMABLE = {
    "Water": {"parent": None, "amount": 0.85, "unit": "l"},
    "Food": {"parent": "Drybag for food", "amount": 255, "unit": "g"},
    "Poo bags": None,
}

# Manual weight corrections where the spreadsheet's own figure is known to
# be wrong or outdated - keeps the CSV as the source of truth for
# everything else while letting a specific number be corrected here.
ITEM_WEIGHT_OVERRIDE = {
    "Wine bladders": 24,  # sheet says 20 g; actual measured weight is 24 g
}

# Durable (non-consumable) items with an adjustable "how many do I bring"
# quantity in the UI - the item's own weightG is treated as the per-unit
# weight, multiplied by a live quantity (starts at min, default 1, capped at
# max). min only needs setting where 0 is a valid choice (e.g. optional guy
# lines you might not bring at all).
ITEM_QUANTITY = {
    "Wine bladders": {"max": 2},
    "Guy lines": {"min": 0, "max": 4},
    "Guy lines with clips": {"min": 0, "max": 2},
    "Triple Twister pegs": {"min": 0, "max": 11},
    "Blizzard pegs": {"min": 0, "max": 8},
}

# Durable (non-consumable) items nested under another item in the UI purely
# for display grouping - distinct from PACK_CONSUMABLE/ANJO_CONSUMABLE's
# parent nesting, which also carries per-night-amount/unit behaviour. These
# just say "show this item indented under that one"; the item keeps its own
# normal weight/quantity/current fields otherwise.
ITEM_PARENT = {
    "Quilt compression sack": "Quilt",
    "Raincover": "Rucksack",
    "Lid pocket": "Rucksack",
    "1l bladder for dirty water": "Water filter",
    "Guy lines": "Tarpaulin",
    "Guy lines with clips": "Tarpaulin",
    "Poles": "Tent",
    "Triple Twister pegs": "Tent",
    "Blizzard pegs": "Tent",
}

# Per-trip season override, for the rare item whose season restriction isn't
# uniform across every trip type it's flagged for (the plain `season` field
# applies to all of them equally, so this is the escape hatch) - e.g. carried
# on long treks/car camp regardless of season, but only on winter overnights.
# Keys are the JS trip field names (overnight/longTrek/carCamp); a trip type
# not listed here falls back to the item's own `season`.
ITEM_SEASON_BY_TRIP = {
    "Lid pocket": {"overnight": "Winter"},
}

# Brand + model label shown on the "view item" link when the item's
# `current` field is a URL - hand-picked (not scraped from the URL/page
# title) so the label stays a clean "Brand Model" even when the page itself
# is a Wayback Machine snapshot or a retailer's own awkward product title.
# Items with no entry here fall back to the generic "view item" label.
# Split into pack/anjo like PACK_CONSUMABLE/ANJO_CONSUMABLE because a
# couple of names ("Insulating Jacket", "Towel") exist on both sides with
# different products behind them.
PACK_CURRENT_LABEL = {
    "1l bladder for dirty water": "Platypus SoftBottle 1L",
    "Rucksack": "Osprey Exos 48",
    "Raincover": "Osprey Ultralight Rain Cover (M)",
    "Tarpaulin": "Nordisk Voss 5 ULW",
    "Tent": "Nordisk Halland 2 LW",
    "Poles": "Nordisk Halland 2 LW Spare Pole Set",
    "Triple Twister pegs": "Nordisk Aluminium Triple Twister Peg",
    "Blizzard pegs": "MSR Blizzard Tent Stake",
    "Insect shield travel sheet": "Cocoon TravelSheet Insect Shield (Silk)",
    "Clothes dry sack": "Sea to Summit eVac Dry Sack",
    "Cup": "Toaks Titanium Cup 375",
    "Gas can (100 g)": "Jetboil Jetpower Fuel",
    "Gas can (230 g)": "Jetboil Jetpower Fuel",
    "Headlamp": "BioLite HeadLamp 330",
    "Insulating Jacket": "Patagonia Micro Puff Hoody",
    "Knife": "Deejo 37g Titanium",
    "Lantern": "BioLite PowerLight",
    "Midge net": "Smidge Midge-Proof Headnet",
    "Pac Tube": "P.A.C. Ocean Upcycling Multitube",
    "Pillow/Stuff Sack": "Therm-a-Rest Stuff Sack Pillow",
    "Pot": "Toaks Titanium Pot 550ml",
    "Powerpack": "Nitecore NB20000",
    "Quilt": "Therm-a-Rest Vesper 20F/-6C",
    "Quilt compression sack": "Sea to Summit Ultra-Sil eVent Compression Sack",
    "Rain Jacket": "Patagonia Torrentshell 3L",
    "Rain Pants": "Patagonia Torrentshell 3L Pants",
    "Reservoir": "Platypus Big Zip EVO",
    "Silk sleeping bag liner": "Eurohike Silk Mummy Liner",
    "Skin So Soft": "Avon Skin So Soft Dry Oil Spray",
    "Skinner": "Marttiini Skinner Knife",
    "Sleeping mat, mummy, large": "Therm-a-Rest NeoAir XTherm",
    "Small drybag for food": "Exped Fold Drybag UL",
    "Smidge": "Smidge Repellent",
    "Solar panel": "PowerTraveller Extreme (solar)",
    "Spare small drybag": "Exped Fold Drybag UL",
    "Spare top": "Fjällräven Abisko Wool Long-Sleeve",
    "Spork": "Toaks Titanium Spork",
    "Stash bag": "Toaks Stash Bag",
    "Stove with stash bag": "Vango Compact Gas Stove",
    "Summer Trousers": "Fjällräven High Coast Lite Trousers",
    "Sun Hood": "Fjällräven Abisko Sun Hoodie",
    "Thermal bottoms": "Icebreaker Merino 200 Oasis Leggings",
    "Thermal glove liners": "Icebreaker Merino 200 Oasis Glove Liners",
    "Thermal sleeping bag liner": "Sea to Summit Thermolite Reactor Liner",
    "Thermal top": "Icebreaker Merino 200 Oasis Crewe",
    "Tights": "Fjällräven Abisko Trekking Tights",
    "Top": "Fjällräven Singi Merino Henley",
    "Towel": "Sea to Summit Airlite Towel",
    "Walking Boots": "Lowa Renegade GTX Mid",
    "Water filter": "Platypus QuickDraw 1L Filter System",
    "Wine bladders": "Platypus PlatyPreserve",
    "Winter Trousers": "Fjällräven Lappland Hybrid Trousers",
}
ANJO_CURRENT_LABEL = {
    "Beacon": "Ruffwear The Beacon",
    "Blanket": "Therm-a-Rest Juno Blanket",
    "Bowl": "Treadlite Gear Hound-O Bowl",
    "Drybag for food": "Exped Fold Drybag UL",
    "Front Range harness": "Ruffwear Front Range Harness",
    "Front Range pack": "Ruffwear Front Range Day Pack",
    "Half Bag": "PHD Alpine Ultra Down Half Bag",
    "Hitch Hiker": "Ruffwear Hitch Hiker Leash",
    "Insulating Jacket": "Ruffwear Vert Jacket",
    "Knot-a-Hitch": "Ruffwear Knot-a-Hitch",
    "Leash": "Ruffwear Patroller Leash",
    "Raincoat": "Ruffwear Sun Shower Raincoat",
    "Sleeping bag": "Ruffwear Highlands Sleeping Bag",
    "Sleeping mat (half-length)": "Therm-a-Rest NeoAir UberLite (Small)",
    "Switchbak pack": "Ruffwear Switchbak Harness",
    "Towel": "PackTowl UltraLite",
    "XXS compression sack for blanket": "Sea to Summit Ultra-Sil eVent Compression Sack (XXS)",
}

# Short caveat shown as a hover tooltip on the "current" link badge, for
# cases where the live page is known to drift from what's actually owned
# (e.g. a retailer page that now shows a newer model generation) - kept out
# of the item's `comment` field so it doesn't add a permanent visible line
# for what's a link-specific caveat, not a general note about the item.
PACK_CURRENT_NOTE = {
    "Rucksack": "May show a newer generation than the one actually owned",
    "Raincover": "Owned version predates the current listing at this link",
    "Thermal sleeping bag liner": "Discontinued - link is a third-party review, not a product page",
}

# Short hover tooltip on the plain weight badge, for items whose listed
# weight bundles in something non-obvious (e.g. a stuff sack) that isn't
# itself a separate line in the list.
ITEM_WEIGHT_NOTE = {
    "Tarpaulin": "Includes stuff sack",
    "Tent": "Includes stuff sack",
    "Poles": "Includes stuff sack",
    "Thermal sleeping bag liner": "Includes stuff sack",
    "Insect shield travel sheet": "Includes stuff sack",
}

# Items with a rechargeable battery that should be charged before a trip -
# rendered as a second, independent checkbox alongside the normal packed
# one. Not split pack/anjo like PACK_CONSUMABLE - none of these names
# collide between the two sides, so one flat set covers both.
NEEDS_CHARGE = {
    "Headlamp", "Powerpack", "Lantern", "Mobile Phone", "Earphones",
    "Watch", "eReader", "GPS", "Beacon",
}

# Nights defaults per trip type, matching the day-counts the old spreadsheet
# used for each (overnight/trek/car camp) - exported to data.js so the
# checklist's nights stepper can default sensibly when you switch trip type.
NIGHTS_BY_TRIP = {"all": 2, "overnight": 1, "longTrek": 4, "carCamp": 5}

# Hand-picked, not auto-matched by keyword - Unicode's outdoor-gear coverage
# is thin enough that a keyword heuristic produces a lot of wrong guesses.
# Related-but-different items are deliberately given different icons where a
# sensible one exists (e.g. sleeping mats vs. bags/quilts/liners; firesteel
# vs. firepit/firelighters) rather than collapsing everything generic onto
# one symbol. Items with no entry fall back to ITEM_EMOJI_DEFAULT.
ITEM_EMOJI_DEFAULT = "📦"
ITEM_EMOJI = {
    "1l bladder for dirty water": "💧",
    "Active Camera": "📹",
    "Aeropress": "☕",
    "Rucksack": "🎒",
    "Lid pocket": "👝",
    "Bamboo cloth": "🧻",
    "Beacon": "🚨",
    "Beer": "🍺",
    "Blanket": "🛏️",
    "Bowl": "🥣",
    "Boxers": "🩲",
    "Boxers (spare)": "🩲",
    "Camera mount": "📷",
    "Camp socks": "🧦",
    "Chair": "🪑",
    "Charcoal": "⚫",
    "Charger": "🔌",
    "Clothes dry sack": "👝",
    "Coffee": "☕",
    "Cup": "🥤",
    "Drybag for food": "👝",
    "Drybag for poo": "👝",
    "Earphones": "🎧",
    "Firelighters": "🔥",
    "Firepit": "🔥",
    "Firesteel": "⚡",
    "First aid kit": "🩹",
    "Food": "🥘",
    "Food UL": "🥘",
    "Front Range harness": "🦮",
    "Front Range pack": "🎒",
    "GPS": "🛰️",
    "Garmin charging cable": "🔌",
    "Guy lines": "🪢",
    "Guy lines with clips": "🪢",
    "Gas can (100 g)": "⛽",
    "Gas can (230 g)": "⛽",
    "Grinder": "☕",
    "Half Bag": "🛏️",
    "Headlamp": "🔦",
    "Hitch Hiker": "🦮",
    "Insect shield travel sheet": "🪰",
    "Insulating Jacket": "🧥",
    "Knife": "🔪",
    "Knot-a-Hitch": "🦮",
    "Lantern": "🏮",
    "Leash": "🦮",
    "Liner Socks": "🧦",
    "Liner Socks (spare)": "🧦",
    "Merino neck tube": "🧣",
    "Midge net": "🦟",
    "Mobile Phone": "📱",
    "Pac Tube": "🧣",
    "Pillow/Stuff Sack": "🛏️",
    "Poo bags": "💩",
    "Pot": "🍲",
    "Powerpack": "🔋",
    "Quilt": "🛏️",
    "Quilt compression sack": "👝",
    "Rain Jacket": "☔",
    "Rain Pants": "☔",
    "Raincoat": "☔",
    "Raincover": "☔",
    "Repair kit": "🛠️",
    "Reservoir": "💧",
    "Silk sleeping bag liner": "🛏️",
    "Skin So Soft": "🧴",
    "Skinner": "🔪",
    "Sleeping bag": "🛏️",
    "Sleeping mat (half-length)": "🛌",
    "Sleeping mat, mummy, large": "🛌",
    "Small drybag for food": "👝",
    "Smidge": "🧴",
    "Solar panel": "☀️",
    "Spare phone battery": "🔋",
    "Spare small drybag": "👝",
    "Spare top": "👕",
    "Spork": "🍴",
    "Stash bag": "👝",
    "Stove with stash bag": "🔥",
    "Summer Trousers": "👖",
    "Sun Hood": "🧢",
    "Suncream": "🧴",
    "Swimming shorts": "🩳",
    "Switchbak pack": "🦮",
    "Talc": "🧂",
    "Tarpaulin": "⛺",
    "Tent": "⛺",
    "Poles": "🥢",
    "Triple Twister pegs": "📌",
    "Blizzard pegs": "🔻",
    "Thermal bottoms": "👖",
    "Thermal glove liners": "🧤",
    "Thermal sleeping bag liner": "🛏️",
    "Thermal top": "👕",
    "Tights": "👖",
    "Toothbrush": "🪥",
    "Toothpaste": "🪥",
    "Top": "👕",
    "Towel": "🧖",
    "USB-C Charging Cable": "🔌",
    "Vaseline": "🧴",
    "Walking Boots": "🥾",
    "Walking Socks": "🧦",
    "Walking Socks (spare)": "🧦",
    "Watch": "⌚",
    "Water": "💧",
    "Water filter": "🚰",
    "Wet wipes": "🧻",
    "Wine": "🍷",
    "Wine bladders": "🍷",
    "Winter Trousers": "👖",
    "XXS compression sack for blanket": "👝",
    "eReader": "📖",
    "microUSB Charging Cable": "🔌",
}


def build_items(rows, category_const=None, research_links=None, consumable_detail=None, current_label=None, current_note=None, weight_note=None):
    research_links = research_links or {}
    consumable_detail = consumable_detail or {}
    current_label = current_label or {}
    current_note = current_note or {}
    weight_note = weight_note or {}
    items = []
    for row in rows:
        name = field(row, "name")
        if not name or name == "Total":
            continue
        if name == "Food UL":
            # Merged into "Food" - see PACK_CONSUMABLE's comment override.
            continue
        number = parse_num(field(row, "number"))
        archived = is_true(field(row, "archived")) if "archived" in row else False
        if not (bool(number and number > 0) and not archived):
            # Inactive/archived rows aren't emitted at all - there's no more
            # archive section to show them in (see the "Unused gear" section
            # in app.js, which is a different, dynamic concept: active gear
            # that just doesn't match the current trip/season filters).
            continue
        current_raw = field(row, "current")
        onbody_raw = field(row, "on_body")
        detail_page = ITEM_DETAIL_PAGES.get(name)
        consumable = consumable_detail.get(name) if name in consumable_detail else None
        is_consumable = name in consumable_detail
        comment = field(row, "comment") or None
        if consumable and consumable.get("comment"):
            comment = consumable["comment"]
        items.append({
            "name": name,
            "emoji": ITEM_EMOJI.get(name, ITEM_EMOJI_DEFAULT),
            "category": category_const or field(row, "category") or "Miscellaneous",
            "number": number,
            "weightG": ITEM_WEIGHT_OVERRIDE.get(name, parse_num(field(row, "weight_g"))),
            "weightNote": weight_note.get(name),
            "cost": field(row, "cost_gbp") or None,
            "comment": comment,
            "current": current_raw or None,
            "currentIsUrl": current_raw.startswith("http"),
            "currentLabel": current_label.get(name),
            "currentNote": current_note.get(name),
            "needsCharge": name in NEEDS_CHARGE,
            "seasonByTrip": ITEM_SEASON_BY_TRIP.get(name),
            "season": field(row, "season") if "season" in row else "",
            "overnight": (consumable or {}).get("overnight", is_true(field(row, "overnight"))),
            "longTrek": (consumable or {}).get("longTrek", is_true(field(row, "long_trek"))),
            "carCamp": (consumable or {}).get("carCamp", is_true(field(row, "car_camp"))),
            "onBody": onbody_raw or None,
            "detailUrl": detail_page["url"] if detail_page else None,
            "detailLabel": detail_page["label"] if detail_page else None,
            "researchLinks": research_links.get(name, []),
            "consumable": is_consumable,
            "parentName": consumable["parent"] if consumable else ITEM_PARENT.get(name),
            "perNightAmount": consumable["amount"] if consumable else None,
            "perNightUnit": consumable["unit"] if consumable else None,
            "scalesWithNights": (consumable or {}).get("scalesWithNights", True),
            "maxAmount": (consumable or {}).get("max"),
            "stepOverride": (consumable or {}).get("step"),
            "quantityMax": ITEM_QUANTITY.get(name, {}).get("max"),
            "quantityMin": ITEM_QUANTITY.get(name, {}).get("min", 1),
        })
        items[-1]["season"] = items[-1]["season"] or None
    return items


def synthetic_consumable_item(name, category):
    """Build a synthetic item from its PACK_CONSUMABLE entry - used for
    consumables with no row in the spreadsheet at all (only a durable
    container that holds them). Every other entry in GEAR_ITEMS traces
    back to a real row; these are invented here instead."""
    detail = PACK_CONSUMABLE[name]
    return {
        "name": name,
        "emoji": ITEM_EMOJI.get(name, ITEM_EMOJI_DEFAULT),
        "category": category,
        "number": 1.0,
        "weightG": None,
        "weightNote": None,
        "cost": None,
        "comment": None,
        "current": None,
        "currentIsUrl": False,
        "currentLabel": None,
        "currentNote": None,
        "needsCharge": False,
        "seasonByTrip": None,
        "season": None,
        "overnight": detail.get("overnight", True),
        "longTrek": detail.get("longTrek", True),
        "carCamp": detail.get("carCamp", True),
        "onBody": None,
        "detailUrl": None,
        "detailLabel": None,
        "researchLinks": [],
        "consumable": True,
        "parentName": detail["parent"],
        "perNightAmount": detail["amount"],
        "perNightUnit": detail["unit"],
        "scalesWithNights": detail.get("scalesWithNights", True),
        "maxAmount": detail.get("max"),
        "stepOverride": detail.get("step"),
        "quantityMax": None,
        "quantityMin": 1,
    }


def synthetic_pack_items():
    return [
        # Human hydration has no row in the spreadsheet at all (only the
        # Reservoir container that holds it).
        synthetic_consumable_item("Water", "Kitchen"),
        # Same for wine - "Wine bladders" is the reusable container; the
        # wine itself was never tracked as its own row.
        synthetic_consumable_item("Wine", "Kitchen"),
    ]


# ---------------------------------------------------------------------------
# research sheets -> research-data.js
# ---------------------------------------------------------------------------

RESEARCH_SHEETS = [
    # (slug, title, group, description, current-pick match)
    ("waterproof-jackets", "Waterproof jackets",
     "Gear comparisons",
     "Rain jacket options compared by weight, hydrostatic head, breathability, "
     "and the sheet's own HH*B/weight performance score and price-per-ratio "
     "cost-efficiency score.",
     dict(brand="Patagonia", model="Torrentshell 3L", rank_col="Price per ratio", rank_asc=True,
          rank_label="price-per-ratio", item="Rain Jacket")),
    ("flasks", "Insulated flasks", "Gear comparisons",
     "Insulated bottle/flask options compared by hot/cold retention time, "
     "volume, weight, and cost - open research, nothing in the current pack "
     "list is one of these yet.",
     None),
    ("bags", "Backpacks", "Gear comparisons",
     "Backpack options compared by weight, volume, features, and the sheet's "
     "own cost-per-(volume/weight) efficiency score.",
     dict(brand="Osprey", model="Exos 48", rank_col="Cost per (Volume per Weight)", rank_asc=True,
          rank_label="cost-per-(volume/weight)", item="Rucksack")),
    ("tents", "Tents", "Gear comparisons",
     "Tent options compared by weight, pack size, floor/fly fabric ratings, "
     "whether the dog fits inside, and cost-per-area-efficiency.",
     dict(brand="Nordisk", model="Halland 2 LW", rank_col="cost/(area/weight)", rank_asc=True,
          rank_label="cost/(area/weight)", item="Tent")),
    ("insulated-jackets-2022", "Insulated jackets (2022)",
     "Gear comparisons",
     "Earlier insulated-jacket comparison by weight, insulation rating, and "
     "price-per-normalised-insulation.",
     dict(brand="Patagonia", model="Micro Puff", rank_col="price per", rank_asc=True,
          rank_label="price per", item="Insulating Jacket")),
    ("insulated-jackets-2024", "Insulated jackets (2024)",
     "Gear comparisons",
     "A later, larger insulated-jacket comparison using CLO/g/m² (warmth "
     "per weight) instead of the 2022 sheet's insulation rating - no single "
     "combined ratio column here, so rows aren't ranked, just listed.",
     dict(brand="Patagonia", model="Micro Puff Hoody", rank_col=None, rank_asc=True,
          rank_label=None, item="Insulating Jacket",
          note="Down jackets here are rated by fill power (FP); synthetics don't have one, "
               "so this sheet assigns them an equivalent FP for comparison. Both directions "
               "use the same formula, fitted from the sheet's own FP/CLO reference points "
               "(R² = 0.955): CLO/g/m² ≈ 1.81×10⁻⁸ × FP^2.227, or inverted, "
               "FP (equivalent) ≈ (CLO/g/m² ÷ 1.81×10⁻⁸)^(1/2.227).")),
    ("power", "Power banks & solar panels", "Gear comparisons",
     "Power bank / solar panel options compared by weight, solar/battery "
     "output, and the sheet's own price-per-ratio score.",
     dict(brand="Nitecore", model="NB20000", rank_col="Price / Ratio",
          rank_asc=True, rank_label="price/ratio", item="Powerpack")),
    ("chairs", "Camp chairs", "Gear comparisons",
     "Camp chair options compared by weight, seat/back height, and price - no "
     "combined ratio column in this sheet, so it's listed rather than ranked.",
     dict(brand="Helinox", model="Sunset (Home)", rank_col=None, rank_asc=True,
          rank_label=None, item="Chair")),
    ("snack-bars", "Snack bars", "Gear comparisons",
     "Snack bar / energy ball nutrition comparison: calories, protein and "
     "fibre per gram, feeding the trek food-planning sheet - the packing list "
     "just says \"Food\", so no single bar is marked as the current pick.",
     None),
    ("stoves", "Stoves", "Gear comparisons",
     "Stove options compared by fuel type, weight, boil/burn time, and the "
     "sheet's own features/weight/cost score. The row literally named "
     "\"Current Stove\" is the one in the pack list, but it has no cost/features "
     "recorded so it can't be ranked against the others.",
     dict(brand="Vango", model="Current Stove", rank_col=None, rank_asc=True,
          rank_label=None, item="Stove with stash bag")),
]

# Ultralight/Light/Trad/Heavy thresholds from the (now-removed) "summary"
# sheet's own classification table - reused to label the checklist's total
# weight instead. Each tuple is (from_kg, label); the last one whose
# threshold the weight meets or exceeds wins.
WEIGHT_CLASS_THRESHOLDS = [
    (0, "Ultralight"),
    (4.5, "Light"),
    (7, "Trad"),
    (14, "Heavy"),
]


def find_match_row(data_rows, brand, model):
    b, m = brand.lower(), model.lower()
    for i, row in enumerate(data_rows):
        joined = " ".join(row).lower()
        if b in joined and m in joined:
            return i
    return None


def build_research_sheet(slug, title, group, description, match, header, data_rows):
    width = max(len(header), max((len(r) for r in data_rows), default=0))
    header = header + [""] * (width - len(header))
    data_rows = [r + [""] * (width - len(r)) for r in data_rows]

    current_pick = None
    if match:
        idx = find_match_row(data_rows, match["brand"], match["model"])
        if idx is not None:
            current_pick = {"rowIndex": idx, "rankLabel": None, "rank": None, "outOf": len(data_rows)}
            if match["rank_col"] is not None:
                col = header.index(match["rank_col"])
                scored = []
                for i, r in enumerate(data_rows):
                    v = parse_num(cell(r, col))
                    if v is not None:
                        scored.append((v, i))
                scored.sort(reverse=not match["rank_asc"])
                rank_positions = {i: pos + 1 for pos, (_, i) in enumerate(scored)}
                if idx in rank_positions:
                    current_pick["rank"] = rank_positions[idx]
                    current_pick["outOf"] = len(scored)
                    current_pick["rankLabel"] = match["rank_label"]

    return {
        "slug": slug,
        "title": title,
        "group": group,
        "description": description,
        "columns": header,
        "rows": data_rows,
        "currentPick": current_pick,
        "note": (match or {}).get("note"),
    }


# ---------------------------------------------------------------------------
# first-aid-kit -> first-aid-data.js
# ---------------------------------------------------------------------------


def build_first_aid_items(rows):
    items = []
    for row in rows:
        name = field(row, "name")
        if not name:
            continue
        items.append({
            "name": name,
            "human": parse_num(field(row, "for_human")),
            "dog": parse_num(field(row, "for_dog")),
            "weightG": parse_num(field(row, "weight_g")),
            "comment": field(row, "comment") or None,
        })
    return items


# ---------------------------------------------------------------------------
# repair-kit -> repair-kit-data.js
# ---------------------------------------------------------------------------


def build_repair_kit_items(rows):
    items = []
    for row in rows:
        name = field(row, "name")
        if not name:
            continue
        items.append({
            "name": name,
            "quantity": parse_num(field(row, "quantity")) or 1,
            "weightG": parse_num(field(row, "weight_g")),
            "comment": field(row, "comment") or None,
            "current": field(row, "current") or None,
        })
    return items


def js_literal(value):
    return json.dumps(value, ensure_ascii=False, indent=2)


def main():
    with (DATA_DIR / "pack.csv").open(newline="", encoding="utf-8") as f:
        pack_reader = csv.DictReader(f)
        check_columns(pack_reader.fieldnames, PACK_REQUIRED_COLUMNS, "data/pack.csv")
        pack_rows = list(pack_reader)

    with (DATA_DIR / "anjo.csv").open(newline="", encoding="utf-8") as f:
        anjo_reader = csv.DictReader(f)
        check_columns(anjo_reader.fieldnames, ANJO_REQUIRED_COLUMNS, "data/anjo.csv")
        anjo_rows = list(anjo_reader)

    with (DATA_DIR / "first-aid-kit.csv").open(newline="", encoding="utf-8") as f:
        first_aid_rows = list(csv.DictReader(f))

    with (DATA_DIR / "repair-kit.csv").open(newline="", encoding="utf-8") as f:
        repair_kit_rows = list(csv.DictReader(f))

    # Research sheets are built first so their currentPick matches can be
    # turned into "see the research" links on the matching checklist item.
    research = []
    pack_research_links = {}
    for slug, title, group, description, match in RESEARCH_SHEETS:
        with (RESEARCH_DIR / f"{slug}.csv").open(newline="", encoding="utf-8") as f:
            rows = list(csv.reader(f))
        header, data_rows = rows[0], rows[1:]
        entry = build_research_sheet(slug, title, group, description, match, header, data_rows)
        research.append(entry)
        if entry["currentPick"] and match and match.get("item"):
            pack_research_links.setdefault(match["item"], []).append({
                "url": f"research/{slug}.html",
                "label": f"📊 {title.lower()}",
            })
    (ROOT / "research-data.js").write_text(
        "// Generated by scripts/extract_data.py - do not edit by hand.\n"
        f"const RESEARCH_SHEETS = {js_literal(research)};\n",
        encoding="utf-8",
    )

    # Only pack items get research links - none of the anjo-specific gear has
    # a comparison sheet yet, and a couple of item names (e.g. "Insulating
    # Jacket") are reused between the human and dog kit, so linking anjo
    # items too would misattribute the human's research to the dog's gear.
    pack_items = build_items(pack_rows, research_links=pack_research_links,
                              consumable_detail=PACK_CONSUMABLE,
                              current_label=PACK_CURRENT_LABEL,
                              current_note=PACK_CURRENT_NOTE,
                              weight_note=ITEM_WEIGHT_NOTE)
    pack_items += synthetic_pack_items()
    anjo_items = build_items(anjo_rows, category_const="Anjo",
                              consumable_detail=ANJO_CONSUMABLE,
                              current_label=ANJO_CURRENT_LABEL)
    gear_items = pack_items + anjo_items

    unmapped = sorted({it["name"] for it in gear_items if it["name"] not in ITEM_EMOJI})
    if unmapped:
        print(f"No ITEM_EMOJI entry for {len(unmapped)} item(s), using default {ITEM_EMOJI_DEFAULT!r}:")
        for name in unmapped:
            print(f"  {name}")

    unlabeled = sorted({it["name"] for it in gear_items if it["currentIsUrl"] and not it["currentLabel"]})
    if unlabeled:
        print(f"No PACK_CURRENT_LABEL/ANJO_CURRENT_LABEL entry for {len(unlabeled)} item(s) with a current URL, using generic 'view item':")
        for name in unlabeled:
            print(f"  {name}")

    known_names = {it["name"] for it in gear_items}
    all_consumable_names = set(PACK_CONSUMABLE) | set(ANJO_CONSUMABLE)
    stale_consumables = sorted(all_consumable_names - known_names)
    if stale_consumables:
        print(f"PACK_CONSUMABLE/ANJO_CONSUMABLE has {len(stale_consumables)} name(s) that don't match any item (typo?):")
        for name in stale_consumables:
            print(f"  {name}")

    invalid_parents = []
    for detail_dict, side_items in ((PACK_CONSUMABLE, pack_items), (ANJO_CONSUMABLE, anjo_items)):
        names_by_category = {}
        for it in side_items:
            names_by_category.setdefault(it["category"], set()).add(it["name"])
        for name, detail in detail_dict.items():
            if not detail or not detail.get("parent"):
                continue
            owner = next((it for it in side_items if it["name"] == name), None)
            if not owner:
                continue  # already reported above as a stale consumable name
            if detail["parent"] not in names_by_category.get(owner["category"], set()):
                invalid_parents.append(
                    f"{name!r} -> parent {detail['parent']!r} not found in category {owner['category']!r}"
                )
    if invalid_parents:
        print(f"{len(invalid_parents)} consumable parent(s) don't resolve to a real item in the same category:")
        for line in invalid_parents:
            print(f"  {line}")

    invalid_item_parents = []
    names_by_category = {}
    for it in gear_items:
        names_by_category.setdefault(it["category"], set()).add(it["name"])
    for name, parent in ITEM_PARENT.items():
        owner = next((it for it in gear_items if it["name"] == name), None)
        if not owner:
            invalid_item_parents.append(f"{name!r} -> not a known active item (typo?)")
            continue
        if parent not in names_by_category.get(owner["category"], set()):
            invalid_item_parents.append(
                f"{name!r} -> parent {parent!r} not found in category {owner['category']!r}"
            )
    if invalid_item_parents:
        print(f"{len(invalid_item_parents)} ITEM_PARENT entry(ies) invalid:")
        for line in invalid_item_parents:
            print(f"  {line}")

    # app.js keys checkbox/consumable-amount/quantity state by "category::name"
    # (a stable id, unlike an array index, that survives GEAR_ITEMS being
    # reordered or resized between regenerations) - it must stay unique.
    seen_keys = {}
    duplicate_keys = []
    for it in gear_items:
        key = f"{it['category']}::{it['name']}"
        if key in seen_keys:
            duplicate_keys.append(key)
        seen_keys[key] = True
    if duplicate_keys:
        print(f"{len(duplicate_keys)} duplicate category::name pair(s) - app.js's per-item state keying requires these to be unique:")
        for key in duplicate_keys:
            print(f"  {key}")

    stale_needs_charge = sorted(NEEDS_CHARGE - known_names)
    if stale_needs_charge:
        print(f"NEEDS_CHARGE has {len(stale_needs_charge)} name(s) that don't match any item (typo?):")
        for name in stale_needs_charge:
            print(f"  {name}")

    valid_trip_keys = {"overnight", "longTrek", "carCamp"}
    invalid_season_by_trip = []
    for name, overrides in ITEM_SEASON_BY_TRIP.items():
        if name not in known_names:
            invalid_season_by_trip.append(f"{name!r} -> not a known active item (typo?)")
            continue
        bad_keys = sorted(set(overrides) - valid_trip_keys)
        if bad_keys:
            invalid_season_by_trip.append(f"{name!r} -> invalid trip key(s) {bad_keys}")
    if invalid_season_by_trip:
        print(f"{len(invalid_season_by_trip)} ITEM_SEASON_BY_TRIP entry(ies) invalid:")
        for line in invalid_season_by_trip:
            print(f"  {line}")

    weight_class_js = ", ".join(f"[{kg}, {json.dumps(label)}]" for kg, label in WEIGHT_CLASS_THRESHOLDS)
    nights_js = json.dumps(NIGHTS_BY_TRIP, ensure_ascii=False)
    (ROOT / "data.js").write_text(
        "// Generated by scripts/extract_data.py - do not edit by hand.\n"
        f"const GEAR_ITEMS = {js_literal(gear_items)};\n"
        f"const WEIGHT_CLASS_THRESHOLDS = [{weight_class_js}];\n"
        f"const NIGHTS_BY_TRIP = {nights_js};\n",
        encoding="utf-8",
    )

    first_aid_items = build_first_aid_items(first_aid_rows)
    (ROOT / "first-aid-data.js").write_text(
        "// Generated by scripts/extract_data.py - do not edit by hand.\n"
        f"const FIRST_AID_ITEMS = {js_literal(first_aid_items)};\n",
        encoding="utf-8",
    )

    repair_kit_items = build_repair_kit_items(repair_kit_rows)
    (ROOT / "repair-kit-data.js").write_text(
        "// Generated by scripts/extract_data.py - do not edit by hand.\n"
        f"const REPAIR_KIT_ITEMS = {js_literal(repair_kit_items)};\n",
        encoding="utf-8",
    )

    # Detail-page kits (First aid kit, Repair kit) each have their own
    # itemised weight, entered by hand in pack.csv rather than computed -
    # warn if it's drifted from the sum of the kit's own contents, so a kit
    # edit doesn't silently leave the main checklist showing a stale total.
    repair_kit_sum = sum((it["weightG"] or 0) * it["quantity"] for it in repair_kit_items)
    repair_kit_listed = next((it["weightG"] for it in pack_items if it["name"] == "Repair kit"), None)
    if repair_kit_listed is not None and abs(repair_kit_listed - repair_kit_sum) > 0.05:
        print(f"Repair kit: pack.csv lists {repair_kit_listed} g but repair-kit.csv items sum to {repair_kit_sum} g")

    first_aid_base_sum = sum(
        it["weightG"] or 0 for it in first_aid_items
        if it["human"] is not None or (it["human"] is None and it["dog"] is None)
    )
    first_aid_listed = next((it["weightG"] for it in pack_items if it["name"] == "First aid kit"), None)
    if first_aid_listed is not None and abs(first_aid_listed - first_aid_base_sum) > 0.05:
        print(f"First aid kit: pack.csv lists {first_aid_listed} g but first-aid-kit.csv's human-relevant items sum to {first_aid_base_sum} g")

    print(f"Wrote data.js ({len(gear_items)} items: {len(pack_items)} pack + {len(anjo_items)} anjo)")
    print(f"Wrote first-aid-data.js ({len(first_aid_items)} items)")
    print(f"Wrote repair-kit-data.js ({len(repair_kit_items)} items)")
    print(f"Wrote research-data.js ({len(research)} sheets)")
    for r in research:
        cp = r["currentPick"]
        note = "no match" if not cp else (
            f"row {cp['rowIndex']}" + (f", rank {cp['rank']}/{cp['outOf']} by {cp['rankLabel']}" if cp["rank"] else "")
        )
        print(f"  {r['slug']:<24} {len(r['rows']):>3} rows  current-pick: {note}")


if __name__ == "__main__":
    main()
