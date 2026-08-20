(function () {
  "use strict";

  var CATEGORY_ORDER = ["Basics", "Kitchen", "Health", "Electronics", "Clothing", "Miscellaneous", "Anjo"];
  var CATEGORY_EMOJI = {
    Basics: "🎒", Kitchen: "🍳", Health: "🩹", Electronics: "🔌",
    Clothing: "👕", Miscellaneous: "🧰", Anjo: "🐾",
  };
  var TRIP_KEYS = { overnight: "overnight", longTrek: "longTrek", carCamp: "carCamp" };

  // Stable per item, not a positional array index: sessionStorage persists
  // across page loads (and across a deploy, if the tab was already open),
  // but GEAR_ITEMS' order/length can change between regenerations (items
  // added, removed, reordered) - an index-based id would silently point at
  // a different item, or none at all, after any such change. category+name
  // is unique across the whole list (extract_data.py validates this at
  // generation time) and stays stable regardless of array position.
  var items = GEAR_ITEMS.map(function (item) {
    item._id = item.category + "::" + item.name;
    return item;
  });

  var state = {
    trip: "all",
    season: "all",
    nights: NIGHTS_BY_TRIP.all,
    noOpenFires: false,
    categories: new Set(CATEGORY_ORDER.filter(function (c) {
      return items.some(function (it) { return it.category === c; });
    })),
  };

  var checked = new Set();

  // Independent from `checked` - tracks whether a rechargeable item's
  // battery has been topped up before the trip, for items with
  // needsCharge. Doesn't affect packed counts/weight, just its own toggle.
  var charged = new Set();

  // Live per-night amount for each consumable, keyed by item._id. Seeded
  // from perNightAmount, then freely editable via the +/- stepper.
  var consumableAmounts = new Map();
  items.forEach(function (it) {
    if (it.perNightAmount != null) consumableAmounts.set(it._id, it.perNightAmount);
  });

  // Falls back to the item's own recommended amount (not 0) if the map has
  // no entry - e.g. a sessionStorage snapshot saved before this item's id
  // existed (a prior page load, before a deploy added/renamed/reordered
  // items) shouldn't be able to make a consumable look zeroed-out.
  function getAmount(item) {
    return consumableAmounts.has(item._id) ? consumableAmounts.get(item._id) : item.perNightAmount;
  }

  // Live "how many do I bring" count for durable items with a quantityMax
  // (e.g. Wine bladders) - starts at quantityMin (1 for most such items, but
  // e.g. optional guy lines default to 0), freely editable up to quantityMax.
  var itemQuantities = new Map();

  function quantityDefault(item) {
    return item.quantityMin != null ? item.quantityMin : 1;
  }

  // Falls back to quantityDefault (not a bare 1) when unset - otherwise an
  // explicit 0 (a valid, deliberately-chosen quantity for a 0-min item like
  // guy lines) would read as falsy and get silently overridden back to 1.
  function getQuantity(item) {
    return itemQuantities.has(item._id) ? itemQuantities.get(item._id) : quantityDefault(item);
  }

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
        noOpenFires: state.noOpenFires,
        categories: Array.from(state.categories),
        checked: Array.from(checked),
        charged: Array.from(charged),
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
      if (typeof saved.noOpenFires === "boolean") state.noOpenFires = saved.noOpenFires;
      if (Array.isArray(saved.categories)) state.categories = new Set(saved.categories);
      if (Array.isArray(saved.checked)) checked = new Set(saved.checked);
      if (Array.isArray(saved.charged)) charged = new Set(saved.charged);
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

  // Most items apply the same `season` restriction to every trip type
  // they're flagged for. A few (via seasonByTrip) restrict only one trip
  // type - e.g. carried on long treks/car camp in any season, but only on
  // winter overnights - so the season to check depends on which trip type
  // is actually in view.
  function seasonForTrip(item, tripKey) {
    if (item.seasonByTrip && item.seasonByTrip[tripKey] !== undefined) return item.seasonByTrip[tripKey];
    return item.season;
  }

  function seasonOk(item) {
    if (state.season === "all") return true;
    if (state.trip !== "all") return !seasonForTrip(item, state.trip) || seasonForTrip(item, state.trip) === state.season;
    var flaggedTrips = Object.keys(TRIP_KEYS).filter(function (k) { return item[TRIP_KEYS[k]] === true; });
    if (!flaggedTrips.length) return !item.season || item.season === state.season;
    return flaggedTrips.some(function (k) {
      var season = seasonForTrip(item, k);
      return !season || season === state.season;
    });
  }

  function fireOk(item) {
    return !item.requiresOpenFire || !state.noOpenFires;
  }

  function visibleActiveItems() {
    return items.filter(function (it) {
      return state.categories.has(it.category) && tripOk(it) && seasonOk(it) && fireOk(it);
    });
  }

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
    a.addEventListener("click", function (e) { e.stopPropagation(); });
    return a;
  }

  function buildConsumableStepper(item) {
    var wrap = document.createElement("span");
    wrap.className = "stepper";
    var amount = getAmount(item);

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
    var qty = getQuantity(item);

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

  function buildChargeToggle(item) {
    var label = document.createElement("label");
    label.className = "charge-toggle";

    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = charged.has(item._id);
    cb.addEventListener("click", function (e) { e.stopPropagation(); });
    cb.addEventListener("change", function (e) {
      e.stopPropagation();
      if (cb.checked) charged.add(item._id); else charged.delete(item._id);
      renderChecklist();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(" charged"));
    return label;
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
      wrap.appendChild(badge(formatWeight(item.weightG), null, item.weightNote));
    }
    if (item.consumable) wrap.appendChild(badge("consumable", "badge-consumable"));
    if (item.season) wrap.appendChild(badge((item.season === "Summer" ? "☀ " : "❄ ") + item.season));
    if (item.onBody) wrap.appendChild(badge(onBodyLabel(item.onBody)));
    if (item.current) {
      if (item.currentIsUrl) {
        wrap.appendChild(linkBadge(item.current, "↗ " + (item.currentLabel || "view item"), true, item.currentNote));
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
    if (item.needsCharge) wrap.appendChild(buildChargeToggle(item));
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
      btn.textContent = (CATEGORY_EMOJI[cat] ? CATEGORY_EMOJI[cat] + " " : "") + cat;
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
    renderUnusedGear();
    saveState();
  }

  function renderCategorySection(cat, catItems) {
    var section = document.createElement("section");
    section.className = "category";

    var h2 = document.createElement("h2");
    var checkedCount = catItems.filter(function (it) { return checked.has(it._id); }).length;
    var catLabel = (CATEGORY_EMOJI[cat] ? CATEGORY_EMOJI[cat] + " " : "") + cat;
    h2.innerHTML = "<span>" + catLabel + "</span><span>" + checkedCount + "/" + catItems.length + "</span>";
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
      if (cb.checked) {
        checked.add(item._id);
        // Checking a sub-item implies its parent is packed too - but this
        // is one-directional and doesn't repeat: checking/unchecking the
        // parent never touches the child, and unchecking a sub-item never
        // unchecks its parent either.
        if (item.parentName) checked.add(item.category + "::" + item.parentName);
      } else {
        checked.delete(item._id);
      }
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
      var amount = getAmount(item);
      var grams = item.perNightUnit === "l" ? amount * 1000 : amount;
      var nights = item.scalesWithNights === false ? 1 : state.nights;
      return grams * nights;
    }
    if (item.quantityMax != null) {
      return (item.weightG || 0) * getQuantity(item);
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
    var current = getAmount(item);
    var next = Math.max(0, current + delta);
    if (item.maxAmount != null) next = Math.min(next, item.maxAmount);
    consumableAmounts.set(item._id, next);
    renderChecklist();
  }

  function adjustQuantity(item, delta) {
    var current = getQuantity(item);
    var min = item.quantityMin != null ? item.quantityMin : 1;
    var next = Math.max(min, current + delta);
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
      return it.category === "Anjo" && it.onBody && tripOk(it) && seasonOk(it);
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
      return it.consumable && tripOk(it) && seasonOk(it);
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

  function renderUnusedGear() {
    // Active gear that just doesn't match the current trip/season/fire-safety
    // filters - distinct from the old "archive" concept (which no longer
    // exists: gear that's actually unowned/retired is dropped from the data
    // entirely by extract_data.py, not shown here). Category toggles still
    // apply, so hiding a whole category also hides its items from this list.
    // Cards are built with the same renderCategorySection() as the main
    // checklist, so these items are just as checkable/interactive as any
    // other category.
    var unused = items.filter(function (it) {
      return state.categories.has(it.category) && !(tripOk(it) && seasonOk(it) && fireOk(it));
    });
    document.getElementById("unused-gear-count").textContent = "(" + unused.length + ")";
    var wrap = document.getElementById("unused-gear-content");
    wrap.innerHTML = "";
    if (!unused.length) {
      var empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "Nothing excluded by the current trip/season filters.";
      wrap.appendChild(empty);
      return;
    }
    CATEGORY_ORDER.forEach(function (cat) {
      var catItems = unused.filter(function (it) { return it.category === cat; });
      if (!catItems.length) return;
      wrap.appendChild(renderCategorySection(cat, catItems));
    });
  }

  wireSegmented("trip-filter", "trip", function (value) {
    state.nights = NIGHTS_BY_TRIP[value];
    renderNightsControl();
  });
  wireSegmented("season-filter", "season");

  var fireToggle = document.getElementById("fire-toggle");
  fireToggle.addEventListener("click", function () {
    state.noOpenFires = !state.noOpenFires;
    syncFireToggle();
    renderChecklist();
  });

  function syncFireToggle() {
    fireToggle.classList.toggle("active", state.noOpenFires);
    fireToggle.setAttribute("aria-pressed", state.noOpenFires);
  }

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
  syncFireToggle();
  renderCategoryChips();
  renderNightsControl();
  renderChecklist();
})();
