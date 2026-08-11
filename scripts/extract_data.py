#!/usr/bin/env python3
"""Regenerate data.js and research-data.js from data/camping_gear.ods.

Run this after editing the spreadsheet:

    python3 scripts/extract_data.py

Requires only the Python standard library (zipfile + xml.etree) - no
pandas/openpyxl needed. Reads content.xml directly out of the .ods (which is
a zip of XML files) and writes two plain JS files that the static site
loads with a plain <script> tag - no build step, no client-side parsing.
"""
import json
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ODS_PATH = ROOT / "data" / "camping_gear.ods"

NS = {
    "table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0",
    "text": "urn:oasis:names:tc:opendocument:xmlns:text:1.0",
}
T = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"


def load_sheets():
    with zipfile.ZipFile(ODS_PATH) as z:
        content = z.read("content.xml")
    root = ET.fromstring(content)
    sheets = {}
    for table in root.findall(".//table:table", NS):
        name = table.get(f"{T}name")
        sheets[name] = parse_sheet(table)
    return sheets


def parse_sheet(table):
    """Return a list of rows, each a list of cell strings, trimmed of
    trailing empty cells but with interior blanks preserved (so column
    position stays meaningful)."""
    rows = []
    for row in table.findall("table:table-row", NS):
        cells = row.findall("table:table-cell", NS)
        texts = []
        for cell in cells:
            repeat = int(cell.get(f"{T}number-columns-repeated", "1"))
            ps = cell.findall("text:p", NS)
            cell_text = " ".join("".join(p.itertext()) for p in ps)
            # Cap repeated-empty-cell expansion - real data never needs more
            # than a few dozen columns; this avoids blowing up on the
            # "rest of row is empty" cells ODS represents with huge repeats.
            texts.extend([cell_text] * min(repeat, 30))
        while texts and not texts[-1].strip():
            texts.pop()
        if any(t.strip() for t in texts):
            rows.append(texts)
    return rows


def cell(row, i):
    return row[i].strip() if i < len(row) else ""


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

# Column indices verified against the sheet headers in this session.
PACK_COLS = dict(
    name=0, number=2, on_body=6, season=7, overnight=8, long_trek=9,
    car_camp=10, current=11, category=12, weight=13, cost=16, comment=17,
    archive=18,
)
ANJO_COLS = dict(
    name=0, number=2, on_body=6, overnight=7, long_trek=8, car_camp=9,
    current=10, weight=11, cost=14, comment=15,
)
PACK_HEADER_CHECK = {0: "Item", 2: "Number", 12: "Category", 18: "Archive?"}
ANJO_HEADER_CHECK = {0: "Item", 2: "Number", 6: "In pack?"}

# Items that get their own dedicated checklist page (linked from their entry
# on the main checklist) instead of just being a single line with a weight.
ITEM_DETAIL_PAGES = {
    "First aid kit": {"url": "first-aid-kit.html", "label": "🩹 open kit checklist"},
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
#   amount:  suggested quantity per night (editable in the UI afterwards)
#   unit:    "g" or "ml" (ml counts 1:1 towards weight, in grams)
#   comment: overrides the item's own sheet comment, if given
#
# Pack and anjo are separate dicts because a couple of names exist on both
# sides ("Water", "Food") and need different parents/amounts on each.
PACK_CONSUMABLE = {
    "Gas can (100 g)": {"parent": "Stove with stash bag", "amount": 100, "unit": "g"},
    "Gas can (230 g)": None,  # archived; not covered by the design - keeps old flat/unscaled behavior
    "Coffee": {"parent": "Grinder", "amount": 14, "unit": "g"},
    "Water": {"parent": "Reservoir", "amount": 2000, "unit": "g"},
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
    "Skin So Soft": {"parent": None, "amount": 150, "unit": "g"},
    "Toothpaste": {"parent": "Toothbrush", "amount": 5, "unit": "g"},
    "Poo bags": None,
    "Beer": None,
}
ANJO_CONSUMABLE = {
    "Water": {"parent": None, "amount": 850, "unit": "g"},
    "Food": {"parent": "Drybag for food", "amount": 255, "unit": "g"},
    "Poo bags": None,
}

# Nights defaults per trip type, matching the day-counts the old spreadsheet
# used for each (overnight/trek/car camp) - exported to data.js so the
# checklist's nights stepper can default sensibly when you switch trip type.
NIGHTS_BY_TRIP = {"all": 2, "overnight": 2, "longTrek": 4, "carCamp": 5}

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
    "Backpack 48 l": "🎒",
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
    "Footprint": "⛺",
    "Front Range harness": "🦮",
    "Front Range pack": "🎒",
    "GPS": "🛰️",
    "Garmin charging cable": "🔌",
    "Gas can (100 g)": "⛽",
    "Gas can (230 g)": "⛽",
    "Grinder": "☕",
    "Half Bag": "🛏️",
    "Headlamp": "🔦",
    "Hitch Hiker": "🦮",
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
    "Sleeping bag compression sack": "👝",
    "Sleeping mat": "🛌",
    "Sleeping mat, mummy, large": "🛌",
    "Sleeping mat, mummy, short": "🛌",
    "Sleeping mat, rectangular": "🛌",
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
    "Tent (1.65 m^2) w/ footprint": "⛺",
    "Tent (4.4 m^2)": "⛺",
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
    "Wine bladders": "🍷",
    "Winter Trousers": "👖",
    "XXS compression sack for blanket": "👝",
    "eReader": "📖",
    "microUSB Charging Cable": "🔌",
}


def check_header(rows, expected):
    header = rows[0]
    for idx, text in expected.items():
        actual = cell(header, idx)
        if actual != text:
            raise SystemExit(
                f"Sheet layout changed: column {idx} is {actual!r}, "
                f"expected {text!r}. Update PACK_COLS/ANJO_COLS in "
                f"scripts/extract_data.py to match."
            )


def build_items(rows, cols, category_const=None, research_links=None, consumable_detail=None):
    check_header(rows, PACK_HEADER_CHECK if category_const is None else ANJO_HEADER_CHECK)
    research_links = research_links or {}
    consumable_detail = consumable_detail or {}
    items = []
    for row in rows[1:]:
        name = cell(row, cols["name"])
        if not name or name == "Total":
            continue
        if name == "Food UL":
            # Merged into "Food" - see PACK_CONSUMABLE's comment override.
            continue
        number = parse_num(cell(row, cols["number"]))
        archived = is_true(cell(row, cols["archive"])) if "archive" in cols else False
        active = bool(number and number > 0) and not archived
        current_raw = cell(row, cols["current"])
        onbody_raw = cell(row, cols["on_body"])
        detail_page = ITEM_DETAIL_PAGES.get(name)
        consumable = consumable_detail.get(name) if name in consumable_detail else None
        is_consumable = name in consumable_detail
        comment = cell(row, cols["comment"]) or None
        if consumable and consumable.get("comment"):
            comment = consumable["comment"]
        items.append({
            "name": name,
            "emoji": ITEM_EMOJI.get(name, ITEM_EMOJI_DEFAULT),
            "category": category_const or cell(row, cols["category"]) or "Miscellaneous",
            "active": active,
            "number": number,
            "weightG": parse_num(cell(row, cols["weight"])),
            "cost": cell(row, cols["cost"]) or None,
            "comment": comment,
            "current": current_raw or None,
            "currentIsUrl": current_raw.startswith("http"),
            "season": cell(row, cols["season"]) if "season" in cols else "",
            "overnight": (consumable or {}).get("overnight", is_true(cell(row, cols["overnight"]))),
            "longTrek": (consumable or {}).get("longTrek", is_true(cell(row, cols["long_trek"]))),
            "carCamp": (consumable or {}).get("carCamp", is_true(cell(row, cols["car_camp"]))),
            "onBody": onbody_raw or None,
            "archived": archived,
            "detailUrl": detail_page["url"] if detail_page else None,
            "detailLabel": detail_page["label"] if detail_page else None,
            "researchLinks": research_links.get(name, []),
            "consumable": is_consumable,
            "parentName": consumable["parent"] if consumable else None,
            "perNightAmount": consumable["amount"] if consumable else None,
            "perNightUnit": consumable["unit"] if consumable else None,
        })
        items[-1]["season"] = items[-1]["season"] or None
    return items


def synthetic_pack_items():
    """Human hydration has no row in the spreadsheet at all (only the
    Reservoir container that holds it) - this item is invented here, not
    derived from any sheet cell. Every other entry in GEAR_ITEMS traces
    back to a real row."""
    detail = PACK_CONSUMABLE["Water"]
    return [{
        "name": "Water",
        "emoji": ITEM_EMOJI.get("Water", ITEM_EMOJI_DEFAULT),
        "category": "Kitchen",
        "active": True,
        "number": 1.0,
        "weightG": None,
        "cost": None,
        "comment": None,
        "current": None,
        "currentIsUrl": False,
        "season": None,
        "overnight": True,
        "longTrek": True,
        "carCamp": True,
        "onBody": None,
        "archived": False,
        "detailUrl": None,
        "detailLabel": None,
        "researchLinks": [],
        "consumable": True,
        "parentName": detail["parent"],
        "perNightAmount": detail["amount"],
        "perNightUnit": detail["unit"],
    }]


# ---------------------------------------------------------------------------
# research sheets -> research-data.js
# ---------------------------------------------------------------------------

RESEARCH_SHEETS = [
    # (ods sheet name, slug, title, group, description, current-pick match)
    ("202208_waterproof-jackets", "waterproof-jackets", "Waterproof jackets",
     "Gear comparisons",
     "Rain jacket options compared by weight, hydrostatic head, breathability, "
     "and the sheet's own HH*B/weight performance score and price-per-ratio "
     "cost-efficiency score.",
     dict(brand="Patagonia", model="Torrentshell 3L", rank_col=10, rank_asc=True,
          rank_label="price-per-ratio", item="Rain Jacket")),
    ("20250403_flasks", "flasks", "Insulated flasks", "Gear comparisons",
     "Insulated bottle/flask options compared by hot/cold retention time, "
     "volume, weight, and cost - open research, nothing in the current pack "
     "list is one of these yet.",
     None),
    ("202206_bags", "bags", "Backpacks", "Gear comparisons",
     "Backpack options compared by weight, volume, features, and the sheet's "
     "own cost-per-(volume/weight) efficiency score.",
     dict(brand="Osprey", model="Exos 48", rank_col=14, rank_asc=True,
          rank_label="cost-per-(volume/weight)", item="Backpack 48 l")),
    ("202206_tents", "tents", "Tents", "Gear comparisons",
     "Tent options compared by weight, pack size, floor/fly fabric ratings, "
     "whether the dog fits inside, and cost-per-area-efficiency.",
     dict(brand="Nordisk", model="Halland 2 LW", rank_col=17, rank_asc=True,
          rank_label="cost/(area/weight)", item="Tent (1.65 m^2) w/ footprint")),
    ("202205_insulated-jackets", "insulated-jackets-2022", "Insulated jackets (2022)",
     "Gear comparisons",
     "Earlier insulated-jacket comparison by weight, insulation rating, and "
     "price-per-normalised-insulation.",
     dict(brand="Patagonia", model="Micro Puff", rank_col=9, rank_asc=True,
          rank_label="price per", item="Insulating Jacket")),
    ("202402_insulated-jackets", "insulated-jackets-2024", "Insulated jackets (2024)",
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
    ("202207_power", "power", "Power banks & solar panels", "Gear comparisons",
     "Power bank / solar panel options compared by weight, solar/battery "
     "output, and the sheet's own price-per-ratio score.",
     dict(brand="PowerTraveller", model="Extreme (battery only)", rank_col=8,
          rank_asc=True, rank_label="price/ratio", item="Powerpack")),
    ("202205_chairs", "chairs", "Camp chairs", "Gear comparisons",
     "Camp chair options compared by weight, seat/back height, and price - no "
     "combined ratio column in this sheet, so it's listed rather than ranked.",
     dict(brand="Helinox", model="Sunset (Home)", rank_col=None, rank_asc=True,
          rank_label=None, item="Chair")),
    ("202208_snack-bars", "snack-bars", "Snack bars", "Gear comparisons",
     "Snack bar / energy ball nutrition comparison: calories, protein and "
     "fibre per gram, feeding the trek food-planning sheet - the packing list "
     "just says \"Food\", so no single bar is marked as the current pick.",
     None),
    ("202304_stoves", "stoves", "Stoves", "Gear comparisons",
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


def find_match_row(rows, brand, model):
    b, m = brand.lower(), model.lower()
    for i, row in enumerate(rows[1:]):
        joined = " ".join(row).lower()
        if b in joined and m in joined:
            return i
    return None


def build_research_sheet(sheet_name, slug, title, group, description, match, all_rows):
    rows = all_rows[sheet_name]
    header, data_rows = rows[0], rows[1:]
    width = max(len(header), max((len(r) for r in data_rows), default=0))
    header = header + [""] * (width - len(header))
    data_rows = [r + [""] * (width - len(r)) for r in data_rows]

    current_pick = None
    if match:
        idx = find_match_row(rows, match["brand"], match["model"])
        if idx is not None:
            current_pick = {"rowIndex": idx, "rankLabel": None, "rank": None, "outOf": len(data_rows)}
            if match["rank_col"] is not None:
                col = match["rank_col"]
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
#
# This sheet also has a second, offset copy of the same table crammed into
# columns 6-16 (a spreadsheet artifact, not real data) - only columns 0-5
# are read.
# ---------------------------------------------------------------------------

FIRST_AID_HEADER_CHECK = {0: "Item", 1: "For human", 2: "For dog", 4: "Approx Weight/g"}


def build_first_aid_items(rows):
    check_header(rows, FIRST_AID_HEADER_CHECK)
    items = []
    for row in rows[1:]:
        name = cell(row, 0)
        if not name:
            continue
        items.append({
            "name": name,
            "human": parse_num(cell(row, 1)),
            "dog": parse_num(cell(row, 2)),
            "weightG": parse_num(cell(row, 4)),
            "comment": cell(row, 5) or None,
        })
    return items


def js_literal(value):
    return json.dumps(value, ensure_ascii=False, indent=2)


def main():
    sheets = load_sheets()

    # Research sheets are built first so their currentPick matches can be
    # turned into "see the research" links on the matching checklist item.
    research = []
    pack_research_links = {}
    for sheet_name, slug, title, group, description, match in RESEARCH_SHEETS:
        entry = build_research_sheet(sheet_name, slug, title, group, description, match, sheets)
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
    pack_items = build_items(sheets["pack"], PACK_COLS, research_links=pack_research_links,
                              consumable_detail=PACK_CONSUMABLE)
    pack_items += synthetic_pack_items()
    anjo_items = build_items(sheets["anjo"], ANJO_COLS, category_const="Anjo",
                              consumable_detail=ANJO_CONSUMABLE)
    gear_items = pack_items + anjo_items

    unmapped = sorted({it["name"] for it in gear_items if it["name"] not in ITEM_EMOJI})
    if unmapped:
        print(f"No ITEM_EMOJI entry for {len(unmapped)} item(s), using default {ITEM_EMOJI_DEFAULT!r}:")
        for name in unmapped:
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

    weight_class_js = ", ".join(f"[{kg}, {json.dumps(label)}]" for kg, label in WEIGHT_CLASS_THRESHOLDS)
    nights_js = json.dumps(NIGHTS_BY_TRIP, ensure_ascii=False)
    (ROOT / "data.js").write_text(
        "// Generated by scripts/extract_data.py - do not edit by hand.\n"
        f"const GEAR_ITEMS = {js_literal(gear_items)};\n"
        f"const WEIGHT_CLASS_THRESHOLDS = [{weight_class_js}];\n"
        f"const NIGHTS_BY_TRIP = {nights_js};\n",
        encoding="utf-8",
    )

    first_aid_items = build_first_aid_items(sheets["first-aid-kit"])
    (ROOT / "first-aid-data.js").write_text(
        "// Generated by scripts/extract_data.py - do not edit by hand.\n"
        f"const FIRST_AID_ITEMS = {js_literal(first_aid_items)};\n",
        encoding="utf-8",
    )

    print(f"Wrote data.js ({len(gear_items)} items: {len(pack_items)} pack + {len(anjo_items)} anjo)")
    print(f"Wrote first-aid-data.js ({len(first_aid_items)} items)")
    print(f"Wrote research-data.js ({len(research)} sheets)")
    for r in research:
        cp = r["currentPick"]
        note = "no match" if not cp else (
            f"row {cp['rowIndex']}" + (f", rank {cp['rank']}/{cp['outOf']} by {cp['rankLabel']}" if cp["rank"] else "")
        )
        print(f"  {r['slug']:<24} {len(r['rows']):>3} rows  current-pick: {note}")


if __name__ == "__main__":
    main()
