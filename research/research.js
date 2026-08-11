(function () {
  "use strict";

  function isNumericCell(text) {
    return /^-?£?[\d,]+(\.\d+)?([eE][+-]?\d+)?%?$/.test(text.trim()) && text.trim() !== "";
  }

  function cellNode(text, colIndex, rowMatchesPick) {
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

  window.renderSheet = function (slug) {
    var sheet = RESEARCH_SHEETS.find(function (s) { return s.slug === slug; });
    if (!sheet) {
      document.getElementById("title").textContent = "Sheet not found";
      return;
    }
    document.title = sheet.title + " — Camping Gear Research";
    document.getElementById("title").textContent = sheet.title;
    document.getElementById("description").textContent = sheet.description;

    var calloutEl = document.getElementById("callout");
    if (sheet.currentPick) {
      var cp = sheet.currentPick;
      var row = sheet.rows[cp.rowIndex];
      var label = row[0] + (row[1] ? " " + row[1] : "");
      var text = "★ Currently used: " + label.trim();
      if (cp.rank) text += " — ranked #" + cp.rank + " of " + cp.outOf + " by " + cp.rankLabel;
      calloutEl.innerHTML = "<div class=\"callout\">" + text + "</div>";
    }

    var table = document.getElementById("table");
    var thead = document.createElement("thead");
    var headRow = document.createElement("tr");
    sheet.columns.forEach(function (col) {
      var th = document.createElement("th");
      th.textContent = col || "—";
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    sheet.rows.forEach(function (row, i) {
      var tr = document.createElement("tr");
      if (sheet.currentPick && sheet.currentPick.rowIndex === i) tr.className = "pick";
      row.forEach(function (cell, colIndex) {
        tr.appendChild(cellNode(cell, colIndex));
      });
      if (sheet.currentPick && sheet.currentPick.rowIndex === i) {
        tr.firstChild.innerHTML = "<span class=\"pick-star\">★</span>" + tr.firstChild.innerHTML;
      }
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  };
})();
