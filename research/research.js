(function () {
  "use strict";

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
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

  // Fills the slots the per-page template (scripts/generate_research_pages.py)
  // already renders statically - the topbar, theme toggle, and page shell
  // are real HTML by the time this runs, not built here.
  window.renderSheet = function (slug) {
    var sheet = RESEARCH_SHEETS.find(function (s) { return s.slug === slug; });
    var titleEl = document.getElementById("title");
    if (!sheet) {
      titleEl.textContent = "Sheet not found";
      return;
    }
    document.title = sheet.title + " — Camping Gear Research";
    titleEl.textContent = sheet.title;
    document.getElementById("description").textContent = sheet.description;

    var pickLabel = "—";
    if (sheet.currentPick) {
      var row = sheet.rows[sheet.currentPick.rowIndex];
      pickLabel = (row[0] + (row[1] ? " " + row[1] : "")).trim();
    }

    var calloutEl = document.getElementById("callout");
    calloutEl.innerHTML = "";
    if (sheet.currentPick) {
      var cp = sheet.currentPick;
      var text = "★ Currently used: " + pickLabel;
      if (cp.rank) text += " — ranked #" + cp.rank + " of " + cp.outOf + " by " + cp.rankLabel;
      calloutEl.appendChild(el("div", "callout", text));
    }
    if (sheet.note) calloutEl.appendChild(el("div", "callout note", sheet.note));

    var table = document.getElementById("table");
    table.innerHTML = "";
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
  };
})();
