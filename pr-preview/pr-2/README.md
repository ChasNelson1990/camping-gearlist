# Camping Gearlist

A mobile-friendly camping packing checklist, generated from CSV data files.

**Live site:** https://chasnelson1990.github.io/camping-gearlist/

## What this is

- `index.html` — the checklist. Filter by trip type (overnight / long trek / car camp) and season, toggle categories on/off (including Anjo the dog's gear), tick items off as you pack. The itemised contents of the first aid kit, repair kit, and water purification kit are inlined as an expandable "kit manifest" under their own entry, rather than living on a separate page. Selections persist for the browser tab's session (via `sessionStorage`) so navigating to a research page and back keeps your progress - closing the tab clears it, and nothing is ever saved between devices or browsers. A collapsed **Unused gear** section at the bottom lists gear you own that just doesn't match the current trip type/season filters (e.g. winter clothing while "Summer" is selected) - switch filters to bring it back into the main list. Gear that's genuinely retired or never owned (quantity 0 in the CSV) isn't tracked on the site at all.
- `research/` — one page per gear-comparison sheet from the spreadsheet (jacket/tent/bag/stove/power-bank comparisons, etc), plus an index. Rows marked ★ are what's actually in the current pack list, matched against each sheet's own data — nothing is invented beyond what the spreadsheet already computes.
- `review/` — every item grouped by category with its trip/season flags shown explicitly, no checkboxes. A maintenance helper for auditing the gear list (e.g. spotting an item with no trip flags set) - not linked from anywhere else on the site, only reachable by visiting the URL directly.

It's plain HTML/CSS/JS with no build step, no framework, and no backend, so it deploys straight from the repo via GitHub Pages.

## Deployment / PR previews

`.github/workflows/pages-preview.yml` publishes to the `gh-pages` branch,
which is what GitHub Pages actually serves from (Settings → Pages):

- A push to `main` republishes the live site at the root
  (`https://chasnelson1990.github.io/camping-gearlist/`).
- Every pull request gets its own preview at
  `https://chasnelson1990.github.io/camping-gearlist/pr-preview/pr-<number>/`,
  with the link posted as a comment on the PR and kept up to date as you
  push more commits. It's removed automatically when the PR closes.

No build step is involved - it publishes the repo tree as-is, same as a
manual deploy would.

## Updating the data

Edit the relevant CSV file under `data/` (`data/pack.csv`, `data/anjo.csv`,
`data/first-aid-kit.csv`, `data/repair-kit.csv`,
`data/water-purification-kit.csv`, or a sheet under `data/research/`) in
any spreadsheet app or text editor, then regenerate the generated `.js`
files:

    python3 scripts/extract_data.py

This overwrites `data.js` and `research-data.js` (the first-aid/repair/water
kit CSVs are folded into `data.js` as ordinary child items - see
`KIT_PARENTS` in `scripts/extract_data.py`). Commit both the CSV change and
the regenerated `.js` files together.

## Local preview

```
python3 -m http.server
```

then open `http://localhost:8000/`.
