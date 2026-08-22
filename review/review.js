(function () {
  "use strict";

  var CATEGORY_ORDER = ["Basics", "Kitchen", "Health", "Electronics", "Clothing", "Miscellaneous", "Anjo"];
  var CATEGORY_EMOJI = {
    Basics: "🎒", Kitchen: "🍳", Health: "🩹", Electronics: "🔌",
    Clothing: "👕", Miscellaneous: "🧰", Anjo: "🐾",
  };
  var TRIP_EMOJI = { overnight: "🌙", longTrek: "🥾", carCamp: "🚗" };
  var items = GEAR_ITEMS;

  var ROMAN_NUMERALS = [
    [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ];
  function toRoman(n) {
    var out = "";
    ROMAN_NUMERALS.forEach(function (pair) {
      while (n >= pair[0]) { out += pair[1]; n -= pair[0]; }
    });
    return out.toUpperCase();
  }
  var CATEGORY_NUMERAL = {};
  CATEGORY_ORDER.forEach(function (cat, i) { CATEGORY_NUMERAL[cat] = toRoman(i + 1); });

  function badge(text, extraClass, title) {
    var span = document.createElement("span");
    span.className = "badge" + (extraClass ? " " + extraClass : "");
    if (title) span.title = title;
    span.textContent = text;
    return span;
  }

  function linkBadge(href, label, external, title) {
    var a = document.createElement("a");
    a.href = href;
    if (external) { a.target = "_blank"; a.rel = "noopener"; }
    if (title) a.title = title;
    a.className = "badge item-link";
    a.textContent = label;
    return a;
  }

  // researchLinks are generated relative to the site root (e.g.
  // "research/bags.html"), but this page lives one level down at /review/ -
  // item.current is a full external http(s) URL and never needs this.
  function fromRoot(path) {
    return "../" + path;
  }

  function formatWeight(g) {
    if (g >= 1000) return (g / 1000).toFixed(g % 1000 === 0 ? 0 : 1) + " kg";
    return (g % 1 === 0 ? g : g.toFixed(1)) + " g";
  }

  function onBodyLabel(raw) {
    if (raw === "TRUE") return "worn / on body";
    if (raw === "LEFT") return "left pouch";
    if (raw === "RIGHT") return "right pouch";
    return raw;
  }

  function seasonSuffix(item, tripKey) {
    var byTrip = item.seasonByTrip;
    var season = byTrip && byTrip[tripKey] !== undefined ? byTrip[tripKey] : item.season;
    return season ? " (" + (season === "Summer" ? "☀" : "❄") + " " + season + " only)" : "";
  }

  function tripLabel(item) {
    var flags = [];
    if (item.overnight) flags.push(TRIP_EMOJI.overnight + " Overnight" + seasonSuffix(item, "overnight"));
    if (item.longTrek) flags.push(TRIP_EMOJI.longTrek + " Long trek" + seasonSuffix(item, "longTrek"));
    if (item.carCamp) flags.push(TRIP_EMOJI.carCamp + " Car camp" + seasonSuffix(item, "carCamp"));
    if (!item.seasonByTrip && flags.length === 3) return "🧳 All trips";
    if (!flags.length) return "No trips flagged";
    return flags.join(", ");
  }

  function seasonLabel(item) {
    if (!item.season) return "🌦 All seasons";
    return (item.season === "Summer" ? "☀" : "❄") + " " + item.season;
  }

  function buildMeta(item) {
    var wrap = document.createElement("div");
    wrap.className = "item-meta";
    if (item.perNightAmount != null) {
      if (item.scalesWithNights === false) {
        wrap.appendChild(badge(item.perNightAmount + " " + item.perNightUnit + " total"));
      } else {
        wrap.appendChild(badge(item.perNightAmount + " " + item.perNightUnit + "/night"));
      }
    } else if (item.quantityMax != null) {
      wrap.appendChild(badge(formatWeight(item.weightG) + " each"));
    } else if (item.weightG) {
      wrap.appendChild(badge(formatWeight(item.weightG), null, item.weightNote));
    }
    wrap.appendChild(badge(tripLabel(item), "badge-trip"));
    wrap.appendChild(badge(seasonLabel(item), "badge-season"));
    if (item.consumable) wrap.appendChild(badge("consumable", "badge-consumable"));
    if (item.onBody) wrap.appendChild(badge(onBodyLabel(item.onBody)));
    if (item.needsCharge) wrap.appendChild(badge("🔋 needs charging"));
    if (item.requiresOpenFire) wrap.appendChild(badge("🚫🔥 requires open fire"));
    if (item.fireCaution) wrap.appendChild(badge("⚠️ fire caution", "badge-fire-caution", item.fireCaution));
    if (item.current) {
      if (item.currentIsUrl) {
        wrap.appendChild(linkBadge(item.current, "↗ " + (item.currentLabel || "view item"), true, item.currentNote));
      } else {
        wrap.appendChild(badge(item.current));
      }
    }
    if (item.researchLinks) {
      item.researchLinks.forEach(function (link) {
        wrap.appendChild(linkBadge(fromRoot(link.url), link.label, false));
      });
    }
    return wrap;
  }

  function itemNameEl(item) {
    var name = document.createElement("div");
    name.className = "item-name";
    if (item.emoji) {
      var icon = document.createElement("span");
      icon.className = "item-emoji";
      icon.textContent = item.emoji;
      name.appendChild(icon);
    }
    name.appendChild(document.createTextNode(item.name));
    return name;
  }

  function renderItem(item, extraClass) {
    var row = document.createElement("div");
    row.className = "item" + (extraClass ? " " + extraClass : "");
    var body = document.createElement("div");
    body.className = "item-body";
    body.appendChild(itemNameEl(item));
    body.appendChild(buildMeta(item));
    if (item.comment) {
      var c = document.createElement("div");
      c.className = "item-comment";
      c.textContent = item.comment;
      body.appendChild(c);
    }
    row.appendChild(body);
    return row;
  }

  function renderCategorySection(cat, catItems) {
    var details = document.createElement("details");
    details.className = "category";
    details.open = true;

    var summary = document.createElement("summary");
    var numeral = document.createElement("span");
    numeral.className = "category-numeral";
    numeral.textContent = CATEGORY_NUMERAL[cat] || "";
    summary.appendChild(numeral);
    var nameEl = document.createElement("span");
    nameEl.className = "category-name";
    nameEl.textContent = (CATEGORY_EMOJI[cat] ? CATEGORY_EMOJI[cat] + " " : "") + cat;
    summary.appendChild(nameEl);
    var countEl = document.createElement("span");
    countEl.className = "category-count";
    countEl.textContent = catItems.length + " items";
    summary.appendChild(countEl);
    details.appendChild(summary);

    var ul = document.createElement("ul");
    ul.className = "items";
    var topLevel = catItems.filter(function (it) { return !it.parentName; });
    topLevel.forEach(function (item) {
      ul.appendChild(renderItem(item));
      catItems.filter(function (it) { return it.parentName === item.name; })
        .forEach(function (child) { ul.appendChild(renderItem(child, "item-sub")); });
    });
    details.appendChild(ul);
    return details;
  }

  function render() {
    var main = document.getElementById("review");
    main.innerHTML = "";
    CATEGORY_ORDER.forEach(function (cat) {
      var catItems = items.filter(function (it) { return it.category === cat; });
      if (!catItems.length) return;
      main.appendChild(renderCategorySection(cat, catItems));
    });
  }

  render();
})();
