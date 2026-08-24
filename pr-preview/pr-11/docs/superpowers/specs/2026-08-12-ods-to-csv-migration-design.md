# Migrate data backend from .ods to CSV — Design

## Context

`data/camping_gear.ods` is the site's only source of truth: `scripts/extract_data.py`
reads it directly (via `zipfile` + `xml.etree.ElementTree`, since no
pandas/openpyxl is installed) and generates `data.js`, `research-data.js`, and
`first-aid-data.js`. As a binary spreadsheet, it doesn't diff meaningfully in
git — every edit shows as an opaque full-file change.

The pack/anjo gear list changes often (gear gets bought, swapped, retired);
the 10 research/comparison sheets are effectively write-once — the user won't
edit existing ones, only occasionally add new ones. Moving to CSV gives clean,
per-row git diffs for the gear list (the part that actually benefits from
history) at low cost for the research sheets (a one-time conversion, then the
same low-friction "add a new file" workflow as today).

Editing workflow (how the user will actually edit the CSVs day to day) is
explicitly out of scope for this design — to be addressed separately.

## File layout & schema

```
data/
  pack.csv
  anjo.csv
  first-aid-kit.csv
  research/
    waterproof-jackets.csv
    flasks.csv
    bags.csv
    tents.csv
    insulated-jackets-2022.csv
    insulated-jackets-2024.csv
    power.csv
    chairs.csv
    snack-bars.csv
    stoves.csv
```

`data/camping_gear.ods` is removed once the CSVs are verified to match.

### `data/pack.csv`

Columns: `name, category, number, weight_g, cost_gbp, comment, current, season, overnight, long_trek, car_camp, on_body, archived`

One row per item. Booleans (`overnight`, `long_trek`, `car_camp`, `archived`)
are `TRUE`/`FALSE` text, matching what's already in the sheet. Blank spacer
columns that exist only for the original sheet's layout are dropped.

### `data/anjo.csv`

Columns: `name, number, weight_g, cost_gbp, comment, current, overnight, long_trek, car_camp, on_body`

No `category` column (the code already hardcodes the constant `"Anjo"`) and no
`archived` column — anjo has no archive flag today; active/inactive is purely
`number > 0`. This is unchanged behavior, not a new gap introduced by the
migration.

### `data/first-aid-kit.csv`

Columns: `name, for_human, for_dog, weight_g, comment`

The old sheet had a second, offset copy of the same table crammed into
columns 6-16 (a spreadsheet artifact `extract_data.py` never read). It's
simply absent from the CSV — nothing downstream changes.

### `data/research/<slug>.csv`

Each file keeps whatever columns that particular comparison sheet actually
has — they vary sheet to sheet (e.g. `bags.csv` has volume/rainshell/hydration
columns; `stoves.csv` doesn't). The header row + data rows pass straight
through into `research-data.js`'s existing `columns`/`rows` shape, exactly as
today. `research/research.js` and `scripts/generate_research_pages.py` are
unaffected — they already treat a sheet's columns generically and don't
change at all in this migration.

## `scripts/extract_data.py` rewrite

- Drop `zipfile` and `xml.etree.ElementTree`; use the stdlib `csv` module.
- `pack.csv` / `anjo.csv` / `first-aid-kit.csv` are read via `csv.DictReader`.
  `build_items()` and `build_first_aid_items()` look up columns by name
  (`row["weight_g"]`, `row["on_body"]`, etc.) instead of today's
  `PACK_COLS`/`ANJO_COLS` integer-index maps. `check_header()` becomes a
  simple "are these column names present" assertion instead of a positional
  check.
- Research sheets are read via `csv.reader()` — first row is the header, the
  rest are data rows — and passed through into `research-data.js` unchanged
  in shape from today.
- `RESEARCH_SHEETS` metadata: drop the now-redundant ODS sheet-name field (the
  CSV filename already equals the slug). Change `rank_col` from a raw integer
  index (`rank_col=14`) to the actual column header text (e.g. bags.csv's
  `rank_col="Cost per (Volume per Weight)"`), resolved to a position via
  `header.index(...)` at runtime — removes the last positional magic number
  in the script and makes the metadata table self-documenting.
- Everything else — `ITEM_EMOJI`, `PACK_CONSUMABLE`/`ANJO_CONSUMABLE`,
  `ITEM_WEIGHT_OVERRIDE`, `ITEM_QUANTITY`, `find_match_row`, the
  Ultralight/Light/Trad/Heavy thresholds, and the validation warnings printed
  at the end of `main()` — is untouched. None of it depends on where the row
  data came from.

## Migration process

One-time, not kept in the repo afterward:

1. A throwaway script reuses the *current* `load_sheets()`/`parse_sheet()`
   ODS-reading code one last time to dump every sheet into the new CSV files,
   using the cleaned-up headers/columns above.
2. Regenerate `data.js` / `research-data.js` / `first-aid-data.js` using the
   new CSV-based `extract_data.py` and diff them against the last
   ODS-generated versions. They should be byte-for-byte identical except for
   the first-aid duplicate-table artifact (which was never read anyway).
3. Once verified clean: delete the throwaway conversion script, delete
   `data/camping_gear.ods`, and commit the CSVs plus the rewritten
   `extract_data.py` together.

## Documentation

Update `README.md`'s "Updating the data" section to reference editing the
CSVs (in any spreadsheet app or text editor) instead of the ODS. This is a
filename/format reference update only — a full day-to-day edit-workflow
writeup is explicitly deferred.

## Out of scope

- Day-to-day CSV editing workflow/tooling (separate follow-up).
- Any change to `index.html`, `app.js`, `first-aid.js`, `research.js`,
  `research.css`, `styles.css`, `theme.js`, or `generate_research_pages.py` —
  none of them read the data source directly; all consume the generated
  `.js` files, which keep the same shape.
