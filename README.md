# Camping Gearlist

A mobile-friendly camping packing checklist, generated from CSV data files.

**Live site:** https://chasnelson1990.github.io/camping-gearlist/

## What this is

- `index.html` — the checklist. Filter by trip type (overnight / long trek / car camp) and season, toggle categories on/off (including Anjo the dog's gear), tick items off as you pack. Selections persist for the browser tab's session (via `sessionStorage`) so navigating to a research or first-aid page and back keeps your progress - closing the tab clears it, and nothing is ever saved between devices or browsers. A collapsed **Unused gear** section at the bottom lists gear you own that just doesn't match the current trip type/season filters (e.g. winter clothing while "Summer" is selected) - switch filters to bring it back into the main list. Gear that's genuinely retired or never owned (quantity 0 in the CSV) isn't tracked on the site at all.
- `first-aid-kit.html` — its own checklist for the itemised first-aid kit contents (human + dog), linked from the "First aid kit" entry on the main checklist.
- `research/` — one page per gear-comparison and reference sheet from the spreadsheet (jacket/tent/bag/stove/power-bank comparisons, the fill-power/CLO regression, the weight-budget summary, etc). Rows marked ★ are what's actually in the current pack list, matched against each sheet's own data — nothing is invented beyond what the spreadsheet already computes.

It's plain HTML/CSS/JS with no build step, no framework, and no backend, so it deploys straight from the repo via GitHub Pages.

## Updating the data

Edit the relevant CSV file under `data/` (`data/pack.csv`, `data/anjo.csv`,
`data/first-aid-kit.csv`, or a sheet under `data/research/`) in any
spreadsheet app or text editor, then regenerate the generated `.js` files:

    python3 scripts/extract_data.py

This overwrites `data.js`, `research-data.js`, and `first-aid-data.js`.
Commit both the CSV change and the regenerated `.js` files together.

## Local preview

```
python3 -m http.server
```

then open `http://localhost:8000/`.
