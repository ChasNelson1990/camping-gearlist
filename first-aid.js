(function () {
  "use strict";

  var CATEGORIES = ["Human", "Anjo"];

  var items = FIRST_AID_ITEMS.map(function (item, i) {
    item._id = i;
    return item;
  });

  var state = {
    categories: new Set(CATEGORIES),
  };

  var checked = new Set(); // keys: "<category>:<item._id>" - each kit's copy is checked independently

  document.getElementById("fa-note").textContent =
    "The itemised contents behind the single \"First aid kit\" line on the main checklist " +
    "(110.44 g for the human kit, 49.8 g for Anjo's). Items belong to a kit if the spreadsheet " +
    "gives them a \"For human\"/\"For dog\" count; items with neither default to the human kit.";

  function belongsTo(cat, item) {
    if (cat === "Anjo") return item.dog != null;
    return item.human != null || (item.human == null && item.dog == null);
  }

  function countFor(cat, item) {
    return cat === "Anjo" ? item.dog : item.human;
  }

  function itemsFor(cat) {
    return items.filter(function (it) { return belongsTo(cat, it); });
  }

  function formatWeight(g) {
    if (g >= 1000) return (g / 1000).toFixed(g % 1000 === 0 ? 0 : 1) + " kg";
    return (g % 1 === 0 ? g : g.toFixed(2)) + " g";
  }

  function badge(text) {
    var span = document.createElement("span");
    span.className = "badge";
    span.textContent = text;
    return span;
  }

  function renderCategoryChips() {
    var wrap = document.getElementById("category-chips");
    wrap.innerHTML = "";
    CATEGORIES.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip category" + (state.categories.has(cat) ? " active" : " off");
      btn.textContent = cat + " (" + itemsFor(cat).length + ")";
      btn.setAttribute("aria-pressed", state.categories.has(cat));
      btn.addEventListener("click", function () {
        if (state.categories.has(cat)) state.categories.delete(cat);
        else state.categories.add(cat);
        renderCategoryChips();
        render();
      });
      wrap.appendChild(btn);
    });
  }

  function renderItem(cat, item) {
    var key = cat + ":" + item._id;
    var li = document.createElement("label");
    li.className = "item" + (checked.has(key) ? " checked" : "");

    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checked.has(key);
    cb.addEventListener("change", function () {
      if (cb.checked) checked.add(key); else checked.delete(key);
      render();
    });
    li.appendChild(cb);

    var body = document.createElement("div");
    body.className = "item-body";
    var name = document.createElement("div");
    name.className = "item-name";
    name.textContent = item.name;
    body.appendChild(name);

    var meta = document.createElement("div");
    meta.className = "item-meta";
    var count = countFor(cat, item);
    if (count) meta.appendChild(badge("×" + count));
    if (item.weightG) meta.appendChild(badge(formatWeight(item.weightG)));
    body.appendChild(meta);

    if (item.comment) {
      var comment = document.createElement("div");
      comment.className = "item-comment";
      comment.textContent = item.comment;
      body.appendChild(comment);
    }

    li.appendChild(body);
    return li;
  }

  function renderCategorySection(cat) {
    var catItems = itemsFor(cat);
    var section = document.createElement("section");
    section.className = "category";

    var h2 = document.createElement("h2");
    var checkedCount = catItems.filter(function (it) { return checked.has(cat + ":" + it._id); }).length;
    h2.innerHTML = "<span>" + cat + "</span><span>" + checkedCount + "/" + catItems.length + "</span>";
    section.appendChild(h2);

    var ul = document.createElement("ul");
    ul.className = "items";
    catItems.forEach(function (item) { ul.appendChild(renderItem(cat, item)); });
    section.appendChild(ul);
    return section;
  }

  function render() {
    var main = document.getElementById("checklist");
    main.innerHTML = "";

    var visibleCats = CATEGORIES.filter(function (cat) { return state.categories.has(cat); });
    if (!visibleCats.length) {
      var empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "No kit selected.";
      main.appendChild(empty);
    } else {
      visibleCats.forEach(function (cat) { main.appendChild(renderCategorySection(cat)); });
    }

    updateProgress(visibleCats);
  }

  function updateProgress(visibleCats) {
    var total = 0, done = 0;
    visibleCats.forEach(function (cat) {
      itemsFor(cat).forEach(function (it) {
        total++;
        if (checked.has(cat + ":" + it._id)) done++;
      });
    });
    document.getElementById("progress-text").textContent = done + " of " + total + " packed";
    document.getElementById("progress-fill").style.width = total ? (100 * done / total) + "%" : "0%";
  }

  renderCategoryChips();
  render();
})();
