/**
 * My Year — a visual yearly travel planner.
 *
 * Reads real, dated trips from the existing My Trips system via the
 * window.SojournTrips bridge (js/index.html) rather than duplicating a
 * trip store. Clicking a trip opens that system's existing trip detail
 * view — there is no second itinerary/canvas implementation here.
 *
 * "Find me a getaway" and "Plan my year" both hand off to the existing
 * Plan module (js/plan-ui.js / js/sojourn-plan.js) and its
 * MockTravelAIService — no new AI logic lives in this file.
 */
(function () {
  "use strict";

  var root = document.getElementById("year-root");
  if (!root) return;

  var MONTH_NAMES = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  var STATUS_LABELS = { idea: "Idea", researching: "Researching", ready: "Ready to book", booked: "Booked" };
  var STATUS_CLASS = { idea: "status-idea", researching: "status-researching", ready: "status-ready", booked: "status-booked" };

  var today = new Date();
  var state = {
    selectedYear: today.getFullYear(),
    viewMode: "calendar", // calendar | map
    editingBudget: false
  };

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n) { return "AUD " + Math.round(n || 0).toLocaleString(); }
  function fmtRange(startIso, endIso) {
    var s = new Date(startIso + "T00:00:00"), e = endIso ? new Date(endIso + "T00:00:00") : null;
    var sStr = s.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    if (!e) return sStr;
    var eStr = (e.getMonth() === s.getMonth()) ? e.toLocaleDateString(undefined, { day: "numeric" }) : e.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return sStr + "–" + eStr;
  }
  function nightsBetween(startIso, endIso) {
    if (!startIso || !endIso) return null;
    var d = Math.round((new Date(endIso) - new Date(startIso)) / 86400000);
    return d > 0 ? d : null;
  }

  // Best-effort borrow of curated destination imagery/emoji from the Plan
  // module's demo dataset, purely cosmetic — falls back cleanly if no match.
  function guessDestinationMeta(destLabel) {
    var P = window.SojournPlan;
    if (!P || !destLabel || !P.matchDestination) return null;
    return P.matchDestination(destLabel);
  }

  function tripCost(trip) {
    var c = trip.costs || {};
    var flights = Number(c.flights) || 0;
    var legs = (c.legCosts || []).reduce(function (s, v) { return s + (Number(v) || 0); }, 0);
    return flights + legs;
  }

  function tripsForYear(year) {
    var bridge = window.SojournTrips;
    if (!bridge) return [];
    return bridge.getAllTrips().filter(function (t) {
      if (!t.startDate) return false;
      return parseInt(t.startDate.slice(0, 4), 10) === year;
    }).sort(function (a, b) { return a.startDate.localeCompare(b.startDate); });
  }

  function destLabel(trip) {
    return trip.destination || (trip.legs && trip.legs.length ? trip.legs.map(function (l) { return l.city; }).join(" / ") : trip.title);
  }

  // ---------------------------------------------------------------- render

  function render() {
    var year = state.selectedYear;
    var trips = tripsForYear(year);
    var totalSpend = trips.reduce(function (s, t) { return s + tripCost(t); }, 0);
    var target = window.SojournTrips ? window.SojournTrips.getAnnualBudgetTarget(year) : 10000;

    root.innerHTML =
      renderHero(year) +
      renderBudget(trips, totalSpend, target, year) +
      renderPlanMyYearCta() +
      renderModeToggle() +
      (state.viewMode === "map" ? renderMapStrip(trips, year) : renderTimeline(trips, year));

    wire();
  }

  function renderHero(year) {
    var isFuture = year > today.getFullYear();
    var tagline = isFuture ? "A year worth looking forward to." : (year === today.getFullYear() ? "Your travel year, at a glance." : "A year to look back on.");
    return (
      '<section class="year-hero anim-rise">' +
        '<p class="eyebrow">MY YEAR</p>' +
        '<h1 class="display-xl">Your ' + year + '</h1>' +
        '<p class="lead year-tagline">' + tagline + '</p>' +
        '<div class="year-selector">' +
          '<button type="button" class="year-arrow" data-action="year-prev" aria-label="Previous year">‹</button>' +
          [year - 1, year, year + 1].map(function (y) {
            return '<button type="button" class="year-pill' + (y === year ? " on" : "") + '" data-action="year-jump" data-year="' + y + '">' + y + '</button>';
          }).join('<span class="year-sep">|</span>') +
          '<button type="button" class="year-arrow" data-action="year-next" aria-label="Next year">›</button>' +
        '</div>' +
      '</section>'
    );
  }

  function renderBudget(trips, totalSpend, target, year) {
    var pct = target ? Math.min(100, Math.round((totalSpend / target) * 100)) : 0;
    var over = totalSpend > target;
    var rows = trips.filter(function (t) { return tripCost(t) > 0; }).map(function (t) {
      return '<div class="year-budget-row"><span>' + escapeHtml(destLabel(t)) + '</span><span>' + money(tripCost(t)) + '</span></div>';
    }).join("");

    return (
      '<section class="year-section">' +
        '<div class="year-budget-card">' +
          '<div class="year-budget-head">' +
            '<h3>' + year + ' Travel Budget</h3>' +
            (state.editingBudget ?
              '<span class="year-budget-edit"><input type="number" id="budget-target-input" value="' + target + '"><button class="btn small primary" data-action="save-budget-target">Save</button></span>' :
              '<span class="year-budget-figure">' + money(totalSpend) + ' <span class="year-budget-of">/ ' + money(target) + '</span> <button type="button" class="year-edit-link" data-action="edit-budget-target">edit</button></span>'
            ) +
          '</div>' +
          '<div class="year-progress"><div class="year-progress-fill' + (over ? " over" : "") + '" style="width:' + pct + '%"></div></div>' +
          (rows ? '<div class="year-budget-rows">' + rows + '</div>' : '<p class="year-empty-note">No costs entered yet for ' + year + '.</p>') +
        '</div>' +
      '</section>'
    );
  }

  function renderPlanMyYearCta() {
    return (
      '<section class="year-section">' +
        '<div class="year-plan-cta">' +
          '<div>' +
            '<p class="eyebrow">✨ Plan my year</p>' +
            '<p class="lead">Tell Sojourn how you want to travel this year, and we\'ll help you shape the possibilities.</p>' +
          '</div>' +
          '<button class="btn primary" data-action="plan-my-year">Plan my year</button>' +
        '</div>' +
      '</section>'
    );
  }

  function renderModeToggle() {
    return (
      '<div class="year-mode-toggle">' +
        '<button type="button" class="year-mode-btn' + (state.viewMode === "calendar" ? " on" : "") + '" data-action="set-mode" data-mode="calendar">Calendar</button>' +
        '<button type="button" class="year-mode-btn' + (state.viewMode === "map" ? " on" : "") + '" data-action="set-mode" data-mode="map">Map</button>' +
      '</div>'
    );
  }

  function renderMapStrip(trips, year) {
    var profile = window.SojournTrips ? window.SojournTrips.getProfile() : {};
    var origin = profile.homeCity || "Home";
    var stops = [origin].concat(trips.map(destLabel));
    return (
      '<section class="year-section">' +
        '<div class="year-map-strip">' +
          stops.map(function (s, i) {
            return (i > 0 ? '<span class="year-map-arrow">→</span>' : "") + '<span class="year-map-stop' + (i === 0 ? " home" : "") + '">' + escapeHtml(s) + '</span>';
          }).join("") +
        '</div>' +
        '<p class="year-map-note">A lightweight route view — no mapping service is wired up yet, this is just the sequence of your ' + year + ' trips.</p>' +
      '</section>'
    );
  }

  function renderTimeline(trips, year) {
    var byMonth = {};
    trips.forEach(function (t) {
      var m = parseInt(t.startDate.slice(5, 7), 10) - 1;
      (byMonth[m] = byMonth[m] || []).push(t);
    });
    var isCurrentYear = year === today.getFullYear();
    var currentMonth = today.getMonth();

    var months = MONTH_NAMES.map(function (label, i) {
      var monthTrips = byMonth[i] || [];
      var isPastMonth = year < today.getFullYear() || (isCurrentYear && i < currentMonth);
      var body;
      if (monthTrips.length) {
        body = monthTrips.map(function (t) { return renderTripMoment(t, label); }).join("");
      } else if (isPastMonth) {
        body = '<div class="year-month-row muted"><span class="year-month-row-label">' + label + '</span><span class="year-month-row-dash">—</span></div>';
      } else {
        body = (
          '<div class="year-month-row">' +
            '<span class="year-month-row-label">' + label + '</span>' +
            '<p class="year-month-row-copy">You\'ve got the whole month free. Let\'s put it somewhere beautiful.</p>' +
            '<button type="button" class="btn small" data-action="find-getaway">Find my escape →</button>' +
          '</div>'
        );
      }
      return body;
    }).join("");

    return '<section class="year-section"><div class="year-timeline">' + months + '</div></section>';
  }

  function renderTripMoment(trip, monthLabel) {
    var meta = guessDestinationMeta(destLabel(trip));
    var nights = nightsBetween(trip.startDate, trip.endDate);
    var cost = tripCost(trip);
    var statusKey = trip.status || "idea";
    var tags = (trip.priorities || []).slice(0, 3);

    return (
      '<div class="year-moment img-frame xl overlay-full img-cover anim-rise" data-action="open-trip" data-id="' + trip.id + '"' +
        (meta ? ' style="background-image:url(\'' + meta.image + '\')"' : ' style="background:linear-gradient(135deg, var(--accent-soft), var(--surface-2))"') + '>' +
        '<span class="year-moment-month">' + monthLabel + '</span>' +
        '<span class="status-pill ' + (STATUS_CLASS[statusKey] || "status-idea") + '">' + (STATUS_LABELS[statusKey] || "Idea") + '</span>' +
        '<div class="year-moment-caption">' +
          '<p class="eyebrow on-image">' + (meta ? meta.emoji + " " : "") + fmtRange(trip.startDate, trip.endDate) + (nights ? " · " + nights + " days" : "") + '</p>' +
          '<h3 class="display-lg" style="color:#fff;">' + escapeHtml(destLabel(trip)) + '</h3>' +
          '<div class="year-moment-bottom">' +
            (tags.length ? '<div class="mood-row">' + tags.map(function (t) { return '<span class="mood-chip static on-image small">' + escapeHtml(t) + '</span>'; }).join("") + '</div>' : "<span></span>") +
            '<span class="year-moment-cost">' + (cost ? money(cost) : "Cost not entered") + '</span>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // ---------------------------------------------------------------- events

  function wire() {
    root.querySelectorAll("[data-action]").forEach(function (el) {
      el.addEventListener("click", handleClick);
    });
  }

  function handleClick(e) {
    var action = e.currentTarget.getAttribute("data-action");
    switch (action) {
      case "year-prev": state.selectedYear--; render(); break;
      case "year-next": state.selectedYear++; render(); break;
      case "year-jump": state.selectedYear = parseInt(e.currentTarget.getAttribute("data-year"), 10); render(); break;
      case "set-mode": state.viewMode = e.currentTarget.getAttribute("data-mode"); render(); break;
      case "edit-budget-target": state.editingBudget = true; render(); break;
      case "save-budget-target":
        var val = Number(document.getElementById("budget-target-input").value) || 0;
        window.SojournTrips.setAnnualBudgetTarget(state.selectedYear, val);
        state.editingBudget = false;
        render();
        break;
      case "open-trip":
        var id = e.currentTarget.getAttribute("data-id");
        if (window.SojournTrips.openTrip(id) && window.SojournNav) window.SojournNav.switchTo("trips");
        break;
      case "find-getaway":
        if (window.SojournNav) window.SojournNav.switchTo("plan");
        if (window.SojournPlanUI) window.SojournPlanUI.resetToHero();
        break;
      case "plan-my-year":
        if (window.SojournNav) window.SojournNav.switchTo("plan");
        if (window.SojournPlanUI) window.SojournPlanUI.startWithText("I want to plan my travel year.");
        break;
    }
  }

  // Re-render whenever the underlying trip data changes (a new trip saved
  // from Plan, a cost edited in My Trips, etc.) so this view never goes stale.
  if (window.SojournTrips) {
    window.SojournTrips.onChange(render);
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      if (window.SojournTrips) window.SojournTrips.onChange(render);
    });
  }

  render();
  window.SojournYear = { render: render };
})();
