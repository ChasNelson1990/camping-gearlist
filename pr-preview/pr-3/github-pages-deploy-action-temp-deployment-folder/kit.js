(function () {
  "use strict";

  var items = KIT_ITEMS.map(function (item, i) {
    item._id = i;
    return item;
  });

  var checked = new Set();
  // Keyed by pathname so each kit page (repair-kit.html,
  // water-purification-kit.html, ...) gets its own independent session
  // state despite sharing this one script.
  var STORAGE_KEY = "camping-kit-session-v1-" + location.pathname;

  function saveState() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ checked: Array.from(checked) }));
    } catch (e) {
      // Storage unavailable (private browsing, etc) - degrade to non-persistent.
    }
  }

  function loadState() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (Array.isArray(saved.checked)) checked = new Set(saved.checked);
    } catch (e) {
      // Corrupt or unavailable storage - fall back to defaults.
    }
  }

  loadState();

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

  function linkBadge(href, label) {
    var a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "badge item-link";
    a.textContent = label;
    a.addEventListener("click", function (e) { e.stopPropagation(); });
    return a;
  }

  function buildMeta(item) {
    var wrap = document.createElement("div");
    wrap.className = "item-meta";
    if (item.quantity > 1) wrap.appendChild(badge("×" + item.quantity));
    if (item.weightG) {
      wrap.appendChild(badge(item.quantity > 1
        ? formatWeight(item.weightG) + " each → " + formatWeight(item.weightG * item.quantity) + " total"
        : formatWeight(item.weightG)));
    }
    if (item.current) wrap.appendChild(linkBadge(item.current, "↗ view item"));
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
    if (item.emoji) {
      var icon = document.createElement("span");
      icon.className = "item-emoji";
      icon.textContent = item.emoji;
      name.appendChild(icon);
    }
    name.appendChild(document.createTextNode(item.name));
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

    var section = document.createElement("section");
    section.className = "category";
    var h2 = document.createElement("h2");
    var doneCount = items.filter(function (it) { return checked.has(it._id); }).length;
    h2.innerHTML = "<span>Kit contents</span><span>" + doneCount + "/" + items.length + "</span>";
    section.appendChild(h2);

    var ul = document.createElement("ul");
    ul.className = "items flow";
    items.forEach(function (item) { ul.appendChild(renderItem(item)); });
    section.appendChild(ul);
    main.appendChild(section);

    document.getElementById("progress-text").textContent = doneCount + " of " + items.length + " packed";
    document.getElementById("progress-fill").style.width = items.length ? (100 * doneCount / items.length) + "%" : "0%";
    saveState();
  }

  render();
})();
