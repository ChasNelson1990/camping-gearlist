(function () {
  "use strict";
  var KEY = "camping-theme";

  function apply(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      btn.textContent = theme === "dark" ? "☀️" : "🌙";
      btn.setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
    }
  }

  var toggle = document.getElementById("theme-toggle");
  if (!toggle) return;

  apply(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");

  toggle.addEventListener("click", function () {
    var current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    var next = current === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, next); } catch (e) {
      // Storage unavailable (private browsing, etc) - theme still applies for this load.
    }
    apply(next);
  });
})();
