/* Quiet Heroes -- plain JS, no build step.
   Data: heroes.json. Audio: audio/<id>.mp3.
   index.html shows today's hero (viewer's local date), or ?id=<slug>, or ?date=MM-DD.
   browse.html lists everything by month. */
(function () {
  "use strict";

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function key(m, d) { return pad(m) + "-" + pad(d); }
  function longDate(m, d, y) { return d + " " + MONTHS[m - 1] + (y ? " " + y : ""); }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  // Day-of-year in a leap year so 29 Feb has a slot; used only for ordering.
  function ordinal(m, d) {
    var cum = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335];
    return cum[m - 1] + d;
  }

  function load(cb) {
    var x = new XMLHttpRequest();
    x.open("GET", "heroes.json", true);
    x.onload = function () {
      if (x.status >= 200 && x.status < 300) {
        var data = JSON.parse(x.responseText);
        var heroes = data.heroes.slice().sort(function (a, b) {
          return ordinal(a.month, a.day) - ordinal(b.month, b.day);
        });
        cb(heroes);
      } else {
        fail("Could not load heroes.json (status " + x.status + ").");
      }
    };
    x.onerror = function () { fail("Could not load heroes.json."); };
    x.send();
  }

  function fail(msg) {
    var el = document.getElementById("hero-name") || document.getElementById("months");
    if (el) { el.textContent = msg; }
  }

  /* ---------------- Today page ---------------- */

  function pickHero(heroes, today) {
    var params = new URLSearchParams(location.search);
    var byId = params.get("id");
    if (byId) {
      for (var i = 0; i < heroes.length; i++) {
        if (heroes[i].id === byId) { return { hero: heroes[i], mode: "id" }; }
      }
    }
    var wanted = params.get("date"); // MM-DD
    var m = today.getMonth() + 1, d = today.getDate();
    if (wanted && /^\d\d-\d\d$/.test(wanted)) {
      m = parseInt(wanted.slice(0, 2), 10); d = parseInt(wanted.slice(3, 5), 10);
    }
    var k = key(m, d);
    for (var j = 0; j < heroes.length; j++) {
      if (key(heroes[j].month, heroes[j].day) === k) {
        return { hero: heroes[j], mode: wanted ? "date" : "today" };
      }
    }
    // No hero on this date: show the most recent one before it (wrapping the year).
    var o = ordinal(m, d), best = null;
    for (var n = 0; n < heroes.length; n++) {
      if (ordinal(heroes[n].month, heroes[n].day) <= o) { best = heroes[n]; }
    }
    if (!best) { best = heroes[heroes.length - 1]; }
    return { hero: best, mode: "recent", askedFor: { m: m, d: d } };
  }

  function neighbours(heroes, hero) {
    var i = heroes.indexOf(hero);
    return {
      prev: heroes[(i - 1 + heroes.length) % heroes.length],
      next: heroes[(i + 1) % heroes.length]
    };
  }

  function upcoming(heroes, today, days) {
    var out = [];
    for (var i = 1; i <= days; i++) {
      var t = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
      var k = key(t.getMonth() + 1, t.getDate());
      for (var j = 0; j < heroes.length; j++) {
        if (key(heroes[j].month, heroes[j].day) === k) {
          out.push({ hero: heroes[j], date: t, offset: i });
        }
      }
    }
    return out;
  }

  function renderToday(heroes) {
    var today = new Date();
    var picked = pickHero(heroes, today);
    var h = picked.hero;

    var kicker = document.getElementById("kicker");
    if (picked.mode === "today") {
      kicker.textContent = "Today's hero, " + DAYS[today.getDay()] + " " + longDate(h.month, h.day);
    } else if (picked.mode === "recent") {
      kicker.textContent = "No hero on " + longDate(picked.askedFor.m, picked.askedFor.d) +
        ". Most recent: " + longDate(h.month, h.day);
    } else {
      kicker.textContent = "Hero for " + longDate(h.month, h.day);
    }

    document.title = h.name + " | Quiet Heroes";
    document.getElementById("hero-name").textContent = h.name;
    document.getElementById("hero-blurb").textContent = h.blurb;

    var dateEl = document.getElementById("hero-date");
    dateEl.innerHTML = "<strong>" + esc(longDate(h.month, h.day, h.year)) + ".</strong> " +
      esc(h.anchor_reason) +
      (h.date_confidence === "approximate" ? " <em>(The exact day is uncertain in the sources.)</em>" : "");

    var story = document.getElementById("hero-story");
    story.innerHTML = "";
    var sentences = h.story.split(/(?<=[.!?])\s+(?=[A-Z0-9"])/);
    var chunk = [], para;
    for (var i = 0; i < sentences.length; i++) {
      chunk.push(sentences[i]);
      if (chunk.length >= 4 || i === sentences.length - 1) {
        para = document.createElement("p");
        para.textContent = chunk.join(" ");
        story.appendChild(para);
        chunk = [];
      }
    }

    var notes = document.getElementById("hero-notes");
    var html = "<h2>Notes and sources</h2>";
    if (h.contested) { html += "<p>" + esc(h.contested) + "</p>"; }
    html += "<ul>";
    for (var s = 0; s < h.sources.length; s++) {
      var u = h.sources[s];
      var host = u.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      html += '<li><a href="' + esc(u) + '" rel="noopener">' + esc(host) + "</a></li>";
    }
    html += "</ul>";
    notes.innerHTML = html;

    setupAudio(h);

    var nb = neighbours(heroes, h);
    document.getElementById("pager").innerHTML =
      '<a href="?id=' + esc(nb.prev.id) + '">&larr; ' + esc(nb.prev.name) +
      "<span>" + esc(longDate(nb.prev.month, nb.prev.day)) + "</span></a>" +
      '<a href="?id=' + esc(nb.next.id) + '">' + esc(nb.next.name) + " &rarr;" +
      "<span>" + esc(longDate(nb.next.month, nb.next.day)) + "</span></a>";

    var strip = document.getElementById("strip");
    var list = upcoming(heroes, today, 7);
    if (!list.length) {
      // Nothing in the next week: show the next three on the calendar.
      var idx = heroes.indexOf(nb.next);
      for (var q = 0; q < 3; q++) {
        var hh = heroes[(idx + q) % heroes.length];
        list.push({ hero: hh, date: null, offset: null });
      }
      document.getElementById("next-heading").textContent = "Coming later";
    } else {
      document.getElementById("next-heading").textContent = "Next seven days";
    }
    strip.innerHTML = list.map(function (item) {
      var when = item.date
        ? (item.offset === 1 ? "Tomorrow" : DAYS[item.date.getDay()]) + ", " + longDate(item.hero.month, item.hero.day)
        : longDate(item.hero.month, item.hero.day);
      return '<li><a href="?id=' + esc(item.hero.id) + '">' +
        '<span class="when">' + esc(when) + "</span>" +
        '<span class="who">' + esc(item.hero.name) + "</span>" +
        '<span class="what">' + esc(item.hero.blurb) + "</span></a></li>";
    }).join("");
  }

  function setupAudio(h) {
    var btn = document.getElementById("play");
    var status = document.getElementById("play-status");
    var audio = document.getElementById("audio");
    var label = btn.querySelector(".label");
    var icon = btn.querySelector(".icon");
    audio.src = "audio/" + h.id + ".mp3";
    btn.disabled = false;
    btn.setAttribute("aria-label", "Play the story of " + h.name);

    function setPlaying(on) {
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      label.textContent = on ? "Pause" : "Play story";
      icon.innerHTML = on ? "&#10074;&#10074;" : "&#9654;";
      btn.setAttribute("aria-label", (on ? "Pause the story of " : "Play the story of ") + h.name);
    }

    btn.onclick = function () {
      if (audio.paused) {
        var p = audio.play();
        if (p && p.catch) { p.catch(function () { status.textContent = "Could not play the audio."; }); }
      } else {
        audio.pause();
      }
    };
    audio.onplay = function () { setPlaying(true); status.textContent = "Playing. Read by a cloned voice of Karthik."; };
    audio.onpause = function () { setPlaying(false); if (!audio.ended) { status.textContent = "Paused."; } };
    audio.onended = function () { setPlaying(false); status.textContent = "Finished."; };
    audio.onerror = function () {
      btn.disabled = true;
      status.textContent = "Audio is not available for this hero yet.";
    };
    audio.ontimeupdate = function () {
      if (!audio.duration || audio.paused) { return; }
      var left = Math.max(0, Math.round(audio.duration - audio.currentTime));
      status.textContent = "Playing. " + Math.floor(left / 60) + ":" + pad(left % 60) + " left.";
    };
    var mins = h.story.split(/\s+/).length / 140;
    status.textContent = (mins < 1.25 ? "About a minute" :
      mins < 1.75 ? "About a minute and a half" : "About " + Math.round(mins) + " minutes") + " of audio.";
  }

  /* ---------------- Browse page ---------------- */

  function renderBrowse(heroes) {
    document.getElementById("count").textContent = heroes.length + " people, at least three in every month. Pick one to read or hear the story.";
    var jump = document.getElementById("month-jump");
    var wrap = document.getElementById("months");
    var today = new Date();
    var tk = key(today.getMonth() + 1, today.getDate());
    for (var m = 1; m <= 12; m++) {
      var these = heroes.filter(function (h) { return h.month === m; });
      if (!these.length) { continue; }
      jump.innerHTML += '<li><a href="#m' + m + '">' + MONTHS[m - 1].slice(0, 3) + "</a></li>";
      var sec = document.createElement("section");
      sec.className = "month";
      sec.id = "m" + m;
      sec.innerHTML = "<h2>" + MONTHS[m - 1] + "</h2><ol>" + these.map(function (h) {
        var isToday = key(h.month, h.day) === tk;
        return '<li><a href="./?id=' + esc(h.id) + '"' + (isToday ? ' aria-current="date"' : "") + ">" +
          '<span class="day">' + h.day + "</span>" +
          '<span class="who">' + esc(h.name) + (isToday ? " (today)" : "") + "</span>" +
          '<span class="what">' + esc(h.blurb) + ". " + esc(h.year) + ".</span></a></li>";
      }).join("") + "</ol>";
      wrap.appendChild(sec);
    }
  }

  load(function (heroes) {
    if (document.getElementById("months")) { renderBrowse(heroes); }
    else { renderToday(heroes); }
  });
})();
