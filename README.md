# Camping Gearlist

A mobile-friendly camping packing checklist, generated from `camping_gear.ods`.

**Live site:** https://chasnelson1990.github.io/camping-gearlist/

## What this is

- `index.html` — the checklist. Filter by trip type (overnight / long trek / car camp) and season, toggle categories on/off (including Anjo the dog's gear), tick items off as you pack. Selections persist for the browser tab's session (via `sessionStorage`) so navigating to a research or first-aid page and back keeps your progress - closing the tab clears it, and nothing is ever saved between devices or browsers. A collapsed **Archive** section at the bottom lists gear that's currently unused or retired, for reference.
- `first-aid-kit.html` — its own checklist for the itemised first-aid kit contents (human + dog), linked from the "First aid kit" entry on the main checklist.
- `research/` — one page per gear-comparison and reference sheet from the spreadsheet (jacket/tent/bag/stove/power-bank comparisons, the fill-power/CLO regression, the weight-budget summary, etc). Rows marked ★ are what's actually in the current pack list, matched against each sheet's own data — nothing is invented beyond what the spreadsheet already computes.

It's plain HTML/CSS/JS with no build step, no framework, and no backend, so it deploys straight from the repo via GitHub Pages.

## Updating the data

The spreadsheet (`data/camping_gear.ods`) is the source of truth. When it changes:

```
python3 scripts/extract_data.py          # regenerates data.js, first-aid-data.js, research-data.js
python3 scripts/generate_research_pages.py  # regenerates research/*.html from research-data.js
```

Both scripts use only the Python standard library (`zipfile` + `xml.etree`) to read the `.ods` directly — no dependencies to install. Commit the regenerated `data.js`, `first-aid-data.js`, `research-data.js`, and `research/*.html` alongside the updated `.ods`. `generate_research_pages.py` also deletes any `research/*.html` for sheets that no longer exist, so removing a sheet from `RESEARCH_SHEETS` cleans up its page automatically.

`scripts/extract_data.py` will raise an error if a column it depends on (e.g. `pack`'s `Category` or `Archive?` column, or `first-aid-kit`'s `For human`/`For dog` columns) has moved — update the relevant `*_COLS`/`*_HEADER_CHECK` constants at the top of the script to match if the sheet layout changes. The "currently used" matches on the research pages (`RESEARCH_SHEETS` in the same script) are hand-picked by brand/model name, not auto-detected — add or adjust entries there if gear changes. Items that get their own dedicated page (currently just "First aid kit") are listed in `ITEM_DETAIL_PAGES`.

## Local preview

```
python3 -m http.server
```

then open `http://localhost:8000/`.
