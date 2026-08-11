(function () {
  "use strict";

  var items = FIRST_AID_ITEMS.map(function (item, i) {
    item._id = i;
    return item;
  });

  var state = { anjo: true };
  var checked = new Set();

  var STORAGE_KEY = "camping-first-aid-session-v1";

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        anjo: state.anjo,
        checked: Array.from(checked),
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
      if (typeof saved.anjo === "boolean") state.anjo = saved.anjo;
      if (Array.isArray(saved.checked)) checked = new Set(saved.checked);
    } catch (e) {
      // Corrupt or unavailable storage - fall back to defaults.
    }
  }

  loadState();

  document.getElementById("fa-note").textContent =
    "The itemised contents behind the single \"First aid kit\" line on the main checklist " +
    "(110.44 g for the human kit, 49.8 g for Anjo's). Items the dog's kit shares with the " +
    "human kit (e.g. Paracetemol) show one row with an extra \"🐾 +N\" badge, rather than a " +
    "duplicate entry - toggle Anjo off to see just what the human kit needs.";

  function isDogExclusive(item) { return item.dog != null && item.human == null; }
  function isBase(item) { return item.human != null || (item.human == null && item.dog == null); }

  function visibleItems() {
    return items.filter(function (it) {
      return isBase(it) || (isDogExclusive(it) && state.anjo);
    });
  }

  function formatWeight(g) {
    if (g >= 1000) return (g / 1000).toFixed(g % 1000 === 0 ? 0 : 1) + " kg";
    return (g % 1 === 0 ? g : g.toFixed(2)) + " g";
  }

  function badge(text, extraClass) {
    var span = document.createElement("span");
    span.className = "badge" + (extraClass ? " " + extraClass : "");
    span.textContent = text;
    return span;
  }

  function pawBadge(text) {
    var span = document.createElement("span");
    span.className = "badge badge-anjo";
    var paw = document.createElement("span");
    paw.className = "paw";
    paw.textContent = "🐾";
    span.appendChild(paw);
    span.appendChild(document.createTextNode(text));
    return span;
  }

  function renderToggle() {
    var wrap = document.getElementById("category-chips");
    wrap.innerHTML = "";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip category" + (state.anjo ? " active" : " off");
    var paw = document.createElement("span");
    paw.className = "paw";
    paw.textContent = "🐾";
    btn.appendChild(paw);
    btn.appendChild(document.createTextNode(" Anjo"));
    btn.setAttribute("aria-pressed", state.anjo);
    btn.addEventListener("click", function () {
      state.anjo = !state.anjo;
      renderToggle();
      render();
    });
    wrap.appendChild(btn);
  }

  function buildMeta(item) {
    var wrap = document.createElement("div");
    wrap.className = "item-meta";
    if (item.human != null) wrap.appendChild(badge("×" + item.human));
    if (item.dog != null && state.anjo) {
      wrap.appendChild(pawBadge(item.human != null ? " +" + item.dog : " ×" + item.dog));
    }
    if (item.weightG) wrap.appendChild(badge(formatWeight(item.weightG)));
    return wrap;
  }

  function renderItem(item) {
    var li = document.createElement("label");
    li.className = "item" + (checked.has(item._id) ? " checked" : "");

    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checked.has(item._id);
    cb.addEventListener("change", function () {
      if (cb.checked) checked.add(item._id); else checked.delete(item._id);
      render();
    });
    li.appendChild(cb);

    var body = document.createElement("div");
    body.className = "item-body";
    var name = document.createElement("div");
    name.className = "item-name";
    name.textContent = item.name;
    body.appendChild(name);
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

  function render() {
    var main = document.getElementById("checklist");
    main.innerHTML = "";
    var visible = visibleItems();

    var section = document.createElement("section");
    section.className = "category";
    var h2 = document.createElement("h2");
    var doneCount = visible.filter(function (it) { return checked.has(it._id); }).length;
    h2.innerHTML = "<span>Kit contents</span><span>" + doneCount + "/" + visible.length + "</span>";
    section.appendChild(h2);

    var ul = document.createElement("ul");
    ul.className = "items flow";
    visible.forEach(function (item) { ul.appendChild(renderItem(item)); });
    section.appendChild(ul);
    main.appendChild(section);

    document.getElementById("progress-text").textContent = doneCount + " of " + visible.length + " packed";
    document.getElementById("progress-fill").style.width = visible.length ? (100 * doneCount / visible.length) + "%" : "0%";
    saveState();
  }

  renderToggle();
  render();
})();
