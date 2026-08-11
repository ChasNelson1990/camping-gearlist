(function () {
  "use strict";

  var items = FIRST_AID_ITEMS;
  var checked = new Set();

  document.getElementById("fa-note").textContent =
    "The itemised contents behind the single \"First aid kit\" line on the main checklist " +
    "(110.44 g for the human kit, 49.8 g for the dog's kit).";

  function formatWeight(g) {
    if (g >= 1000) return (g / 1000).toFixed(g % 1000 === 0 ? 0 : 1) + " kg";
    return (g % 1 === 0 ? g : g.toFixed(2)) + " g";
  }

  function formatCount(n) {
    return n % 1 === 0 ? String(n) : String(n);
  }

  function badge(text) {
    var span = document.createElement("span");
    span.className = "badge";
    span.textContent = text;
    return span;
  }

  function renderItem(item, i) {
    var li = document.createElement("label");
    li.className = "item" + (checked.has(i) ? " checked" : "");

    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checked.has(i);
    cb.addEventListener("change", function () {
      if (cb.checked) checked.add(i); else checked.delete(i);
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
    if (item.human) meta.appendChild(badge("Human ×" + formatCount(item.human)));
    if (item.dog) meta.appendChild(badge("Dog ×" + formatCount(item.dog)));
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

  function render() {
    var main = document.getElementById("checklist");
    main.innerHTML = "";

    var section = document.createElement("section");
    section.className = "category";
    var h2 = document.createElement("h2");
    var doneCount = items.filter(function (_, i) { return checked.has(i); }).length;
    h2.innerHTML = "<span>Kit contents</span><span>" + doneCount + "/" + items.length + "</span>";
    section.appendChild(h2);

    var ul = document.createElement("ul");
    ul.className = "items";
    items.forEach(function (item, i) { ul.appendChild(renderItem(item, i)); });
    section.appendChild(ul);

    main.appendChild(section);
    updateProgress();
  }

  function updateProgress() {
    var total = items.length;
    var done = items.filter(function (_, i) { return checked.has(i); }).length;
    document.getElementById("progress-text").textContent = done + " of " + total + " packed";
    document.getElementById("progress-fill").style.width = total ? (100 * done / total) + "%" : "0%";
  }

  render();
})();
