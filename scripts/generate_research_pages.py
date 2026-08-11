#!/usr/bin/env python3
"""Regenerate research/<slug>.html and research/index.html from research-data.js.

Run after scripts/extract_data.py (which writes research-data.js). Keeps each
research sheet as its own static, bookmarkable page with zero server logic,
as required for GitHub Pages.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

THEME_INIT_SCRIPT = (
    '<script>(function(){try{document.documentElement.setAttribute('
    '"data-theme",localStorage.getItem("camping-theme")==="light"?"light":"dark");}'
    'catch(e){document.documentElement.setAttribute("data-theme","dark");}})();</script>'
)

PAGE_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title} — Camping Gear Research</title>
<meta name="description" content="{description}">
{theme_init}
<link rel="stylesheet" href="../styles.css">
<link rel="stylesheet" href="research.css">
</head>
<body>
<header class="topbar">
  <a class="research-link" href="index.html">← All research</a>
  <div class="topbar-actions">
    <a class="research-link" href="../index.html">Checklist</a>
    <button type="button" id="theme-toggle" class="theme-toggle" aria-label="Toggle light/dark theme">☀️</button>
  </div>
</header>
<main class="research-main">
  <h1 id="title"></h1>
  <p id="description" class="description"></p>
  <div id="callout"></div>
  <div class="table-wrap"><table id="table"></table></div>
</main>
<script src="../theme.js"></script>
<script src="../research-data.js"></script>
<script src="research.js"></script>
<script>renderSheet({slug_json});</script>
</body>
</html>
"""

INDEX_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Gear Research — Camping Checklist</title>
<meta name="description" content="Product comparisons, trip planning and reference sheets behind the camping gear checklist.">
{theme_init}
<link rel="stylesheet" href="../styles.css">
<link rel="stylesheet" href="research.css">
</head>
<body>
<header class="topbar">
  <h1 style="font-size:1.15rem;margin:0;">📊 Gear Research</h1>
  <div class="topbar-actions">
    <a class="research-link" href="../index.html">Checklist →</a>
    <button type="button" id="theme-toggle" class="theme-toggle" aria-label="Toggle light/dark theme">☀️</button>
  </div>
</header>
<main class="research-main">
  <p class="description">The comparison spreadsheets behind the packing list. Rows marked ★ are what's actually in the current pack list, where a confident match exists.</p>
  <div class="groups">
{groups}
  </div>
</main>
<script src="../theme.js"></script>
</body>
</html>
"""

GROUP_ORDER = ["Gear comparisons"]


def esc(s):
    return (s or "").replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")


def main():
    js = (ROOT / "research-data.js").read_text(encoding="utf-8")
    payload = js.split("=", 1)[1].rstrip().rstrip(";")
    sheets = json.loads(payload)

    # Remove pages for sheets that no longer exist (e.g. moved out of
    # RESEARCH_SHEETS in extract_data.py) so stale pages don't linger.
    current_slugs = {sheet["slug"] for sheet in sheets}
    for existing in (ROOT / "research").glob("*.html"):
        if existing.stem not in current_slugs and existing.name != "index.html":
            existing.unlink()
            print(f"Removed stale research/{existing.name}")

    for sheet in sheets:
        html = PAGE_TEMPLATE.format(
            title=esc(sheet["title"]),
            description=esc(sheet["description"]),
            slug_json=json.dumps(sheet["slug"]),
            theme_init=THEME_INIT_SCRIPT,
        )
        (ROOT / "research" / f"{sheet['slug']}.html").write_text(html, encoding="utf-8")

    by_group = {g: [] for g in GROUP_ORDER}
    for sheet in sheets:
        by_group.setdefault(sheet["group"], []).append(sheet)

    groups_html = []
    for group in GROUP_ORDER:
        items = by_group.get(group, [])
        if not items:
            continue
        li = "\n".join(
            f'      <li><a href="{s["slug"]}.html"><div class="sheet-title">{esc(s["title"])}</div>'
            f'<div class="sheet-desc">{esc(s["description"])}</div></a></li>'
            for s in items
        )
        groups_html.append(f'    <section>\n      <h2>{esc(group)}</h2>\n      <ul class="sheet-list">\n{li}\n      </ul>\n    </section>')

    (ROOT / "research" / "index.html").write_text(
        INDEX_TEMPLATE.format(groups="\n".join(groups_html), theme_init=THEME_INIT_SCRIPT),
        encoding="utf-8",
    )

    print(f"Wrote research/index.html and {len(sheets)} sheet pages")


if __name__ == "__main__":
    main()
