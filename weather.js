(function () {
  "use strict";

  // Glasgow - a reasonable general-purpose Scotland reference point. Fixed
  // for now; if this ever needs to support multiple locations, swap this
  // for a small select wired the same way as the trip/season filters.
  var LATITUDE = 55.8642;
  var LONGITUDE = -4.2518;

  // WMO weather codes (the fixed vocabulary Open-Meteo's `weather_code`
  // field uses) -> condition label. https://open-meteo.com/en/docs
  var WEATHER_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Dense drizzle",
    56: "Freezing drizzle",
    57: "Freezing drizzle",
    61: "Slight rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Freezing rain",
    71: "Slight snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Rain showers",
    81: "Rain showers",
    82: "Violent showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm, hail",
    99: "Thunderstorm, hail",
  };

  function weatherInfo(code) {
    return WEATHER_CODES[code] || "Unknown";
  }

  function dayLabel(dateStr, index) {
    if (index === 0) return "Today";
    if (index === 1) return "Tomorrow";
    // dateStr is a calendar date in the Europe/London timezone (the
    // request below is pinned to it). Parsing/formatting it without saying
    // so uses the viewer's own timezone on both ends instead - in practice
    // that round-trips back to the same weekday regardless of viewer TZ
    // (verified against Pacific/Kiritimati, UTC+14, the most extreme
    // offset there is), since parse-local then format-local cancels out.
    // Still worth being explicit rather than relying on that cancellation:
    // noon UTC is always still the same calendar date in London (its UTC
    // offset never exceeds +1h), so it's an unambiguous instant to format
    // from, and the explicit timeZone is what actually pins the output to
    // London rather than leaning on an implicit invariant.
    var d = new Date(dateStr + "T12:00:00Z");
    return d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Europe/London" });
  }

  function setStatus(text) {
    var wrap = document.getElementById("weather-days");
    wrap.innerHTML = "";
    var p = document.createElement("p");
    p.className = "weather-status";
    // Announces the text to screen readers when it's set/changed (e.g.
    // "Loading forecast..." then later replaced by an error message) -
    // without this, a dynamically-inserted paragraph is silent to
    // assistive tech unless the user happens to have focus inside it.
    p.setAttribute("role", "status");
    p.textContent = text;
    wrap.appendChild(p);
  }

  function renderDays(daily) {
    var wrap = document.getElementById("weather-days");
    wrap.innerHTML = "";
    daily.time.forEach(function (date, i) {
      var condition = weatherInfo(daily.weather_code[i]);

      var card = document.createElement("div");
      card.className = "weather-day";

      var label = document.createElement("div");
      label.className = "weather-day-label";
      label.textContent = dayLabel(date, i);
      card.appendChild(label);

      var conditionEl = document.createElement("div");
      conditionEl.className = "weather-condition";
      conditionEl.textContent = condition;
      card.appendChild(conditionEl);

      var temps = document.createElement("div");
      temps.className = "weather-temps";
      temps.textContent = Math.round(daily.temperature_2m_max[i]) + "° / " + Math.round(daily.temperature_2m_min[i]) + "°";
      card.appendChild(temps);

      var rain = document.createElement("div");
      rain.className = "weather-rain";
      var chance = daily.precipitation_probability_max[i];
      rain.textContent = chance != null ? chance + "% rain" : "—";
      card.appendChild(rain);

      wrap.appendChild(card);
    });
  }

  var url = "https://api.open-meteo.com/v1/forecast" +
    "?latitude=" + LATITUDE + "&longitude=" + LONGITUDE +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=Europe%2FLondon&forecast_days=4";

  // This script is loaded before data.js/app.js (see index.html), so an
  // uncaught throw here should still degrade to just a broken weather
  // widget, never anything that could plausibly stop later scripts from
  // running - fetch is feature-detected for exactly that reason, on top of
  // being the right way to handle a genuinely fetch-less browser anyway.
  if (typeof fetch !== "function") {
    setStatus("Couldn't load the forecast - try again later.");
    return;
  }

  // Without a timeout, a stalled connection (as opposed to a clean
  // rejection) leaves the widget stuck on "Loading forecast..." forever -
  // .catch() only runs when the fetch actually rejects, which a hang never
  // does on its own. AbortController and Promise.prototype.finally are both
  // younger than fetch() itself, so a browser with the latter but not the
  // former isn't far-fetched - feature-detected and avoided respectively,
  // so such a browser just runs without the timeout instead of crashing
  // before the request even starts.
  var hasAbort = typeof AbortController !== "undefined";
  var controller = hasAbort ? new AbortController() : null;
  var timeoutId = hasAbort ? setTimeout(function () { controller.abort(); }, 10000) : null;

  fetch(url, hasAbort ? { signal: controller.signal } : undefined)
    .then(function (res) {
      if (timeoutId != null) clearTimeout(timeoutId);
      if (!res.ok) throw new Error("Open-Meteo request failed: " + res.status);
      return res.json();
    })
    .then(function (data) { renderDays(data.daily); })
    .catch(function () {
      if (timeoutId != null) clearTimeout(timeoutId);
      setStatus("Couldn't load the forecast - try again later.");
    });
})();
