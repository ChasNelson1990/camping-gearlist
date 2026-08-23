# Consumables as Adjustable Sub-Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace consumables' static (often zero) weight figures with an adjustable per-night quantity, nested under whatever gear item requires them, multiplied by a trip-wide "nights" control.

**Architecture:** `scripts/extract_data.py` gains a hand-curated per-item detail table (parent item, suggested per-night amount, unit) analogous to the existing `ITEM_EMOJI`/`ITEM_DETAIL_PAGES` pattern, plus one synthetic item (human "Water", which has no spreadsheet row) and a small removal (folding "Food UL" into "Food"). `app.js` renders consumables as indented sub-rows under their parent with a live +/- stepper instead of a static weight badge, and a new nights stepper in the page controls multiplies every consumable's amount into the weight bars.

**Tech Stack:** Same as the rest of the project — plain HTML/CSS/vanilla JS, Python stdlib-only extraction script. No new dependencies.

## Global Constraints

- No persisted state anywhere on this site — nights and per-item amounts are in-memory only, reset on page reload, exactly like the existing checkbox state.
- `scripts/extract_data.py` remains stdlib-only (no pandas/openpyxl).
- Follow the existing hand-curated-dict pattern (`ITEM_EMOJI`, `ITEM_DETAIL_PAGES`) for anything not cleanly derivable from the spreadsheet — don't build a generic auto-detection heuristic.
- This project has no automated test suite; verification is manual, via a local `python3 -m http.server` plus the browser (Playwright), as used throughout the project so far. Every task's verification step follows that pattern, not `pytest`.
- Spec: `docs/superpowers/specs/2026-08-11-consumable-sub-items-design.md` — consult it for the full per-item rationale table if a step here is unclear.

---

### Task 1: `extract_data.py` — per-item consumable detail, Food UL merge, synthetic Water, nights defaults

**Files:**
- Modify: `scripts/extract_data.py`

**Interfaces:**
- Produces: every `GEAR_ITEMS` entry gains `parentName: string|null`, `perNightAmount: number|null`, `perNightUnit: "g"|"ml"|null`. `data.js` gains `const NIGHTS_BY_TRIP = {"all":2,"overnight":2,"longTrek":4,"carCamp":5};`. Pack's items include a new entry named `"Water"` (category `"Kitchen"`, `parentName: "Reservoir"`, `perNightAmount: 2000`, `perNightUnit: "g"`). `"Food UL"` no longer appears in `GEAR_ITEMS` at all (checklist or archive).

- [ ] **Step 1: Replace `ITEM_CONSUMABLE` with `PACK_CONSUMABLE` / `ANJO_CONSUMABLE` detail dicts and add `NIGHTS_BY_TRIP`**

In `scripts/extract_data.py`, find this block:

```python
# Items whose listed weight is a depleting/per-trip substance rather than
# durable gear - excluded from the weight-class calculation (which is meant
# to track base weight, like the spreadsheet's own Ultralight/Light/Trad/
# Heavy classification did) and flagged in the UI. Hand-picked rather than
# driven by the sheet's "Con. / trip" column: that column is also set on
# reusable containers (Reservoir, Wine bladders, gas canisters) where the
# listed weight is the container itself, not the substance it holds - only
# true consumables are listed here.
ITEM_CONSUMABLE = {
    "Food", "Food UL", "Coffee", "Water",
    "Gas can (100 g)", "Gas can (230 g)", "Beer",
    "Suncream", "Talc", "Wet wipes", "Smidge", "Vaseline", "Skin So Soft",
    "Toothpaste", "Poo bags",
}
```

Replace it with:

```python
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
```

- [ ] **Step 2: Update `build_items()` to skip "Food UL" and emit the three new fields**

Find this function:

```python
def build_items(rows, cols, category_const=None, research_links=None):
    check_header(rows, PACK_HEADER_CHECK if category_const is None else ANJO_HEADER_CHECK)
    research_links = research_links or {}
    items = []
    for row in rows[1:]:
        name = cell(row, cols["name"])
        if not name or name == "Total":
            continue
        number = parse_num(cell(row, cols["number"]))
        archived = is_true(cell(row, cols["archive"])) if "archive" in cols else False
        active = bool(number and number > 0) and not archived
        current_raw = cell(row, cols["current"])
        onbody_raw = cell(row, cols["on_body"])
        detail = ITEM_DETAIL_PAGES.get(name)
        items.append({
            "name": name,
            "emoji": ITEM_EMOJI.get(name, ITEM_EMOJI_DEFAULT),
            "category": category_const or cell(row, cols["category"]) or "Miscellaneous",
            "active": active,
            "number": number,
            "weightG": parse_num(cell(row, cols["weight"])),
            "cost": cell(row, cols["cost"]) or None,
            "comment": cell(row, cols["comment"]) or None,
            "current": current_raw or None,
            "currentIsUrl": current_raw.startswith("http"),
            "season": cell(row, cols["season"]) if "season" in cols else "",
            "overnight": is_true(cell(row, cols["overnight"])),
            "longTrek": is_true(cell(row, cols["long_trek"])),
            "carCamp": is_true(cell(row, cols["car_camp"])),
            "onBody": onbody_raw or None,
            "archived": archived,
            "detailUrl": detail["url"] if detail else None,
            "detailLabel": detail["label"] if detail else None,
            "consumable": name in ITEM_CONSUMABLE,
            "researchLinks": research_links.get(name, []),
        })
        items[-1]["season"] = items[-1]["season"] or None
    return items
```

Replace it with:

```python
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
            "overnight": is_true(cell(row, cols["overnight"])),
            "longTrek": is_true(cell(row, cols["long_trek"])),
            "carCamp": is_true(cell(row, cols["car_camp"])),
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
```

- [ ] **Step 3: Add `synthetic_pack_items()`**

Directly below the `build_items` function (before the `# research sheets -> research-data.js` section divider), add:

```python
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
```

- [ ] **Step 4: Wire the new pieces into `main()`**

Find:

```python
    # Only pack items get research links - none of the anjo-specific gear has
    # a comparison sheet yet, and a couple of item names (e.g. "Insulating
    # Jacket") are reused between the human and dog kit, so linking anjo
    # items too would misattribute the human's research to the dog's gear.
    pack_items = build_items(sheets["pack"], PACK_COLS, research_links=pack_research_links)
    anjo_items = build_items(sheets["anjo"], ANJO_COLS, category_const="Anjo")
    gear_items = pack_items + anjo_items

    unmapped = sorted({it["name"] for it in gear_items if it["name"] not in ITEM_EMOJI})
    if unmapped:
        print(f"No ITEM_EMOJI entry for {len(unmapped)} item(s), using default {ITEM_EMOJI_DEFAULT!r}:")
        for name in unmapped:
            print(f"  {name}")

    known_names = {it["name"] for it in gear_items}
    stale_consumables = sorted(ITEM_CONSUMABLE - known_names)
    if stale_consumables:
        print(f"ITEM_CONSUMABLE has {len(stale_consumables)} name(s) that don't match any item (typo?):")
        for name in stale_consumables:
            print(f"  {name}")

    weight_class_js = ", ".join(f"[{kg}, {json.dumps(label)}]" for kg, label in WEIGHT_CLASS_THRESHOLDS)
    (ROOT / "data.js").write_text(
        "// Generated by scripts/extract_data.py - do not edit by hand.\n"
        f"const GEAR_ITEMS = {js_literal(gear_items)};\n"
        f"const WEIGHT_CLASS_THRESHOLDS = [{weight_class_js}];\n",
        encoding="utf-8",
    )
```

Replace it with:

```python
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

    weight_class_js = ", ".join(f"[{kg}, {json.dumps(label)}]" for kg, label in WEIGHT_CLASS_THRESHOLDS)
    nights_js = json.dumps(NIGHTS_BY_TRIP, ensure_ascii=False)
    (ROOT / "data.js").write_text(
        "// Generated by scripts/extract_data.py - do not edit by hand.\n"
        f"const GEAR_ITEMS = {js_literal(gear_items)};\n"
        f"const WEIGHT_CLASS_THRESHOLDS = [{weight_class_js}];\n"
        f"const NIGHTS_BY_TRIP = {nights_js};\n",
        encoding="utf-8",
    )
```

- [ ] **Step 5: Run the script and verify no errors**

```bash
cd /home/chas/git/camping-gearlist && python3 scripts/extract_data.py
```

Expected: prints `Wrote data.js (120 items: 98 pack + 22 anjo)` — Food UL removal (-1) and the synthetic Water addition (+1) cancel out, so the pack count is unchanged at 98 and the total stays 120. No `PACK_CONSUMABLE/ANJO_CONSUMABLE has N name(s)` warning line should appear — if it does, a name in the dicts doesn't match any real/synthetic item name (typo) and must be fixed before continuing.

- [ ] **Step 6: Verify the generated data with a one-off Python check**

```bash
cd /home/chas/git/camping-gearlist && python3 -c "
import json
data = json.loads(open('data.js').read().split('const GEAR_ITEMS = ',1)[1].split('const WEIGHT_CLASS')[0].rstrip().rstrip(';\n'))
names = [d['name'] for d in data]
assert 'Food UL' not in names, 'Food UL should be gone'
water_pack = [d for d in data if d['name']=='Water' and d['category']=='Kitchen'][0]
assert water_pack['parentName'] == 'Reservoir', water_pack
assert water_pack['perNightAmount'] == 2000, water_pack
water_anjo = [d for d in data if d['name']=='Water' and d['category']=='Anjo'][0]
assert water_anjo['parentName'] is None, water_anjo
assert water_anjo['perNightAmount'] == 850, water_anjo
gas = [d for d in data if d['name']=='Gas can (100 g)'][0]
assert gas['parentName'] == 'Stove with stash bag', gas
food = [d for d in data if d['name']=='Food' and d['category']=='Kitchen'][0]
assert 'ultralight' in food['comment'], food
print('All checks passed')
"
grep -o 'NIGHTS_BY_TRIP.*' data.js
```

Expected: `All checks passed` and the `NIGHTS_BY_TRIP` line printed with all four keys.

- [ ] **Step 7: Commit**

```bash
git add scripts/extract_data.py data.js
git commit -m "$(cat <<'EOF'
feat: :bento: give consumables a per-night amount, parent, and nights export

PACK_CONSUMABLE/ANJO_CONSUMABLE replace the old flat ITEM_CONSUMABLE set
with per-item detail (parent item, suggested per-night amount, unit),
following the same hand-curated-dict pattern as ITEM_EMOJI. Food UL folds
into Food as a comment rather than a second line. Human "Water" is
injected as a synthetic item (no source row exists for it) nested under
Reservoir. NIGHTS_BY_TRIP exports the old spreadsheet's per-trip-type day
counts for the checklist's new nights control to default from.

This is data/generation only - app.js doesn't consume any of these new
fields yet, so the live site is unaffected until the next commit.
EOF
)"
```

---

### Task 2: `index.html` + `styles.css` — nights control and stepper/nesting styles

**Files:**
- Modify: `index.html`
- Modify: `styles.css`

**Interfaces:**
- Consumes: nothing from Task 1 directly (this task only adds markup/CSS; wiring happens in Task 3).
- Produces: `#nights-control`, `#nights-value`, `#nights-minus`, `#nights-plus` elements in `index.html` for Task 3 to wire up. CSS classes `.stepper`, `.stepper-btn`, `.stepper-value`, `.item.item-sub` for Task 3's rendered markup to use.

- [ ] **Step 1: Add the nights control markup**

In `index.html`, find:

```html
  <div class="filter-group" role="radiogroup" aria-label="Season" id="season-filter">
    <button type="button" data-value="all" class="chip active">All seasons</button>
    <button type="button" data-value="Summer" class="chip">Summer</button>
    <button type="button" data-value="Winter" class="chip">Winter</button>
  </div>
  <div class="filter-group" id="category-chips" aria-label="Categories"></div>
```

Replace it with:

```html
  <div class="filter-group" role="radiogroup" aria-label="Season" id="season-filter">
    <button type="button" data-value="all" class="chip active">All seasons</button>
    <button type="button" data-value="Summer" class="chip">Summer</button>
    <button type="button" data-value="Winter" class="chip">Winter</button>
  </div>
  <div class="nights-control" id="nights-control">
    <span class="nights-label">Nights:</span>
    <button type="button" id="nights-minus" class="stepper-btn" aria-label="Decrease nights">−</button>
    <span id="nights-value" class="nights-value">2</span>
    <button type="button" id="nights-plus" class="stepper-btn" aria-label="Increase nights">+</button>
  </div>
  <div class="filter-group" id="category-chips" aria-label="Categories"></div>
```

- [ ] **Step 2: Add nights-control and stepper-btn CSS**

In `styles.css`, find:

```css
.chip.category.off {
  opacity: .45;
}
```

Add directly after it:

```css
.chip.category.off {
  opacity: .45;
}

.nights-control {
  display: flex;
  align-items: center;
  gap: .5rem;
  padding-bottom: .6rem;
  font-size: .85rem;
  color: var(--text-muted);
}

.nights-value {
  font-weight: 600;
  color: var(--text);
  min-width: 1.4em;
  text-align: center;
}

.stepper-btn {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: .9rem;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
}
.stepper-btn:hover { background: var(--bg); }
```

(This produces one duplicated `.chip.category.off` block — remove the original so it appears only once, with the new rules following it.)

- [ ] **Step 3: Add per-item stepper and sub-item indentation CSS**

In `styles.css`, find:

```css
.badge-consumable {
  border-style: dashed;
  font-style: italic;
}
```

Add directly after it:

```css
.badge-consumable {
  border-style: dashed;
  font-style: italic;
}

.stepper {
  display: inline-flex;
  align-items: center;
  gap: .3rem;
}

.stepper-value {
  font-size: .72rem;
  color: var(--text-muted);
  min-width: 3.2em;
  text-align: center;
}
```

Then find:

```css
.item:last-child { border-bottom: none; }
```

Add directly after it:

```css
.item:last-child { border-bottom: none; }

.item.item-sub {
  padding-left: 2.3rem;
  background: color-mix(in srgb, var(--bg) 45%, var(--surface));
}

.item.item-sub .item-name {
  font-size: .9rem;
}
```

- [ ] **Step 4: Verify visually with a local server**

```bash
cd /home/chas/git/camping-gearlist && python3 -m http.server 8950 &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8950/
```

Expected: `200`. Load `http://localhost:8950/` in a browser (or via the Playwright MCP tool) and confirm: a "Nights: − 2 +" control appears between the season chips and the category chips, styled consistently with the rest of the controls bar (the +/- buttons don't do anything yet - that's Task 3). No console errors beyond the pre-existing harmless `favicon.ico` 404. Stop the server afterward (`kill %1` or equivalent).

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css
git commit -m "$(cat <<'EOF'
feat: :art: add nights-control and stepper/sub-item styles

Markup and CSS only - the +/- buttons aren't wired up yet (Task 3). Also
adds the .stepper/.item-sub classes app.js will use for per-item amount
controls and nested consumable rows.
EOF
)"
```

---

### Task 3: `app.js` — nesting, live steppers, and nights-aware weight calculation

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `item.parentName`, `item.perNightAmount`, `item.perNightUnit` (Task 1), `NIGHTS_BY_TRIP` global (Task 1), `#nights-control`/`#nights-value`/`#nights-minus`/`#nights-plus` (Task 2), `.stepper`/`.stepper-btn`/`.stepper-value`/`.item-sub` CSS classes (Task 2).
- Produces: no new externally-consumed interfaces — this is the last task in the chain, changes are all internal to `app.js`.

- [ ] **Step 1: Add nights state and the per-item amount store**

Find:

```js
  var state = {
    trip: "all",
    season: "all",
    categories: new Set(CATEGORY_ORDER.filter(function (c) {
      return items.some(function (it) { return it.category === c; });
    })),
  };

  var checked = new Set();
```

Replace with:

```js
  var state = {
    trip: "all",
    season: "all",
    nights: NIGHTS_BY_TRIP.all,
    categories: new Set(CATEGORY_ORDER.filter(function (c) {
      return items.some(function (it) { return it.category === c; });
    })),
  };

  var checked = new Set();

  // Live per-night amount for each consumable, keyed by item._id. Seeded
  // from perNightAmount, then freely editable via the +/- stepper.
  var consumableAmounts = new Map();
  items.forEach(function (it) {
    if (it.perNightAmount != null) consumableAmounts.set(it._id, it.perNightAmount);
  });
```

- [ ] **Step 2: Add `effectiveWeight`, `stepSize`, `adjustAmount`, and switch `sumWeight` to use `effectiveWeight`**

Find:

```js
  function sumWeight(list) {
    return list.reduce(function (sum, it) { return sum + (it.weightG || 0); }, 0);
  }
```

Replace with:

```js
  function effectiveWeight(item) {
    if (item.perNightAmount != null) {
      return (consumableAmounts.get(item._id) || 0) * state.nights;
    }
    return item.weightG || 0;
  }

  function stepSize(amount) {
    if (amount < 20) return 1;
    if (amount < 100) return 5;
    if (amount < 500) return 25;
    return 100;
  }

  function adjustAmount(id, delta) {
    var current = consumableAmounts.get(id) || 0;
    consumableAmounts.set(id, Math.max(0, current + delta));
    renderChecklist();
  }

  function sumWeight(list) {
    return list.reduce(function (sum, it) { return sum + effectiveWeight(it); }, 0);
  }
```

- [ ] **Step 3: Add `buildConsumableStepper` and update `buildMeta` to use it**

Find:

```js
  function buildMeta(item) {
    var wrap = document.createElement("div");
    wrap.className = "item-meta";
    if (item.weightG) wrap.appendChild(badge(formatWeight(item.weightG)));
    if (item.consumable) wrap.appendChild(badge("consumable", "badge-consumable"));
    if (item.season) wrap.appendChild(badge((item.season === "Summer" ? "☀ " : "❄ ") + item.season));
    if (item.onBody) wrap.appendChild(badge(onBodyLabel(item.onBody)));
    if (item.current) {
      if (item.currentIsUrl) {
        wrap.appendChild(linkBadge(item.current, "↗ view item", true));
      } else {
        wrap.appendChild(badge(item.current));
      }
    }
    if (item.detailUrl) {
      wrap.appendChild(linkBadge(item.detailUrl, item.detailLabel || "↗ details", false));
    }
    if (item.researchLinks) {
      item.researchLinks.forEach(function (link) {
        wrap.appendChild(linkBadge(link.url, link.label, false));
      });
    }
    return wrap;
  }
```

Replace with:

```js
  function buildConsumableStepper(item) {
    var wrap = document.createElement("span");
    wrap.className = "stepper";
    var amount = consumableAmounts.get(item._id) || 0;

    var minus = document.createElement("button");
    minus.type = "button";
    minus.className = "stepper-btn";
    minus.textContent = "−";
    minus.setAttribute("aria-label", "Decrease " + item.name + " amount");
    minus.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      adjustAmount(item._id, -stepSize(amount));
    });

    var value = document.createElement("span");
    value.className = "stepper-value";
    value.textContent = (amount % 1 === 0 ? amount : amount.toFixed(2)) + " " + item.perNightUnit;

    var plus = document.createElement("button");
    plus.type = "button";
    plus.className = "stepper-btn";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Increase " + item.name + " amount");
    plus.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      adjustAmount(item._id, stepSize(amount));
    });

    wrap.appendChild(minus);
    wrap.appendChild(value);
    wrap.appendChild(plus);
    return wrap;
  }

  function buildMeta(item, interactive) {
    interactive = interactive !== false;
    var wrap = document.createElement("div");
    wrap.className = "item-meta";
    if (item.perNightAmount != null) {
      if (interactive) {
        wrap.appendChild(buildConsumableStepper(item));
        var nights = state.nights;
        wrap.appendChild(badge("→ " + formatWeight(effectiveWeight(item)) + " / " + nights + " night" + (nights === 1 ? "" : "s")));
      } else {
        wrap.appendChild(badge(item.perNightAmount + " " + item.perNightUnit + "/night"));
      }
    } else if (item.weightG) {
      wrap.appendChild(badge(formatWeight(item.weightG)));
    }
    if (item.consumable) wrap.appendChild(badge("consumable", "badge-consumable"));
    if (item.season) wrap.appendChild(badge((item.season === "Summer" ? "☀ " : "❄ ") + item.season));
    if (item.onBody) wrap.appendChild(badge(onBodyLabel(item.onBody)));
    if (item.current) {
      if (item.currentIsUrl) {
        wrap.appendChild(linkBadge(item.current, "↗ view item", true));
      } else {
        wrap.appendChild(badge(item.current));
      }
    }
    if (item.detailUrl) {
      wrap.appendChild(linkBadge(item.detailUrl, item.detailLabel || "↗ details", false));
    }
    if (item.researchLinks) {
      item.researchLinks.forEach(function (link) {
        wrap.appendChild(linkBadge(link.url, link.label, false));
      });
    }
    return wrap;
  }
```

- [ ] **Step 4: `renderItem` takes an optional extra class, for sub-item indentation**

Find:

```js
  function renderItem(item) {
    var li = document.createElement("label");
    li.className = "item" + (checked.has(item._id) ? " checked" : "");
```

Replace with:

```js
  function renderItem(item, extraClass) {
    var li = document.createElement("label");
    li.className = "item" + (checked.has(item._id) ? " checked" : "") + (extraClass ? " " + extraClass : "");
```

- [ ] **Step 5: `renderCategorySection` nests children under their parent**

Find:

```js
    var ul = document.createElement("ul");
    ul.className = "items";
    catItems.forEach(function (item) { ul.appendChild(renderItem(item)); });
    section.appendChild(ul);
    return section;
  }
```

Replace with:

```js
    var ul = document.createElement("ul");
    ul.className = "items";
    var topLevel = catItems.filter(function (it) { return !it.parentName; });
    topLevel.forEach(function (item) {
      ul.appendChild(renderItem(item));
      catItems.filter(function (it) { return it.parentName === item.name; })
        .forEach(function (child) { ul.appendChild(renderItem(child, "item-sub")); });
    });
    section.appendChild(ul);
    return section;
  }
```

- [ ] **Step 6: Archive rendering uses the non-interactive `buildMeta`**

Find:

```js
        li.appendChild(itemNameEl(item, item.archived ? " — archived" : " — not currently used"));
        li.appendChild(buildMeta(item));
```

Replace with:

```js
        li.appendChild(itemNameEl(item, item.archived ? " — archived" : " — not currently used"));
        li.appendChild(buildMeta(item, false));
```

- [ ] **Step 7: Wire the nights control and reset nights on trip-type change**

Find:

```js
  function wireSegmented(id, stateKey) {
    var group = document.getElementById(id);
    group.querySelectorAll(".chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state[stateKey] = btn.dataset.value;
        group.querySelectorAll(".chip").forEach(function (b) { b.classList.toggle("active", b === btn); });
        renderChecklist();
      });
    });
  }
```

Replace with:

```js
  function wireSegmented(id, stateKey, onChange) {
    var group = document.getElementById(id);
    group.querySelectorAll(".chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state[stateKey] = btn.dataset.value;
        group.querySelectorAll(".chip").forEach(function (b) { b.classList.toggle("active", b === btn); });
        if (onChange) onChange(btn.dataset.value);
        renderChecklist();
      });
    });
  }

  function renderNightsControl() {
    document.getElementById("nights-value").textContent = state.nights;
  }
```

Then find, near the bottom of the file:

```js
  wireSegmented("trip-filter", "trip");
  wireSegmented("season-filter", "season");
  renderCategoryChips();
  renderChecklist();
  renderArchive();
})();
```

Replace with:

```js
  wireSegmented("trip-filter", "trip", function (value) {
    state.nights = NIGHTS_BY_TRIP[value];
    renderNightsControl();
  });
  wireSegmented("season-filter", "season");

  document.getElementById("nights-minus").addEventListener("click", function () {
    state.nights = Math.max(1, state.nights - 1);
    renderNightsControl();
    renderChecklist();
  });
  document.getElementById("nights-plus").addEventListener("click", function () {
    state.nights = state.nights + 1;
    renderNightsControl();
    renderChecklist();
  });

  renderCategoryChips();
  renderNightsControl();
  renderChecklist();
  renderArchive();
})();
```

- [ ] **Step 8: Syntax-check the file**

```bash
cd /home/chas/git/camping-gearlist && node -c app.js && echo "syntax OK"
```

Expected: `syntax OK` (ignore any unrelated `_zsh_nvm_load` shell warning if one appears before it).

- [ ] **Step 9: Manual verification via local server + browser**

```bash
cd /home/chas/git/camping-gearlist && python3 -m http.server 8951 &
sleep 1
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8951/
```

Expected: `200`. Then, in a browser (or via the Playwright MCP tool), against `http://localhost:8951/`:

1. Console has no errors beyond the harmless `favicon.ico` 404.
2. Nights control shows "2". Click "Long trek" trip chip → nights updates to "4" automatically. Click the nights `+` button → becomes "5" and stays there when you toggle a season chip; click "Overnight" → resets to "2".
3. In the Kitchen category, "Gas can (100 g)" renders as an indented row directly under "Stove with stash bag", showing a `− 100 g +` stepper instead of a plain weight badge, plus a "→ ..." total badge. Click `+` → value becomes 125 (step 25 at that magnitude) and the total/consumables weight bars update immediately.
4. "Water" appears twice: once indented under "Reservoir" in the Kitchen category showing `2000 g`, and once as a standalone row in the Anjo category showing `850 g` — confirm the Anjo one has no parent indentation.
5. Search the rendered page text for "Food UL" — it should not appear anywhere, including inside the collapsed Archive section.
6. Open the Archive section and find "Skin So Soft" — it shows a plain "150 g/night"-style badge, not an interactive stepper (no +/- buttons present in that row). ("Gas can (230 g)", also archived, has no approved per-night amount from the design - it keeps its old flat "150 g" weight badge, unchanged from before this feature.)
7. Resize to a mobile viewport (e.g. 390×844) and repeat a quick pass of points 1-3 to confirm nothing breaks on small screens.

Stop the server afterward (`kill %1` or equivalent) and remove any screenshot files taken during verification.

- [ ] **Step 10: Commit**

```bash
git add app.js
git commit -m "$(cat <<'EOF'
feat: :dango: nest consumables under their parent with live +/- steppers

Consumables with a parentName render as an indented row under that item
instead of their own top-level entry; ones with a perNightAmount get a
+/- stepper (magnitude-based step size) in place of the static weight
badge, feeding amount * nights into every weight bar via a new
effectiveWeight() used throughout sumWeight(). The nights control resets
to the trip type's default day-count on trip change and is otherwise
freely adjustable. Archive rendering stays non-interactive (buildMeta's
new second argument) - a plain "X unit/night" badge, no steppers, since
the archive is reference-only.
EOF
)"
```

---

### Task 4: Deploy and verify on GitHub Pages

**Files:** none (deployment only)

- [ ] **Step 1: Push**

```bash
cd /home/chas/git/camping-gearlist && git push
```

- [ ] **Step 2: Poll for the GitHub Pages build to finish**

```bash
for i in $(seq 1 10); do
  build_status=$(gh api repos/ChasNelson1990/camping-gearlist/pages/builds/latest 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('status','pending'))" 2>/dev/null)
  echo "attempt $i: $build_status"
  if [ "$build_status" = "built" ]; then break; fi
  sleep 6
done
```

Expected: eventually prints `built`. If it's still `building` after 10 attempts, run the loop again.

- [ ] **Step 3: Confirm the live site**

```bash
curl -s https://chasnelson1990.github.io/camping-gearlist/data.js | grep -c "NIGHTS_BY_TRIP"
curl -s https://chasnelson1990.github.io/camping-gearlist/data.js | grep -c '"Food UL"'
```

Expected: first command prints `1` (the constant is present), second prints `0` (Food UL is gone). Then repeat the same manual browser pass from Task 3 Step 9 against `https://chasnelson1990.github.io/camping-gearlist/` to confirm the deployed site behaves identically to the local one.
