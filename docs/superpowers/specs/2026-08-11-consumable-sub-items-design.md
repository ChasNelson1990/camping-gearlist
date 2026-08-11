# Consumables as adjustable sub-items

## Context

Consumables (food, fuel, toiletries) were flagged with a `consumable` boolean so they could be excluded from the Ultralight/Light/Trad/Heavy base-weight classification, but their weight itself was still whatever static figure happened to be in the spreadsheet's `Weight/g` column — often 0 or `None`, since the sheet tracks a separate `Con. / trip` or `Con. / day` figure for genuine consumables that was never wired into the checklist's weight math. Adding "Water" (Anjo's) revealed this: it shows 0 g regardless of how much you'd actually carry.

A flat weight per consumable is also the wrong shape: how much coffee/gas/suncream you bring scales with trip length, and no single number is "right" for every trip. This spec replaces the static weight with an adjustable quantity: a suggested amount per night, multiplied by a trip-wide number-of-nights control, both editable at read time.

## Data model

Each consumable item gains (generated in `scripts/extract_data.py`, alongside the existing `ITEM_EMOJI`/`ITEM_CONSUMABLE`-style hand-curated dicts):

- `perNightAmount: number | null` — suggested quantity per night. `null` means "no known default, not scaled by nights" (only the two Poo bags rows — see table).
- `perNightUnit: "g" | "ml" | null` — `ml` is treated as ≈1 g for weight purposes (1 ml ≈ 1 g), per confirmed decision.
- `parentName: string | null` — the item this nests under in the UI, or `null` for a standalone consumable.

A new top-level constant, `NIGHTS_BY_TRIP`, exported alongside `WEIGHT_CLASS_THRESHOLDS` in `data.js`: `{ overnight: 2, longTrek: 4, carCamp: 5, all: 2 }`, sourced from the original spreadsheet's own per-trip-type day counts (already used once before it was removed as a standalone research page).

### Final per-item table

| Item | Parent | Suggested / night | Source |
|---|---|---|---|
| Gas can (100 g) | Stove with stash bag | 100 g | sheet's Con./trip (flagged as possibly too high — one canister usually lasts more than one night; adjustable in the UI regardless) |
| Coffee | Grinder | 14 g | sheet's Con./trip |
| Water (Anjo) | *(standalone)* | 850 g | sheet's Con./trip was 0 (not populated); used the "0.85 l" free-text note on that row instead |
| Water (human) | Reservoir | 2000 g | **synthetic** — no source row in the spreadsheet at all (see "Synthetic item" below); ~2 L/night backpacking-guideline estimate |
| Food (merged Food + Food UL) | Small drybag for food | 880 g | sheet's Con./day for "Food"; "Food UL"'s 787 g/day kept as a comment on this item, not a second row |
| Food (Anjo) | Drybag for food | 255 g | sheet's Con./day for Anjo's "Food" |
| Suncream | *(standalone)* | 50 g | sheet's Con./trip, 50 ml → g |
| Talc | *(standalone)* | 9.4 g | sheet's Con./trip |
| Wet wipes | *(standalone)* | 20 g | sheet's Con./trip |
| Vaseline | *(standalone)* | 43.25 g | sheet's Con./trip |
| Smidge | Midge net | 100 g | sheet's Con./trip, 100 ml → g |
| Skin So Soft *(inactive/archived)* | *(standalone)* | 150 g | sheet's Con./trip, 150 ml → g |
| Toothpaste | Toothbrush | 5 g | **estimate** — no source data in the sheet at all |
| Poo bags (pack) | *(standalone)* | *(none — flat)* | no Con. field in the sheet; stays a flat, non-scaling 34 g |
| Poo bags (Anjo) | *(standalone)* | *(none — flat)* | same, flat 34 g |

### Food UL removal

"Food UL" stops existing as its own `GEAR_ITEMS` entry — not shown in the checklist, not shown in the archive. Its only trace is the comment on the merged "Food" item. Kitchen's active item count drops by one as a result. This is a deliberate one-off exclusion in `build_items()`, not a general mechanism.

### Synthetic item: human Water

Every other item in `GEAR_ITEMS` is derived from a literal row in `camping_gear.ods`. Human "Water" is not — there's no row for it. `build_items()` will inject it directly (category `Kitchen`, `active: true`, no `overnight`/`longTrek`/`carCamp`/`season` restrictions, so it always shows when Reservoir does), clearly commented in the script as synthetic so a future reader isn't confused about why it doesn't trace back to a spreadsheet cell. Confirmed acceptable.

## UI/UX

### Nights control

A `− 2 +` stepper in the sticky controls area, alongside the existing trip-type/season chip rows. Behavior:
- Changing trip type resets nights to that type's default (`NIGHTS_BY_TRIP`), including switching to/from "All trips" (default 2).
- Manual +/- adjustments stick until the trip type changes again.
- Bounds: min 1, no hard max. Step 1.
- Session-only state, like everything else on this page — resets on reload.

### Sub-item nesting

A consumable with a `parentName` renders as an indented row directly beneath its parent's row, inside the same category card, instead of as its own top-level list entry. It still has its own checkbox (packing the item is still a real thing to track, distinct from how much of it). Standalone consumables (`parentName: null`) render as normal top-level rows, exactly as today.

Visibility: a sub-item shows only when *both* its parent is currently visible (same trip/season/category filtering as any other item) *and* its own trip/season flags pass. If the parent's filtered out, the sub-item is hidden with it.

### Editable per-night amount

Each consumable with a non-null `perNightAmount` gets a small `− 14 g +` stepper in place of the static weight badge. Step size derived from magnitude rather than hand-tuned per item:

```
step = 1   if amount < 20
step = 5   if 20 <= amount < 100
step = 25  if 100 <= amount < 500
step = 100 if amount >= 500
```

Minimum 0, no hard max. Displayed value is the live `amount`; the computed total for that item is `amount × nights`, shown as small trailing text (e.g. "→ 220 g for 2 nights"). Toothpaste's estimated 5 g/night gets the same stepper treatment as every other non-null item. Only the two Poo bags rows (`perNightAmount: null` — no source data at all, not even an estimate) keep their existing static weight badge instead — no stepper, not scaled by nights.

## Weight calculation integration

Wherever an item's weight is currently summed (main total/packed weight, the consumables bar), a nights-scaled consumable contributes `amount × nights` instead of its (mostly unused) `weightG`. Non-scaled items keep contributing flat `weightG` as today. No change to the Ultralight/Light/Trad/Heavy classification — it already excludes every `consumable` item and every `onBody` item, regardless of how their weight is computed.

## Archive

Archived consumables (Skin So Soft, Beer, Gas can 230 g) display their suggested per-night figure as a plain static badge (e.g. "150 g/night") — no interactive stepper, consistent with the archive being reference-only.

## Testing

- Manual verification via local `http.server` + Playwright, as used throughout this project: confirm nesting renders correctly under each parent, steppers adjust the displayed amount and the weight bars in real time, nights stepper resets correctly on trip-type change and persists across manual filter changes otherwise, Food UL is absent from both the checklist and archive, and the synthetic human Water item appears under Reservoir with no console errors.
- No automated test suite exists for this project; none is being introduced here.
