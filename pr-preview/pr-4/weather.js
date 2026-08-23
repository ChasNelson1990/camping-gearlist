(function () {
  "use strict";

  // Glasgow - a reasonable general-purpose Scotland reference point. Fixed
  // for now; if this ever needs to support multiple locations, swap this
  // for a small select wired the same way as the trip/season filters.
  var LATITUDE = 55.8642;
  var LONGITUDE = -4.2518;

  // WMO weather codes (the fixed vocabulary Open-Meteo's `weather_code`
  // field uses) -> [emoji, label]. https://open-meteo.com/en/docs
  var WEATHER_CODES = {
    0: ["☀️", "Clear sky"],
    1: ["🌤️", "Mainly clear"],
    2: ["⛅", "Partly cloudy"],
    3: ["☁️", "Overcast"],
    45: ["🌫️", "Fog"],
    48: ["🌫️", "Rime fog"],
    51: ["🌦️", "Light drizzle"],
    53: ["🌦️", "Drizzle"],
    55: ["🌧️", "Dense drizzle"],
    56: ["🌧️", "Freezing drizzle"],
    57: ["🌧️", "Freezing drizzle"],
    61: ["🌦️", "Slight rain"],
    63: ["🌧️", "Rain"],
    65: ["🌧️", "Heavy rain"],
    66: ["🌧️", "Freezing rain"],
    67: ["🌧️", "Freezing rain"],
    71: ["🌨️", "Slight snow"],
    73: ["🌨️", "Snow"],
    75: ["❄️", "Heavy snow"],
    77: ["❄️", "Snow grains"],
    80: ["🌦️", "Rain showers"],
    81: ["🌧️", "Rain showers"],
    82: ["⛈️", "Violent showers"],
    85: ["🌨️", "Snow showers"],
    86: ["❄️", "Heavy snow showers"],
    95: ["⛈️", "Thunderstorm"],
    96: ["⛈️", "Thunderstorm, hail"],
    99: ["⛈️", "Thunderstorm, hail"],
  };

  function weatherInfo(code) {
    return WEATHER_CODES[code] || ["❔", "Unknown"];
  }

  function dayLabel(dateStr, index) {
    if (index === 0) return "Today";
    if (index === 1) return "Tomorrow";
    var d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-GB", { weekday: "short" });
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
      var info = weatherInfo(daily.weather_code[i]);

      var card = document.createElement("div");
      card.className = "weather-day";

      var label = document.createElement("div");
      label.className = "weather-day-label";
      label.textContent = dayLabel(date, i);
      card.appendChild(label);

      var icon = document.createElement("div");
      icon.className = "weather-icon";
      icon.textContent = info[0];
      icon.title = info[1];
      // title alone is an unreliable accessible name - not announced
      // consistently across screen readers, and unreachable at all on
      // touch devices (no hover). role="img" + aria-label makes the
      // condition ("Overcast", etc) the icon's actual accessible name.
      icon.setAttribute("role", "img");
      icon.setAttribute("aria-label", info[1]);
      card.appendChild(icon);

      var temps = document.createElement("div");
      temps.className = "weather-temps";
      temps.textContent = Math.round(daily.temperature_2m_max[i]) + "° / " + Math.round(daily.temperature_2m_min[i]) + "°";
      card.appendChild(temps);

      var rain = document.createElement("div");
      rain.className = "weather-rain";
      var chance = daily.precipitation_probability_max[i];
      rain.textContent = "💧 " + (chance != null ? chance + "%" : "—");
      card.appendChild(rain);

      wrap.appendChild(card);
    });
  }

  var url = "https://api.open-meteo.com/v1/forecast" +
    "?latitude=" + LATITUDE + "&longitude=" + LONGITUDE +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&timezone=Europe%2FLondon&forecast_days=4";

  fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error("Open-Meteo request failed: " + res.status);
      return res.json();
    })
    .then(function (data) { renderDays(data.daily); })
    .catch(function () { setStatus("Couldn't load the forecast - try again later."); });
})();
