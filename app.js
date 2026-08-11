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
    categories: new Set(CATEGORY_ORDER.filter(function (c) {
      return items.some(function (it) { return it.category === c; });
    })),
  };

  var checked = new Set();

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

  function buildMeta(item) {
    var wrap = document.createElement("div");
    wrap.className = "item-meta";
    if (item.weightG) wrap.appendChild(badge(formatWeight(item.weightG)));
    if (item.cost) wrap.appendChild(badge(item.cost));
    if (item.season) wrap.appendChild(badge((item.season === "Summer" ? "☀ " : "❄ ") + item.season));
    if (item.onBody) wrap.appendChild(badge(onBodyLabel(item.onBody)));
    if (item.current) {
      if (item.currentIsUrl) {
        var a = document.createElement("a");
        a.href = item.current;
        a.target = "_blank";
        a.rel = "noopener";
        a.className = "badge item-link";
        a.textContent = "↗ view item";
        a.addEventListener("click", function (e) { e.stopPropagation(); });
        wrap.appendChild(a);
      } else {
        wrap.appendChild(badge(item.current));
      }
    }
    if (item.detailUrl) {
      var link = document.createElement("a");
      link.href = item.detailUrl;
      link.className = "badge item-link";
      link.textContent = item.detailLabel || "↗ details";
      link.addEventListener("click", function (e) { e.stopPropagation(); });
      wrap.appendChild(link);
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

  function wireSegmented(id, stateKey) {
    var group = document.getElementById(id);
    group.querySelectorAll(".chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state[stateKey] = btn.dataset.value;
        group.querySelectorAll(".chip").forEach(function (b) { b.classList.toggle("active", b === btn); });
        renderChecklist();
      });
    });
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
    catItems.forEach(function (item) { ul.appendChild(renderItem(item)); });
    section.appendChild(ul);
    return section;
  }

  function renderItem(item) {
    var li = document.createElement("label");
    li.className = "item" + (checked.has(item._id) ? " checked" : "");

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

  function updateProgress(visible) {
    var total = visible.length;
    var done = visible.filter(function (it) { return checked.has(it._id); }).length;
    document.getElementById("progress-text").textContent = done + " of " + total + " packed";
    document.getElementById("progress-fill").style.width = total ? (100 * done / total) + "%" : "0%";
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
        li.appendChild(buildMeta(item));
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

  wireSegmented("trip-filter", "trip");
  wireSegmented("season-filter", "season");
  renderCategoryChips();
  renderChecklist();
  renderArchive();
})();
