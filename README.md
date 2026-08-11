# Camping Gearlist

A mobile-friendly camping packing checklist, generated from `camping_gear.ods`.

**Live site:** https://chasnelson1990.github.io/camping-gearlist/

## What this is

- `index.html` — the checklist. Filter by trip type (overnight / long trek / car camp) and season, toggle categories on/off (including Anjo the dog's gear), tick items off as you pack. Nothing is saved: reload the page and every checkbox resets. A collapsed **Archive** section at the bottom lists gear that's currently unused or retired, for reference.
- `research/` — one page per research sheet from the spreadsheet (jacket/tent/bag/stove/power-bank comparisons, food planning, the first-aid-kit breakdown, the Hebridean Way trip log, etc). Rows marked ★ are what's actually in the current pack list, matched against each sheet's own data — nothing is invented beyond what the spreadsheet already computes.

It's plain HTML/CSS/JS with no build step, no framework, and no backend, so it deploys straight from the repo via GitHub Pages.

## Updating the data

The spreadsheet (`data/camping_gear.ods`) is the source of truth. When it changes:

```
python3 scripts/extract_data.py          # regenerates data.js and research-data.js
python3 scripts/generate_research_pages.py  # regenerates research/*.html from research-data.js
```

Both scripts use only the Python standard library (`zipfile` + `xml.etree`) to read the `.ods` directly — no dependencies to install. Commit the regenerated `data.js`, `research-data.js`, and `research/*.html` alongside the updated `.ods`.

`scripts/extract_data.py` will raise an error if a column it depends on (e.g. `pack`'s `Category` or `Archive?` column) has moved — update `PACK_COLS`/`ANJO_COLS` at the top of the script to match if the sheet layout changes. The "currently used" matches on the research pages (`RESEARCH_SHEETS` in the same script) are hand-picked by brand/model name, not auto-detected — add or adjust entries there if gear changes.

## Local preview

```
python3 -m http.server
```

then open `http://localhost:8000/`.
