(function () {
  "use strict";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Builds the same topbar (research-link / brand / theme toggle) used on
  // the main checklist. theme.js runs on the very next <script> tag after
  // this page's content is built (see the per-page HTML - deliberately
  // loaded last), so it finds #theme-toggle already in the DOM by the time
  // it wires the click handler up.
  function buildTopbar(leftLinks, rightLinks) {
    var header = el("header", "topbar");

    var left = el("div", "topbar-links");
    leftLinks.forEach(function (l) {
      var a = el("a", "topbar-link", l.label);
      a.href = l.href;
      left.appendChild(a);
    });
    header.appendChild(left);

    var brand = el("div", "brand");
    brand.appendChild(el("span", "brand-diamond"));
    brand.appendChild(document.createTextNode("Anjo & Co."));
    brand.appendChild(el("span", "brand-diamond"));
    header.appendChild(brand);

    var right = el("div", "topbar-actions");
    rightLinks.forEach(function (l) {
      var a = el("a", "topbar-link", l.label);
      a.href = l.href;
      right.appendChild(a);
    });
    var toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "theme-toggle";
    toggle.className = "theme-toggle";
    toggle.setAttribute("aria-label", "Toggle light/dark theme");
    // Set from data-theme (already applied by the inline <head> script)
    // rather than left blank for theme.js to fill in - otherwise there's a
    // brief flash of an unlabelled button before theme.js's script tag
    // finishes loading, and a permanently blank one if it fails to load at
    // all. index.html/review's static topbar markup hardcodes this same
    // fallback for the same reason.
    toggle.textContent = document.documentElement.getAttribute("data-theme") === "light" ? "Daylight" : "Nightfall";
    right.appendChild(toggle);
    header.appendChild(right);

    return header;
  }

  function buildMasthead(eyebrow, titleLines, subtitle) {
    var wrap = el("div", "masthead");
    var inner = el("div", "masthead-inner");
    inner.appendChild(el("div", "eyebrow", eyebrow));
    titleLines.forEach(function (line, i) {
      inner.appendChild(el("div", "title-line" + (i === titleLines.length - 1 ? " title-line-bold" : ""), line));
    });
    var rule = el("div", "masthead-rule");
    rule.appendChild(document.createElement("span"));
    rule.appendChild(el("span", null, subtitle));
    rule.appendChild(document.createElement("span"));
    inner.appendChild(rule);
    wrap.appendChild(inner);
    return wrap;
  }

  function buildStatsStrip(cells) {
    var wrap = el("div", "tally-strip");
    cells.forEach(function (c) {
      var cell = el("div", "tally-cell");
      cell.appendChild(el("div", "tally-num mono", c.value));
      cell.appendChild(el("div", "tally-label", c.label));
      wrap.appendChild(cell);
    });
    return wrap;
  }

  function buildFooter() {
    var footer = document.createElement("footer");
    var p = document.createElement("p");
    p.appendChild(document.createTextNode("Compiled from the gear spreadsheet - nothing here is invented beyond what the sheet already computes. Source on "));
    var a = document.createElement("a");
    a.href = "https://github.com/ChasNelson1990/camping-gearlist";
    a.textContent = "GitHub";
    p.appendChild(a);
    p.appendChild(document.createTextNode("."));
    footer.appendChild(p);
    return footer;
  }

  function isNumericCell(text) {
    return /^-?£?[\d,]+(\.\d+)?([eE][+-]?\d+)?%?$/.test(text.trim()) && text.trim() !== "";
  }

  function cellNode(text) {
    var td = document.createElement("td");
    var t = (text || "").trim();
    if (!t) {
      td.className = "empty";
      td.textContent = "—";
      return td;
    }
    if (/^https?:\/\//i.test(t)) {
      var a = document.createElement("a");
      a.href = t;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "↗ link";
      td.appendChild(a);
      return td;
    }
    if (t === "TRUE") {
      td.className = "bool-true";
      td.textContent = "✓";
      return td;
    }
    if (t === "FALSE") {
      td.className = "bool-false";
      td.textContent = "—";
      return td;
    }
    if (isNumericCell(t)) {
      td.className = "num";
      td.textContent = t;
      return td;
    }
    td.textContent = t;
    return td;
  }

  function fileNumber(index) {
    var n = String(index + 1);
    return n.length < 2 ? "0" + n : n;
  }

  window.renderSheet = function (slug) {
    var index = RESEARCH_SHEETS.findIndex(function (s) { return s.slug === slug; });
    var sheet = RESEARCH_SHEETS[index];
    var app = document.getElementById("app");
    app.innerHTML = "";
    if (!sheet) {
      app.appendChild(el("p", "empty-state", "Sheet not found."));
      return;
    }
    document.title = sheet.title + " — Camping Gear Research";

    app.appendChild(buildTopbar(
      [{ href: "index.html", label: "← All research" }],
      [{ href: "../index.html", label: "Checklist" }]
    ));
    app.appendChild(buildMasthead(
      "Bureau of Comparative Research · File No. " + fileNumber(index),
      [sheet.title],
      sheet.rows.length + " specimen" + (sheet.rows.length === 1 ? "" : "s") + " on file"
    ));

    var pickLabel = "—";
    if (sheet.currentPick) {
      var row = sheet.rows[sheet.currentPick.rowIndex];
      pickLabel = (row[0] + (row[1] ? " " + row[1] : "")).trim();
    }
    app.appendChild(buildStatsStrip([
      { value: String(sheet.rows.length), label: "Compared" },
      { value: pickLabel, label: "Currently used" },
    ]));

    var panel = el("div", "panel research-panel");
    panel.appendChild(el("p", "description", sheet.description));

    if (sheet.currentPick) {
      var cp = sheet.currentPick;
      var text = "★ Currently used: " + pickLabel;
      if (cp.rank) text += " — ranked #" + cp.rank + " of " + cp.outOf + " by " + cp.rankLabel;
      panel.appendChild(el("div", "callout", text));
    }
    if (sheet.note) panel.appendChild(el("div", "callout note", sheet.note));

    var tableWrap = el("div", "table-wrap");
    var table = document.createElement("table");
    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    sheet.columns.forEach(function (col) {
      headRow.appendChild(el("th", null, col || "—"));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    sheet.rows.forEach(function (row, i) {
      var tr = document.createElement("tr");
      if (sheet.currentPick && sheet.currentPick.rowIndex === i) tr.className = "pick";
      row.forEach(function (cell) { tr.appendChild(cellNode(cell)); });
      if (sheet.currentPick && sheet.currentPick.rowIndex === i) {
        tr.firstChild.innerHTML = "<span class=\"pick-star\">★</span>" + tr.firstChild.innerHTML;
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    tableWrap.appendChild(table);
    panel.appendChild(tableWrap);
    app.appendChild(panel);

    app.appendChild(buildFooter());
  };

  window.renderResearchIndex = function () {
    var app = document.getElementById("app");
    app.innerHTML = "";
    app.appendChild(buildTopbar(
      [{ href: "../index.html", label: "← The checklist" }],
      []
    ));
    app.appendChild(buildMasthead(
      "Bureau of Comparative Research",
      ["Gear Research"],
      RESEARCH_SHEETS.length + " sheets on file"
    ));

    var panel = el("div", "panel research-panel");
    panel.appendChild(el("p", "description",
      "The comparison spreadsheets behind the packing list. Rows marked ★ are what's actually in the current pack list, where a confident match exists."));

    var list = el("ul", "sheet-list");
    RESEARCH_SHEETS.forEach(function (sheet) {
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = sheet.slug + ".html";
      a.appendChild(el("div", "sheet-title", sheet.title));
      a.appendChild(el("div", "sheet-desc", sheet.description));
      li.appendChild(a);
      list.appendChild(li);
    });
    panel.appendChild(list);
    app.appendChild(panel);

    app.appendChild(buildFooter());
  };
})();
