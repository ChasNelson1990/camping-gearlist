(function () {
  "use strict";

  var CATEGORY_ORDER = ["Basics", "Kitchen", "Health", "Electronics", "Clothing", "Miscellaneous", "Anjo"];
  var TRIP_KEYS = { overnight: "overnight", longTrek: "longTrek", carCamp: "carCamp" };

  var items = GEAR_ITEMS.map(function (item, i) {
    item._id = i;
    return item;
  });

  var state = {
    trip: "all",
    season: "all",
    nights: NIGHTS_BY_TRIP.all,
    categories: new Set(CATEGORY_ORDER.filter(function (c) {
      return items.some(function (it) { return it.category === c; });
    })),
  };

  var checked = new Set();

  // Live per-night amount for each consumable, keyed by item._id. Seeded
  // from perNightAmount, then freely editable via the +/- stepper.
  var consumableAmounts = new Map();
  items.forEach(function (it) {
    if (it.perNightAmount != null) consumableAmounts.set(it._id, it.perNightAmount);
  });

  // Live "how many do I bring" count for durable items with a quantityMax
  // (e.g. Wine bladders) - starts at 1, freely editable up to quantityMax.
  var itemQuantities = new Map();

  // Session-only persistence: survives navigating to research pages and back
  // or reloading, but sessionStorage is cleared when the tab/browser closes -
  // deliberately not localStorage, which would outlive the session.
  var STORAGE_KEY = "camping-checklist-session-v1";

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        trip: state.trip,
        season: state.season,
        nights: state.nights,
        categories: Array.from(state.categories),
        checked: Array.from(checked),
        consumableAmounts: Array.from(consumableAmounts.entries()),
        itemQuantities: Array.from(itemQuantities.entries()),
      }));
    } catch (e) {
      // Storage unavailable (private browsing, etc) - degrade to non-persistent.
    }
  }

  function loadState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (saved.trip) state.trip = saved.trip;
      if (saved.season) state.season = saved.season;
      if (typeof saved.nights === "number") state.nights = saved.nights;
      if (Array.isArray(saved.categories)) state.categories = new Set(saved.categories);
      if (Array.isArray(saved.checked)) checked = new Set(saved.checked);
      if (Array.isArray(saved.consumableAmounts)) consumableAmounts = new Map(saved.consumableAmounts);
      if (Array.isArray(saved.itemQuantities)) itemQuantities = new Map(saved.itemQuantities);
    } catch (e) {
      // Corrupt or unavailable storage - fall back to defaults.
    }
  }

  loadState();

  function tripOk(item) {
    if (state.trip === "all") return true;
    return item[TRIP_KEYS[state.trip]] === true;
  }

  function seasonOk(item) {
    if (state.season === "all") return true;
    return !item.season || item.season === state.season;
  }

  function visibleActiveItems() {
    return items.filter(function (it) {
      return it.active && state.categories.has(it.category) && tripOk(it) && seasonOk(it);
    });
  }

  function badge(text, extraClass) {
    var span = document.createElement("span");
    span.className = "badge" + (extraClass ? " " + extraClass : "");
    span.textContent = text;
    return span;
  }

  function linkBadge(href, label, external) {
    var a = document.createElement("a");
    a.href = href;
    if (external) { a.target = "_blank"; a.rel = "noopener"; }
    a.className = "badge item-link";
    a.textContent = label;
    a.addEventListener("click", function (e) { e.stopPropagation(); });
    return a;
  }

  function buildConsumableStepper(item) {
    var wrap = document.createElement("span");
    wrap.className = "stepper";
    var amount = consumableAmounts.get(item._id) || 0;

    var minus = document.createElement("button");
    minus.type = "button";
    minus.className = "stepper-btn";
    minus.textContent = "−";
    minus.setAttribute("aria-label", "Decrease " + item.name + " amount");
    minus.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      adjustAmount(item, -stepSize(item, amount));
    });

    var value = document.createElement("span");
    value.className = "stepper-value";
    value.textContent = (amount % 1 === 0 ? amount : amount.toFixed(2)) + " " + item.perNightUnit;

    var plus = document.createElement("button");
    plus.type = "button";
    plus.className = "stepper-btn";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Increase " + item.name + " amount");
    plus.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      adjustAmount(item, stepSize(item, amount));
    });

    wrap.appendChild(minus);
    wrap.appendChild(value);
    wrap.appendChild(plus);
    return wrap;
  }

  function buildQuantityStepper(item) {
    var wrap = document.createElement("span");
    wrap.className = "stepper";
    var qty = itemQuantities.get(item._id) || 1;

    var minus = document.createElement("button");
    minus.type = "button";
    minus.className = "stepper-btn";
    minus.textContent = "−";
    minus.setAttribute("aria-label", "Decrease " + item.name + " quantity");
    minus.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      adjustQuantity(item, -1);
    });

    var value = document.createElement("span");
    value.className = "stepper-value";
    value.textContent = "×" + qty;

    var plus = document.createElement("button");
    plus.type = "button";
    plus.className = "stepper-btn";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Increase " + item.name + " quantity");
    plus.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      adjustQuantity(item, 1);
    });

    wrap.appendChild(minus);
    wrap.appendChild(value);
    wrap.appendChild(plus);
    return wrap;
  }

  function buildMeta(item, interactive) {
    interactive = interactive !== false;
    var wrap = document.createElement("div");
    wrap.className = "item-meta";
    if (item.perNightAmount != null) {
      if (interactive) {
        wrap.appendChild(buildConsumableStepper(item));
        if (item.scalesWithNights === false) {
          wrap.appendChild(badge("→ " + formatWeight(effectiveWeight(item)) + " total"));
        } else {
          var nights = state.nights;
          wrap.appendChild(badge("→ " + formatWeight(effectiveWeight(item)) + " / " + nights + " night" + (nights === 1 ? "" : "s")));
        }
      } else if (item.scalesWithNights === false) {
        wrap.appendChild(badge(item.perNightAmount + " " + item.perNightUnit + " total"));
      } else {
        wrap.appendChild(badge(item.perNightAmount + " " + item.perNightUnit + "/night"));
      }
    } else if (item.quantityMax != null) {
      wrap.appendChild(badge(formatWeight(item.weightG) + " each"));
      if (interactive) {
        wrap.appendChild(buildQuantityStepper(item));
        wrap.appendChild(badge("→ " + formatWeight(effectiveWeight(item)) + " total"));
      }
    } else if (item.weightG) {
      wrap.appendChild(badge(formatWeight(item.weightG)));
    }
    if (item.consumable) wrap.appendChild(badge("consumable", "badge-consumable"));
    if (item.season) wrap.appendChild(badge((item.season === "Summer" ? "☀ " : "❄ ") + item.season));
    if (item.onBody) wrap.appendChild(badge(onBodyLabel(item.onBody)));
    if (item.current) {
      if (item.currentIsUrl) {
        wrap.appendChild(linkBadge(item.current, "↗ view item", true));
      } else {
        wrap.appendChild(badge(item.current));
      }
    }
    if (item.detailUrl) {
      wrap.appendChild(linkBadge(item.detailUrl, item.detailLabel || "↗ details", false));
    }
    if (item.researchLinks) {
      item.researchLinks.forEach(function (link) {
        wrap.appendChild(linkBadge(link.url, link.label, false));
      });
    }
    return wrap;
  }

  function onBodyLabel(raw) {
    if (raw === "TRUE") return "worn / on body";
    if (raw === "LEFT") return "left pouch";
    if (raw === "RIGHT") return "right pouch";
    return raw;
  }

  function formatWeight(g) {
    if (g >= 1000) return (g / 1000).toFixed(g % 1000 === 0 ? 0 : 1) + " kg";
    return (g % 1 === 0 ? g : g.toFixed(1)) + " g";
  }

  function renderCategoryChips() {
    var wrap = document.getElementById("category-chips");
    wrap.innerHTML = "";
    CATEGORY_ORDER.forEach(function (cat) {
      if (!items.some(function (it) { return it.category === cat; })) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip category" + (state.categories.has(cat) ? " active" : " off");
      btn.textContent = cat;
      btn.setAttribute("aria-pressed", state.categories.has(cat));
      btn.addEventListener("click", function () {
        if (state.categories.has(cat)) state.categories.delete(cat);
        else state.categories.add(cat);
        renderCategoryChips();
        renderChecklist();
      });
      wrap.appendChild(btn);
    });
  }

  function wireSegmented(id, stateKey, onChange) {
    var group = document.getElementById(id);
    group.querySelectorAll(".chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state[stateKey] = btn.dataset.value;
        group.querySelectorAll(".chip").forEach(function (b) { b.classList.toggle("active", b === btn); });
        if (onChange) onChange(btn.dataset.value);
        renderChecklist();
      });
    });
  }

  function syncSegmentedUI(id, value) {
    var group = document.getElementById(id);
    group.querySelectorAll(".chip").forEach(function (b) {
      b.classList.toggle("active", b.dataset.value === value);
    });
  }

  function renderNightsControl() {
    document.getElementById("nights-value").textContent = state.nights;
  }

  function renderChecklist() {
    var main = document.getElementById("checklist");
    main.innerHTML = "";
    var visible = visibleActiveItems();

    if (!visible.length) {
      var empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No gear matches these filters.";
      main.appendChild(empty);
    } else {
      CATEGORY_ORDER.forEach(function (cat) {
        var catItems = visible.filter(function (it) { return it.category === cat; });
        if (!catItems.length) return;
        main.appendChild(renderCategorySection(cat, catItems));
      });
    }

    updateProgress(visible);
    updateAnjoProgress();
    updateConsumablesProgress();
    saveState();
  }

  function renderCategorySection(cat, catItems) {
    var section = document.createElement("section");
    section.className = "category";

    var h2 = document.createElement("h2");
    var checkedCount = catItems.filter(function (it) { return checked.has(it._id); }).length;
    h2.innerHTML = "<span>" + cat + "</span><span>" + checkedCount + "/" + catItems.length + "</span>";
    section.appendChild(h2);

    var ul = document.createElement("ul");
    ul.className = "items";
    var topLevel = catItems.filter(function (it) { return !it.parentName; });
    topLevel.forEach(function (item) {
      ul.appendChild(renderItem(item));
      catItems.filter(function (it) { return it.parentName === item.name; })
        .forEach(function (child) { ul.appendChild(renderItem(child, "item-sub")); });
    });
    section.appendChild(ul);
    return section;
  }

  function renderItem(item, extraClass) {
    var li = document.createElement("label");
    li.className = "item" + (checked.has(item._id) ? " checked" : "") + (extraClass ? " " + extraClass : "");

    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checked.has(item._id);
    cb.addEventListener("change", function () {
      if (cb.checked) checked.add(item._id); else checked.delete(item._id);
      renderChecklist();
    });
    li.appendChild(cb);

    var body = document.createElement("div");
    body.className = "item-body";
    body.appendChild(itemNameEl(item));
    body.appendChild(buildMeta(item));
    if (item.comment) {
      var comment = document.createElement("div");
      comment.className = "item-comment";
      comment.textContent = item.comment;
      body.appendChild(comment);
    }
    li.appendChild(body);
    return li;
  }

  function itemNameEl(item, suffix) {
    var name = document.createElement("div");
    name.className = "item-name";
    if (item.emoji) {
      var icon = document.createElement("span");
      icon.className = "item-emoji";
      icon.textContent = item.emoji;
      name.appendChild(icon);
    }
    name.appendChild(document.createTextNode(item.name + (suffix || "")));
    return name;
  }

  function effectiveWeight(item) {
    if (item.perNightAmount != null) {
      var amount = consumableAmounts.get(item._id) || 0;
      var grams = item.perNightUnit === "l" ? amount * 1000 : amount;
      var nights = item.scalesWithNights === false ? 1 : state.nights;
      return grams * nights;
    }
    if (item.quantityMax != null) {
      return (item.weightG || 0) * (itemQuantities.get(item._id) || 1);
    }
    return item.weightG || 0;
  }

  function stepSize(item, amount) {
    if (item.stepOverride != null) return item.stepOverride;
    if (item.perNightUnit === "l") return 0.25;
    if (amount < 20) return 1;
    if (amount < 100) return 5;
    if (amount < 500) return 25;
    return 100;
  }

  function adjustAmount(item, delta) {
    var current = consumableAmounts.get(item._id) || 0;
    var next = Math.max(0, current + delta);
    if (item.maxAmount != null) next = Math.min(next, item.maxAmount);
    consumableAmounts.set(item._id, next);
    renderChecklist();
  }

  function adjustQuantity(item, delta) {
    var current = itemQuantities.get(item._id) || 1;
    var next = Math.max(1, current + delta);
    if (item.quantityMax != null) next = Math.min(next, item.quantityMax);
    itemQuantities.set(item._id, next);
    renderChecklist();
  }

  function sumWeight(list) {
    return list.reduce(function (sum, it) { return sum + effectiveWeight(it); }, 0);
  }

  function fillPercent(packedWeight, totalWeight) {
    return totalWeight ? (100 * packedWeight / totalWeight) + "%" : "0%";
  }

  function updateProgress(visible) {
    var total = visible.length;
    var packedItems = visible.filter(function (it) { return checked.has(it._id); });
    var done = packedItems.length;
    document.getElementById("progress-text").textContent = done + " of " + total + " packed";

    // Pack weight is base gear only: worn/on-body items aren't in the pack
    // at all, and consumables (food, fuel, toiletries) get their own
    // dedicated bar below rather than double-counting here too.
    var weighable = visible.filter(function (it) { return !it.onBody && !it.consumable; });
    var packedWeighable = packedItems.filter(function (it) { return !it.onBody && !it.consumable; });
    var totalWeight = sumWeight(weighable);
    var packedWeight = sumWeight(packedWeighable);
    document.getElementById("progress-fill").style.width = fillPercent(packedWeight, totalWeight);

    var summaryEl = document.getElementById("weight-summary");
    summaryEl.innerHTML = "";
    summaryEl.appendChild(document.createTextNode(
      "Pack weight: " + formatWeight(totalWeight) + " — " + formatWeight(packedWeight) + " packed so far "
    ));
    if (packedWeight > 0) {
      var cls = weightClass(packedWeight);
      var classBadge = document.createElement("span");
      classBadge.className = "badge weight-class weight-class-" + cls.toLowerCase();
      classBadge.textContent = cls;
      classBadge.title = "Excludes consumables (food, fuel, toiletries...) and anything worn / on body - see the Consumables bar below for those";
      summaryEl.appendChild(classBadge);
    }
  }

  function updateAnjoProgress() {
    var anjoItems = items.filter(function (it) {
      return it.category === "Anjo" && it.active && it.onBody && tripOk(it) && seasonOk(it);
    });
    var total = anjoItems.length;
    var packedItems = anjoItems.filter(function (it) { return checked.has(it._id); });
    var done = packedItems.length;
    document.getElementById("anjo-progress-text").textContent = "🐾 " + done + " of " + total + " on Anjo";

    var totalWeight = sumWeight(anjoItems);
    var packedWeight = sumWeight(packedItems);
    document.getElementById("anjo-progress-fill").style.width = fillPercent(packedWeight, totalWeight);
    document.getElementById("anjo-weight-summary").textContent =
      "On Anjo (worn + pouches): " + formatWeight(totalWeight) + " — " + formatWeight(packedWeight) + " packed so far";
  }

  function updateConsumablesProgress() {
    var consumableItems = items.filter(function (it) {
      return it.active && it.consumable && tripOk(it) && seasonOk(it);
    });
    var total = consumableItems.length;
    var packedItems = consumableItems.filter(function (it) { return checked.has(it._id); });
    var done = packedItems.length;
    document.getElementById("consumables-progress-text").textContent = done + " of " + total + " consumables packed";

    var totalWeight = sumWeight(consumableItems);
    var packedWeight = sumWeight(packedItems);
    document.getElementById("consumables-progress-fill").style.width = fillPercent(packedWeight, totalWeight);
    document.getElementById("consumables-weight-summary").textContent =
      "Consumables (yours + Anjo's): " + formatWeight(totalWeight) + " — " + formatWeight(packedWeight) + " packed so far";
  }

  function weightClass(totalGrams) {
    var kg = totalGrams / 1000;
    var label = WEIGHT_CLASS_THRESHOLDS[0][1];
    WEIGHT_CLASS_THRESHOLDS.forEach(function (pair) {
      if (kg >= pair[0]) label = pair[1];
    });
    return label;
  }

  function renderArchive() {
    var archived = items.filter(function (it) { return !it.active; });
    document.getElementById("archive-count").textContent = "(" + archived.length + ")";
    var wrap = document.getElementById("archive-content");
    CATEGORY_ORDER.forEach(function (cat) {
      var catItems = archived.filter(function (it) { return it.category === cat; });
      if (!catItems.length) return;
      var section = document.createElement("div");
      section.className = "archive-category";
      var h3 = document.createElement("h3");
      h3.textContent = cat;
      section.appendChild(h3);
      var ul = document.createElement("ul");
      ul.className = "archive-items";
      catItems.forEach(function (item) {
        var li = document.createElement("li");
        li.className = "archive-item";
        li.appendChild(itemNameEl(item, item.archived ? " — archived" : " — not currently used"));
        li.appendChild(buildMeta(item, false));
        if (item.comment) {
          var c = document.createElement("div");
          c.className = "item-comment";
          c.textContent = item.comment;
          li.appendChild(c);
        }
        ul.appendChild(li);
      });
      section.appendChild(ul);
      wrap.appendChild(section);
    });
  }

  wireSegmented("trip-filter", "trip", function (value) {
    state.nights = NIGHTS_BY_TRIP[value];
    renderNightsControl();
  });
  wireSegmented("season-filter", "season");

  document.getElementById("nights-minus").addEventListener("click", function () {
    state.nights = Math.max(1, state.nights - 1);
    renderNightsControl();
    renderChecklist();
  });
  document.getElementById("nights-plus").addEventListener("click", function () {
    state.nights = state.nights + 1;
    renderNightsControl();
    renderChecklist();
  });

  syncSegmentedUI("trip-filter", state.trip);
  syncSegmentedUI("season-filter", state.season);
  renderCategoryChips();
  renderNightsControl();
  renderChecklist();
  renderArchive();
})();
