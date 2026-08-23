(function () {
  "use strict";

  var CATEGORY_ORDER = ["Basics", "Kitchen", "Health", "Electronics", "Clothing", "Miscellaneous", "Anjo"];
  var CATEGORY_EMOJI = {
    Basics: "🎒", Kitchen: "🍳", Health: "🩹", Electronics: "🔌",
    Clothing: "👕", Miscellaneous: "🧰", Anjo: "🐾",
  };
  var TRIP_KEYS = { overnight: "overnight", longTrek: "longTrek", carCamp: "carCamp" };

  var ROMAN_NUMERALS = [
    [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
    [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ];
  function toRoman(n) {
    var out = "";
    ROMAN_NUMERALS.forEach(function (pair) {
      while (n >= pair[0]) { out += pair[1]; n -= pair[0]; }
    });
    return out;
  }

  // Fixed, independent of which categories are currently visible/toggled
  // on - so a category's numeral doesn't jump around as filters change.
  var CATEGORY_NUMERAL = {};
  CATEGORY_ORDER.forEach(function (cat, i) { CATEGORY_NUMERAL[cat] = toRoman(i + 1).toUpperCase(); });

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
    // Weight caps used by the budget panel's bars - "on your back" and
    // "consumables" share one cap (they're both things you carry), Anjo
    // gets his own. Defaults: 14 kg is WEIGHT_CLASS_THRESHOLDS' own
    // "Heavy" threshold (so a full budget bar lines up with crossing into
    // Heavy), 3 kg is a reasonable dog-carry guess - both freely editable.
    budgetG: 14000,
    dogBudgetG: 3000,
    categories: new Set(CATEGORY_ORDER.filter(function (c) {
      return items.some(function (it) { return it.category === c; });
    })),
    // Which category sections are collapsed - keyed by category name, shared
    // between the main checklist and Unused gear (both render sections via
    // renderCategorySection). Every checkbox toggle rebuilds the whole list
    // via renderChecklist(), which would otherwise reset native <details>
    // open/closed state on every click - tracking it here and re-applying
    // it on each render keeps a collapsed section collapsed.
    collapsedCategories: new Set(),
    // Same idea, one level down: which parent items' sub-item manifests are
    // collapsed, keyed by the parent's own _id (category::name, so it's
    // independent from collapsedCategories' plain-name keys). Pre-populated
    // with the bulkier gear-with-accessories items so a fresh session opens
    // with them folded - loadState() below overwrites this with whatever
    // the user already had open/closed if this tab has a saved session.
    collapsedItemGroups: new Set([
      "Kitchen::Spirit burner",
      "Kitchen::Vango burner",
      "Kitchen::Mini firepit",
      "Kitchen::Firepit",
      "Kitchen::Coffee",
      "Kitchen::Wine bladders",
      "Kitchen::Beer cans",
      "Kitchen::Hip flask",
      "Kitchen::Cup",
      "Health::First aid kit",
      "Basics::Repair kit",
      "Kitchen::Water purification kit",
    ]),
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
        budgetG: state.budgetG,
        dogBudgetG: state.dogBudgetG,
        categories: Array.from(state.categories),
        collapsedCategories: Array.from(state.collapsedCategories),
        collapsedItemGroups: Array.from(state.collapsedItemGroups),
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
      if (typeof saved.budgetG === "number") state.budgetG = saved.budgetG;
      if (typeof saved.dogBudgetG === "number") state.dogBudgetG = saved.dogBudgetG;
      if (Array.isArray(saved.categories)) state.categories = new Set(saved.categories);
      if (Array.isArray(saved.collapsedCategories)) state.collapsedCategories = new Set(saved.collapsedCategories);
      if (Array.isArray(saved.collapsedItemGroups)) state.collapsedItemGroups = new Set(saved.collapsedItemGroups);
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
    if (item.fireCaution && state.noOpenFires) {
      wrap.appendChild(badge("⚠️ usable with care", "badge-fire-caution", item.fireCaution));
    }
    if (item.season) wrap.appendChild(badge((item.season === "Summer" ? "☀ " : "❄ ") + item.season, "badge-season"));
    if (item.onBody) wrap.appendChild(badge(onBodyLabel(item.onBody)));
    if (item.current) {
      if (item.currentIsUrl) {
        wrap.appendChild(linkBadge(item.current, "↗ " + (item.currentLabel || "view item"), true, item.currentNote));
      } else {
        wrap.appendChild(badge(item.current));
      }
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
    group.querySelectorAll(".tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state[stateKey] = btn.dataset.value;
        group.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("active", b === btn); });
        if (onChange) onChange(btn.dataset.value);
        renderChecklist();
      });
    });
  }

  function syncSegmentedUI(id, value) {
    var group = document.getElementById(id);
    group.querySelectorAll(".tab").forEach(function (b) {
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

    var tallies = computeTallies(visible);
    renderTallyStrip(tallies);
    renderBudgetPanel(tallies);
    renderUnusedGear();
    saveState();
  }

  function renderCategorySection(cat, catItems) {
    var details = document.createElement("details");
    details.className = "category";
    details.open = !state.collapsedCategories.has(cat);
    details.addEventListener("toggle", function () {
      if (details.open) state.collapsedCategories.delete(cat);
      else state.collapsedCategories.add(cat);
      saveState();
    });

    var summary = document.createElement("summary");
    var checkedCount = catItems.filter(function (it) { return checked.has(it._id); }).length;

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
    countEl.textContent = checkedCount + "/" + catItems.length;
    summary.appendChild(countEl);

    var weightEl = document.createElement("span");
    weightEl.className = "category-weight";
    weightEl.textContent = formatWeight(sumWeight(catItems));
    summary.appendChild(weightEl);

    details.appendChild(summary);

    var ul = document.createElement("ul");
    ul.className = "items";
    var topLevel = catItems.filter(function (it) { return !it.parentName; });
    topLevel.forEach(function (item) {
      var children = catItems.filter(function (it) { return it.parentName === item.name; });
      if (children.length) {
        var gs = groupState(children);
        if (gs.allDone) checked.add(item._id); else checked.delete(item._id);
        var open = !state.collapsedItemGroups.has(item._id);
        ul.appendChild(renderGroupRow(item, children, gs, open));
        if (open) ul.appendChild(renderManifest(children));
      } else {
        ul.appendChild(renderItem(item));
      }
    });
    details.appendChild(ul);
    return details;
  }

  function groupState(children) {
    var doneCount = children.filter(function (c) { return checked.has(c._id); }).length;
    var allDone = children.length > 0 && doneCount === children.length;
    var noneDone = doneCount === 0;
    return { doneCount: doneCount, allDone: allDone, partial: !allDone && !noneDone };
  }

  // Group-parent row (an item with sub-items, e.g. Firepit, First aid kit).
  // Deliberately a plain <li>, not a <label> wrapping the checkbox like a
  // leaf renderItem() row - a label would make ANY click inside it toggle
  // the checkbox natively, which would fight with wanting a click elsewhere
  // on the row to open/close the manifest instead. The checkbox here bulk-
  // toggles every child at once (see the change handler); an indeterminate
  // state (a ring instead of a filled dot, styled in styles.css) shows when
  // only some children are packed.
  function renderGroupRow(item, children, gs, open) {
    var li = document.createElement("li");
    li.className = "item item-group" + (gs.allDone ? " checked" : "") + (open ? " open" : "");

    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = gs.allDone;
    cb.indeterminate = gs.partial;
    cb.setAttribute("aria-label", "Pack all " + item.name + " contents");
    cb.addEventListener("click", function (e) { e.stopPropagation(); });
    cb.addEventListener("change", function () {
      var setTo = cb.checked;
      children.forEach(function (c) {
        if (setTo) checked.add(c._id); else checked.delete(c._id);
      });
      renderChecklist();
    });
    li.appendChild(cb);

    var body = document.createElement("div");
    body.className = "item-body";
    body.appendChild(itemNameEl(item));
    var meta = buildMeta(item);
    meta.appendChild(badge((open ? "− close" : "+ manifest"), "badge-disclosure"));
    body.appendChild(meta);
    if (item.comment) {
      var comment = document.createElement("div");
      comment.className = "item-comment";
      comment.textContent = item.comment;
      body.appendChild(comment);
    }
    li.appendChild(body);

    li.addEventListener("click", function (e) {
      if (e.target === cb) return;
      if (open) state.collapsedItemGroups.add(item._id);
      else state.collapsedItemGroups.delete(item._id);
      saveState();
      renderChecklist();
    });

    return li;
  }

  // The expanded "kit manifest" under an open group row - each child keeps
  // its own individually-checkable row (renderItem, same as any leaf item),
  // numbered with a roman numeral instead of an emoji (this app's one-level
  // nesting limit means these are always leaves, never groups themselves).
  function renderManifest(children) {
    var li = document.createElement("li");
    li.className = "item-manifest";

    var divider = document.createElement("div");
    divider.className = "manifest-divider";
    var label = document.createElement("span");
    label.className = "manifest-divider-label";
    label.textContent = "Kit manifest";
    var rule = document.createElement("span");
    rule.className = "manifest-divider-rule";
    divider.appendChild(label);
    divider.appendChild(rule);
    li.appendChild(divider);

    var childList = document.createElement("div");
    childList.className = "items";
    children.forEach(function (child, i) {
      childList.appendChild(renderItem(child, "item-sub", toRoman(i + 1)));
    });
    li.appendChild(childList);

    var totalRow = document.createElement("div");
    totalRow.className = "manifest-total";
    var totalLabel = document.createElement("span");
    totalLabel.className = "manifest-total-label";
    totalLabel.textContent = "Kit total";
    var totalValue = document.createElement("span");
    totalValue.textContent = formatWeight(sumWeight(children));
    totalRow.appendChild(totalLabel);
    totalRow.appendChild(totalValue);
    li.appendChild(totalRow);

    return li;
  }

  function renderItem(item, extraClass, numeral) {
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
    body.appendChild(itemNameEl(item, numeral));
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

  function itemNameEl(item, numeral) {
    var name = document.createElement("div");
    name.className = "item-name";
    if (numeral) {
      var num = document.createElement("span");
      num.className = "item-numeral";
      num.textContent = numeral;
      name.appendChild(num);
    } else if (item.emoji) {
      var icon = document.createElement("span");
      icon.className = "item-emoji";
      icon.textContent = item.emoji;
      name.appendChild(icon);
    }
    name.appendChild(document.createTextNode(item.name));
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

  function weightClass(totalGrams) {
    var kg = totalGrams / 1000;
    var label = WEIGHT_CLASS_THRESHOLDS[0][1];
    WEIGHT_CLASS_THRESHOLDS.forEach(function (pair) {
      if (kg >= pair[0]) label = pair[1];
    });
    return label;
  }

  // Consolidates what were three separate progress computations (pack /
  // Anjo / consumables) into one pass - feeds both the tally strip (counts)
  // and the budget panel (weights) below.
  function computeTallies(visible) {
    var packedItems = visible.filter(function (it) { return checked.has(it._id); });

    var anjoItems = items.filter(function (it) {
      return it.category === "Anjo" && it.onBody && tripOk(it) && seasonOk(it);
    });
    var anjoPacked = anjoItems.filter(function (it) { return checked.has(it._id); });

    var consItems = items.filter(function (it) {
      return it.consumable && tripOk(it) && seasonOk(it);
    });
    var consPacked = consItems.filter(function (it) { return checked.has(it._id); });

    // Pack weight is base gear only: worn/on-body items aren't in the pack
    // at all, and consumables get their own dedicated bar rather than
    // double-counting here too.
    var weighable = visible.filter(function (it) { return !it.onBody && !it.consumable; });
    var weighablePacked = packedItems.filter(function (it) { return !it.onBody && !it.consumable; });

    return {
      you: {
        total: visible.length, packed: packedItems.length,
        weightTotal: sumWeight(weighable), weightPacked: sumWeight(weighablePacked),
      },
      anjo: {
        total: anjoItems.length, packed: anjoPacked.length,
        weightTotal: sumWeight(anjoItems), weightPacked: sumWeight(anjoPacked),
      },
      cons: {
        total: consItems.length, packed: consPacked.length,
        weightTotal: sumWeight(consItems), weightPacked: sumWeight(consPacked),
      },
    };
  }

  function renderTallyStrip(t) {
    var wrap = document.getElementById("tally-strip");
    wrap.innerHTML = "";
    [
      ["Packed", t.you],
      ["On Anjo", t.anjo],
      ["Consumables", t.cons],
    ].forEach(function (pair) {
      var cell = document.createElement("div");
      cell.className = "tally-cell";

      var num = document.createElement("div");
      num.className = "tally-num mono";
      num.appendChild(document.createTextNode(String(pair[1].packed)));
      var of = document.createElement("span");
      of.className = "tally-of";
      of.textContent = "/" + pair[1].total;
      num.appendChild(of);
      cell.appendChild(num);

      var label = document.createElement("div");
      label.className = "tally-label";
      label.textContent = pair[0];
      cell.appendChild(label);

      wrap.appendChild(cell);
    });
  }

  function budgetCapStepper(label, valueG, onChange, ariaLabel) {
    // ariaLabel lets a caller give the buttons a distinguishable name (e.g.
    // "Anjo budget") without also duplicating that word in the visible
    // label - the Anjo stepper's visible label is "" because " · Anjo "
    // already precedes it as plain text.
    ariaLabel = ariaLabel || label;
    var wrap = document.createElement("span");
    wrap.className = "budget-cap";
    wrap.appendChild(document.createTextNode(label + " "));

    var minus = document.createElement("button");
    minus.type = "button";
    minus.className = "stepper-btn stepper-btn-sm";
    minus.textContent = "−";
    minus.setAttribute("aria-label", "Decrease " + ariaLabel);
    minus.addEventListener("click", function () { onChange(Math.max(1000, valueG - 500)); });

    var val = document.createElement("span");
    val.textContent = (valueG / 1000).toFixed(1) + " kg";

    var plus = document.createElement("button");
    plus.type = "button";
    plus.className = "stepper-btn stepper-btn-sm";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Increase " + ariaLabel);
    plus.addEventListener("click", function () { onChange(Math.min(50000, valueG + 500)); });

    wrap.appendChild(minus);
    wrap.appendChild(val);
    wrap.appendChild(plus);
    return wrap;
  }

  function budgetBarRow(label, total, packed, cap, note, noteClass) {
    var row = document.createElement("div");
    row.className = "budget-row";

    var over = total > cap;

    var head = document.createElement("div");
    head.className = "budget-row-head";

    var lab = document.createElement("span");
    lab.className = "budget-row-label";
    lab.textContent = label;
    head.appendChild(lab);

    var val = document.createElement("span");
    val.className = "budget-row-value mono";
    val.textContent = formatWeight(total);
    head.appendChild(val);

    if (note) {
      var noteEl = document.createElement("span");
      noteEl.className = "budget-row-note" + (noteClass ? " " + noteClass : "");
      noteEl.textContent = "· " + note;
      head.appendChild(noteEl);
    }

    var pct = document.createElement("span");
    pct.className = "budget-row-pct mono" + (over ? " over" : "");
    pct.textContent = (cap ? Math.round(100 * total / cap) : 0) + "%";
    head.appendChild(pct);

    row.appendChild(head);

    var track = document.createElement("div");
    track.className = "budget-track" + (over ? " over" : "");

    var totalFill = document.createElement("div");
    totalFill.className = "budget-fill-total";
    totalFill.style.width = Math.min(100, cap ? 100 * total / cap : 0) + "%";
    track.appendChild(totalFill);

    var packedFill = document.createElement("div");
    packedFill.className = "budget-fill-packed";
    packedFill.style.width = Math.min(100, cap ? 100 * packed / cap : 0) + "%";
    track.appendChild(packedFill);

    row.appendChild(track);
    return row;
  }

  function renderBudgetPanel(t) {
    var wrap = document.getElementById("budget-panel");
    wrap.innerHTML = "";

    var header = document.createElement("div");
    header.className = "budget-header";

    var eyebrow = document.createElement("div");
    eyebrow.className = "panel-eyebrow";
    eyebrow.textContent = "Weight budget";
    header.appendChild(eyebrow);

    var caps = document.createElement("div");
    caps.className = "budget-caps mono";
    caps.appendChild(budgetCapStepper("Budget", state.budgetG, function (next) {
      state.budgetG = next;
      saveState();
      renderChecklist();
    }));
    caps.appendChild(document.createTextNode(" · Anjo "));
    caps.appendChild(budgetCapStepper("", state.dogBudgetG, function (next) {
      state.dogBudgetG = next;
      saveState();
      renderChecklist();
    }, "Anjo budget"));
    header.appendChild(caps);
    wrap.appendChild(header);

    var cls = t.you.weightPacked > 0 ? weightClass(t.you.weightPacked) : null;
    wrap.appendChild(budgetBarRow(
      "On your back", t.you.weightTotal, t.you.weightPacked, state.budgetG,
      cls, cls === "Heavy" ? "heavy" : null
    ));
    wrap.appendChild(budgetBarRow("On Anjo", t.anjo.weightTotal, t.anjo.weightPacked, state.dogBudgetG));
    wrap.appendChild(budgetBarRow("Consumables", t.cons.weightTotal, t.cons.weightPacked, state.budgetG));

    var legend = document.createElement("div");
    legend.className = "budget-legend";
    [
      ["legend-packed", "Packed"],
      ["legend-remaining", "Still to pack"],
      ["legend-headroom", "Budget remaining"],
      ["legend-over", "Over budget"],
    ].forEach(function (pair) {
      var item = document.createElement("div");
      item.className = "legend-item";
      var swatch = document.createElement("span");
      swatch.className = "legend-swatch " + pair[0];
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(pair[1]));
      legend.appendChild(item);
    });
    wrap.appendChild(legend);
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
