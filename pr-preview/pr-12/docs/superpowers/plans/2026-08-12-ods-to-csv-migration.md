# Migrate Data Backend from .ods to CSV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `data/camping_gear.ods` with git-trackable CSV files as the source of truth for `scripts/extract_data.py`, with no change to any generated output.

**Architecture:** A one-time throwaway script converts the current ODS into 13 CSV files (`data/pack.csv`, `data/anjo.csv`, `data/first-aid-kit.csv`, `data/research/<slug>.csv` × 10) using clean, named columns. `scripts/extract_data.py` is rewritten to read those CSVs (via the stdlib `csv` module, by column name) instead of parsing ODS XML. The ODS is then deleted.

**Tech Stack:** Python 3 stdlib only (`csv`, `json`, `pathlib`) — no new dependencies.

## Global Constraints

- No automated test framework exists in this repo. Verification is: run `python3 scripts/extract_data.py`, inspect its printed summary, and diff the generated `data.js`/`research-data.js`/`first-aid-data.js` against git `HEAD` (per project convention established throughout this repo's history — see prior commits).
- Generated output (`data.js`, `research-data.js`, `first-aid-data.js`) must be byte-for-byte identical before and after this migration — this was verified during planning (see Task 2) and is the primary correctness gate.
- CSV values are raw, unparsed strings copied straight from the sheet (booleans as `TRUE`/`FALSE` text, numbers as plain numeric text, cost as the sheet's raw `£`-prefixed text) — `extract_data.py` already does all parsing (`parse_num`, `is_true`) at read time; the CSVs must not pre-parse or reformat anything.
- Per the approved spec (`docs/superpowers/specs/2026-08-12-ods-to-csv-migration-design.md`), CSV day-to-day editing workflow is explicitly out of scope for this plan.
- `research/research.js`, `research/research.css`, `scripts/generate_research_pages.py`, `index.html`, `app.js`, `first-aid.js`, `theme.js`, `styles.css` are NOT touched by this plan — none of them read the data source directly.

---

### Task 1: Convert the ODS into CSV files

**Files:**
- Create (temporary, deleted at the end of this task): `scripts/migrate_ods_to_csv.py`
- Create: `data/pack.csv`
- Create: `data/anjo.csv`
- Create: `data/first-aid-kit.csv`
- Create: `data/research/waterproof-jackets.csv`
- Create: `data/research/flasks.csv`
- Create: `data/research/bags.csv`
- Create: `data/research/tents.csv`
- Create: `data/research/insulated-jackets-2022.csv`
- Create: `data/research/insulated-jackets-2024.csv`
- Create: `data/research/power.csv`
- Create: `data/research/chairs.csv`
- Create: `data/research/snack-bars.csv`
- Create: `data/research/stoves.csv`

**Interfaces:**
- Produces: 13 CSV files under `data/` with the exact column headers below. Task 2's rewritten `extract_data.py` reads these files and depends on these exact header names.
  - `data/pack.csv`: `name,category,number,weight_g,cost_gbp,comment,current,season,overnight,long_trek,car_camp,on_body,archived`
  - `data/anjo.csv`: `name,number,weight_g,cost_gbp,comment,current,overnight,long_trek,car_camp,on_body`
  - `data/first-aid-kit.csv`: `name,for_human,for_dog,weight_g,comment`
  - `data/research/<slug>.csv`: whatever columns that sheet already has (header row copied verbatim from the ODS sheet).

- [ ] **Step 1: Write the one-time conversion script**

Create `scripts/migrate_ods_to_csv.py`:

```python
#!/usr/bin/env python3
"""One-time migration: dump data/camping_gear.ods into the new CSV layout
under data/. Run once, verify the output (see
docs/superpowers/plans/2026-08-12-ods-to-csv-migration.md, Task 1 Step 2),
then delete this script (Task 1 Step 4) - it is not meant to be run again."""
import csv
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
    rows = []
    for row in table.findall("table:table-row", NS):
        cells = row.findall("table:table-cell", NS)
        texts = []
        for cell_el in cells:
            repeat = int(cell_el.get(f"{T}number-columns-repeated", "1"))
            ps = cell_el.findall("text:p", NS)
            cell_text = " ".join("".join(p.itertext()) for p in ps)
            texts.extend([cell_text] * min(repeat, 30))
        while texts and not texts[-1].strip():
            texts.pop()
        if any(t.strip() for t in texts):
            rows.append(texts)
    return rows


def cell(row, i):
    return row[i].strip() if i < len(row) else ""


def write_csv(path, header, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)


PACK_COLS = dict(
    name=0, number=2, on_body=6, season=7, overnight=8, long_trek=9,
    car_camp=10, current=11, category=12, weight=13, cost=16, comment=17,
    archive=18,
)
ANJO_COLS = dict(
    name=0, number=2, on_body=6, overnight=7, long_trek=8, car_camp=9,
    current=10, weight=11, cost=14, comment=15,
)

PACK_HEADER = ["name", "category", "number", "weight_g", "cost_gbp", "comment",
               "current", "season", "overnight", "long_trek", "car_camp",
               "on_body", "archived"]
ANJO_HEADER = ["name", "number", "weight_g", "cost_gbp", "comment", "current",
               "overnight", "long_trek", "car_camp", "on_body"]
FIRST_AID_HEADER = ["name", "for_human", "for_dog", "weight_g", "comment"]

RESEARCH_SLUGS = {
    "202208_waterproof-jackets": "waterproof-jackets",
    "20250403_flasks": "flasks",
    "202206_bags": "bags",
    "202206_tents": "tents",
    "202205_insulated-jackets": "insulated-jackets-2022",
    "202402_insulated-jackets": "insulated-jackets-2024",
    "202207_power": "power",
    "202205_chairs": "chairs",
    "202208_snack-bars": "snack-bars",
    "202304_stoves": "stoves",
}


def convert_pack(rows):
    out = []
    for row in rows[1:]:
        name = cell(row, PACK_COLS["name"])
        if not name:
            continue
        out.append([
            name,
            cell(row, PACK_COLS["category"]),
            cell(row, PACK_COLS["number"]),
            cell(row, PACK_COLS["weight"]),
            cell(row, PACK_COLS["cost"]),
            cell(row, PACK_COLS["comment"]),
            cell(row, PACK_COLS["current"]),
            cell(row, PACK_COLS["season"]),
            cell(row, PACK_COLS["overnight"]),
            cell(row, PACK_COLS["long_trek"]),
            cell(row, PACK_COLS["car_camp"]),
            cell(row, PACK_COLS["on_body"]),
            cell(row, PACK_COLS["archive"]),
        ])
    return out


def convert_anjo(rows):
    out = []
    for row in rows[1:]:
        name = cell(row, ANJO_COLS["name"])
        if not name:
            continue
        out.append([
            name,
            cell(row, ANJO_COLS["number"]),
            cell(row, ANJO_COLS["weight"]),
            cell(row, ANJO_COLS["cost"]),
            cell(row, ANJO_COLS["comment"]),
            cell(row, ANJO_COLS["current"]),
            cell(row, ANJO_COLS["overnight"]),
            cell(row, ANJO_COLS["long_trek"]),
            cell(row, ANJO_COLS["car_camp"]),
            cell(row, ANJO_COLS["on_body"]),
        ])
    return out


def convert_first_aid(rows):
    out = []
    for row in rows[1:]:
        name = cell(row, 0)
        if not name:
            continue
        out.append([name, cell(row, 1), cell(row, 2), cell(row, 4), cell(row, 5)])
    return out


def main():
    sheets = load_sheets()

    pack_rows = convert_pack(sheets["pack"])
    anjo_rows = convert_anjo(sheets["anjo"])
    fa_rows = convert_first_aid(sheets["first-aid-kit"])

    write_csv(ROOT / "data" / "pack.csv", PACK_HEADER, pack_rows)
    write_csv(ROOT / "data" / "anjo.csv", ANJO_HEADER, anjo_rows)
    write_csv(ROOT / "data" / "first-aid-kit.csv", FIRST_AID_HEADER, fa_rows)

    print(f"pack.csv: {len(pack_rows)} data rows")
    print(f"anjo.csv: {len(anjo_rows)} data rows")
    print(f"first-aid-kit.csv: {len(fa_rows)} data rows")

    for ods_name, slug in RESEARCH_SLUGS.items():
        rows = sheets[ods_name]
        header, data_rows = rows[0], rows[1:]
        width = max(len(header), max((len(r) for r in data_rows), default=0))
        header = header + [""] * (width - len(header))
        data_rows = [r + [""] * (width - len(r)) for r in data_rows]
        write_csv(ROOT / "data" / "research" / f"{slug}.csv", header, data_rows)
        print(f"research/{slug}.csv: {len(data_rows)} data rows, {width} columns")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the script and verify row counts**

Run: `python3 scripts/migrate_ods_to_csv.py`

Expected output (verified against the real `camping_gear.ods` during planning — if any number differs, stop and investigate before continuing, don't proceed on a mismatch):

```
pack.csv: 99 data rows
anjo.csv: 23 data rows
first-aid-kit.csv: 23 data rows
research/waterproof-jackets.csv: 16 data rows, 11 columns
research/flasks.csv: 17 data rows, 12 columns
research/bags.csv: 18 data rows, 15 columns
research/tents.csv: 89 data rows, 20 columns
research/insulated-jackets-2022.csv: 15 data rows, 12 columns
research/insulated-jackets-2024.csv: 59 data rows, 14 columns
research/power.csv: 25 data rows, 9 columns
research/chairs.csv: 19 data rows, 6 columns
research/snack-bars.csv: 47 data rows, 10 columns
research/stoves.csv: 25 data rows, 21 columns
```

- [ ] **Step 3: Spot-check the CSVs by hand**

Open `data/pack.csv` and `data/anjo.csv` in a text editor (or `head -5 data/pack.csv`) and confirm:
- The header row matches the column list in this task's Interfaces section exactly.
- A row you recognize (e.g. "Backpack 48 l") has sensible values in each column (weight in `weight_g` as a plain number, `TRUE`/`FALSE` in the boolean columns, cost in `cost_gbp` with its `£` prefix intact).

Open `data/research/bags.csv` and confirm its header row is the sheet's original column headers (e.g. includes something like "Cost per (Volume per Weight)") and that an "Exos 48" row is present.

- [ ] **Step 4: Delete the throwaway migration script**

```bash
rm scripts/migrate_ods_to_csv.py
```

- [ ] **Step 5: Commit the new CSV files**

```bash
git add data/pack.csv data/anjo.csv data/first-aid-kit.csv data/research/
git commit -m "feat: :card_file_box: add CSV data files converted from camping_gear.ods"
```

Note: `data/camping_gear.ods` is NOT deleted yet — `scripts/extract_data.py` still reads it until Task 2 is done. Do not delete it in this task.

---

### Task 2: Rewrite `scripts/extract_data.py` to read from CSV

**Files:**
- Modify: `scripts/extract_data.py` (full-file rewrite — replace the entire file's contents)

**Interfaces:**
- Consumes: the 13 CSV files and exact column headers produced by Task 1.
- Produces: `data.js`, `research-data.js`, `first-aid-data.js` — same shape/content as before this migration (verified byte-identical during planning).

- [ ] **Step 1: Replace the entire contents of `scripts/extract_data.py`**

```python
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
    "Gas can (230 g)": None,  # archived; not covered by the design - keeps old flat/unscaled behavior
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
    "Skin So Soft": {"parent": None, "amount": 150, "unit": "g"},
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
# weight, multiplied by a live quantity (starts at 1, capped at max).
ITEM_QUANTITY = {
    "Wine bladders": {"max": 2},
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
    "Wine": "🍷",
    "Wine bladders": "🍷",
    "Winter Trousers": "👖",
    "XXS compression sack for blanket": "👝",
    "eReader": "📖",
    "microUSB Charging Cable": "🔌",
}


def build_items(rows, category_const=None, research_links=None, consumable_detail=None):
    research_links = research_links or {}
    consumable_detail = consumable_detail or {}
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
        active = bool(number and number > 0) and not archived
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
            "active": active,
            "number": number,
            "weightG": ITEM_WEIGHT_OVERRIDE.get(name, parse_num(field(row, "weight_g"))),
            "cost": field(row, "cost_gbp") or None,
            "comment": comment,
            "current": current_raw or None,
            "currentIsUrl": current_raw.startswith("http"),
            "season": field(row, "season") if "season" in row else "",
            "overnight": (consumable or {}).get("overnight", is_true(field(row, "overnight"))),
            "longTrek": (consumable or {}).get("longTrek", is_true(field(row, "long_trek"))),
            "carCamp": (consumable or {}).get("carCamp", is_true(field(row, "car_camp"))),
            "onBody": onbody_raw or None,
            "archived": archived,
            "detailUrl": detail_page["url"] if detail_page else None,
            "detailLabel": detail_page["label"] if detail_page else None,
            "researchLinks": research_links.get(name, []),
            "consumable": is_consumable,
            "parentName": consumable["parent"] if consumable else None,
            "perNightAmount": consumable["amount"] if consumable else None,
            "perNightUnit": consumable["unit"] if consumable else None,
            "scalesWithNights": (consumable or {}).get("scalesWithNights", True),
            "maxAmount": (consumable or {}).get("max"),
            "stepOverride": (consumable or {}).get("step"),
            "quantityMax": ITEM_QUANTITY.get(name, {}).get("max"),
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
        "active": True,
        "number": 1.0,
        "weightG": None,
        "cost": None,
        "comment": None,
        "current": None,
        "currentIsUrl": False,
        "season": None,
        "overnight": detail.get("overnight", True),
        "longTrek": detail.get("longTrek", True),
        "carCamp": detail.get("carCamp", True),
        "onBody": None,
        "archived": False,
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
          rank_label="cost-per-(volume/weight)", item="Backpack 48 l")),
    ("tents", "Tents", "Gear comparisons",
     "Tent options compared by weight, pack size, floor/fly fabric ratings, "
     "whether the dog fits inside, and cost-per-area-efficiency.",
     dict(brand="Nordisk", model="Halland 2 LW", rank_col="cost/(area/weight)", rank_asc=True,
          rank_label="cost/(area/weight)", item="Tent (1.65 m^2) w/ footprint")),
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
     dict(brand="PowerTraveller", model="Extreme (battery only)", rank_col="Price / Ratio",
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
                              consumable_detail=PACK_CONSUMABLE)
    pack_items += synthetic_pack_items()
    anjo_items = build_items(anjo_rows, category_const="Anjo",
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

    first_aid_items = build_first_aid_items(first_aid_rows)
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
```

- [ ] **Step 2: Run the rewritten script**

Run: `python3 scripts/extract_data.py`

Expected output (verified during planning — matches the ODS-based script's output exactly):

```
Wrote data.js (121 items: 99 pack + 22 anjo)
Wrote first-aid-data.js (23 items)
Wrote research-data.js (10 sheets)
  waterproof-jackets        16 rows  current-pick: row 2, rank 12/16 by price-per-ratio
  flasks                    17 rows  current-pick: no match
  bags                      18 rows  current-pick: row 13
  tents                     89 rows  current-pick: row 67
  insulated-jackets-2022    15 rows  current-pick: row 3, rank 4/15 by price per
  insulated-jackets-2024    59 rows  current-pick: row 33
  power                     25 rows  current-pick: row 8, rank 7/24 by price/ratio
  chairs                    19 rows  current-pick: row 8
  snack-bars                47 rows  current-pick: no match
  stoves                    25 rows  current-pick: row 0
```

No warning lines (e.g. "No ITEM_EMOJI entry for...") should appear above this output — if any do, stop and investigate; they indicate a name or column mismatch introduced by the migration, not a pre-existing issue (the ODS-based script produces none today).

- [ ] **Step 3: Diff the generated files against git HEAD**

Run: `git diff --stat data.js research-data.js first-aid-data.js`

Expected: no output (empty diff) — these files must be byte-for-byte identical to their last ODS-generated versions. If there is any diff, do not proceed: investigate the discrepancy (most likely a column name or `rank_col` header-text mismatch) and fix `extract_data.py` before continuing.

- [ ] **Step 4: Serve the site locally and smoke-test**

```bash
python3 -m http.server 8981
```

Open `http://localhost:8981/` in a browser (or use Playwright) and confirm: the checklist renders with items, weights, and emoji as before; toggling a trip-type filter changes the visible set; a research page (e.g. `research/bags.html`) still shows its table with the "Exos 48" row starred. Check the browser console for errors (only the harmless `favicon.ico` 404 is expected). Stop the server when done.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract_data.py
git commit -m "refactor: :recycle: read extract_data.py's source data from CSV instead of ODS"
```

(No need to `git add` `data.js`/`research-data.js`/`first-aid-data.js` — Step 3 confirmed they have no diff.)

---

### Task 3: Remove the ODS and update documentation

**Files:**
- Delete: `data/camping_gear.ods`
- Modify: `README.md`

**Interfaces:**
- Consumes: nothing new — this task only removes the now-unused ODS and updates prose.

- [ ] **Step 1: Delete the ODS**

```bash
git rm data/camping_gear.ods
```

- [ ] **Step 2: Update README's "Updating the data" section**

Open `README.md` and find the "Updating the data" section (references editing `camping_gear.ods` and running `scripts/extract_data.py`). Replace the ODS-specific instructions with:

```markdown
## Updating the data

Edit the relevant CSV file under `data/` (`data/pack.csv`, `data/anjo.csv`,
`data/first-aid-kit.csv`, or a sheet under `data/research/`) in any
spreadsheet app or text editor, then regenerate the generated `.js` files:

    python3 scripts/extract_data.py

This overwrites `data.js`, `research-data.js`, and `first-aid-data.js`.
Commit both the CSV change and the regenerated `.js` files together.
```

(Match the exact heading text and surrounding structure already in `README.md` — replace only the paragraph(s) that reference the `.ods` file and the old workflow; leave the rest of the README, including the "What this is" section's file listing, untouched except for the `index.html` bullet's persistence description if present, which is unrelated to this migration and must not be touched.)

- [ ] **Step 3: Final full re-verification**

```bash
python3 scripts/extract_data.py
git diff --stat data.js research-data.js first-aid-data.js
git status
```

Expected: the `git diff --stat` line is still empty, and `git status` shows only `README.md` modified and `data/camping_gear.ods` deleted (already staged from Step 1) — no unexpected changes to any generated file.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: :recycle: update README for CSV-based data workflow, drop camping_gear.ods"
```

- [ ] **Step 5: Push and confirm GitHub Pages redeploys cleanly**

```bash
git push
```

Poll `gh api repos/ChasNelson1990/camping-gearlist/pages/builds/latest --jq .status` until it reports `built`, then `curl` the live site's `data.js` and a research page (e.g. `research/bags.html`) to confirm they still serve correctly. This is a pure refactor with no output change, so no functional difference is expected on the live site — this step only confirms the deploy pipeline itself still works with the ODS gone.
