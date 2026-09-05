/**
 * Explore — the browsable Home/entry point. Sits alongside Plan (the
 * conversational builder) rather than duplicating it: picking a
 * destination here hands off to Plan's existing generateTrip() path via
 * window.SojournPlanUI.startWithDestination(), so there is exactly one
 * trip-generation flow, not two. Reuses the same curated destination
 * dataset (and its existing `tags`) as Plan — no new content, no new AI.
 */
(function () {
  "use strict";

  var root = document.getElementById("explore-root");
  if (!root) return;

  // Vibe filters map onto the destination dataset's existing tags — no new
  // content, just a curated lens on what's already there. Deliberately not
  // evenly sized: an honest reflection of a small curated set, not padded.
  var VIBES = [
    { key: "all", label: "All" },
    { key: "slow", label: "Slow Living", tag: "slow" },
    { key: "coastal", label: "Coastal Escape", tags: ["beach", "coastal"] },
    { key: "food", label: "Gastronomy", tag: "food" },
    { key: "energy", label: "High Energy", tag: "adventure" }
  ];

  // Deterministic 6-unit column-span layout per visible count, so 5 items
  // (or any filtered subset) always reads as a balanced editorial mosaic
  // instead of an uneven trailing row. Featured item (index 0) leads.
  var SPAN_LAYOUTS = {
    1: [6],
    2: [3, 3],
    3: [2, 2, 2],
    4: [3, 3, 3, 3],
    5: [4, 2, 2, 2, 2]
  };

  var state = { vibe: "all" };

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function matchesVibe(d, vibeKey) {
    if (vibeKey === "all") return true;
    var vibe = VIBES.filter(function (v) { return v.key === vibeKey; })[0];
    if (!vibe) return true;
    var wanted = vibe.tags || [vibe.tag];
    return wanted.some(function (t) { return d.tags.indexOf(t) > -1; });
  }

  function spansFor(n) {
    if (SPAN_LAYOUTS[n]) return SPAN_LAYOUTS[n];
    var out = []; for (var i = 0; i < n; i++) out.push(2); // graceful fallback beyond the curated 5
    return out;
  }

  function render() {
    var P = window.SojournPlan;
    var all = P ? P.DESTINATIONS : [];
    var visible = all.filter(function (d) { return matchesVibe(d, state.vibe); });
    var spans = spansFor(visible.length);

    root.innerHTML =
      '<section class="explore-hero">' +
        '<p class="eyebrow anim-rise">EXPLORE</p>' +
        '<h1 class="display-xl anim-rise stagger-1">Where next?</h1>' +
        '<p class="lead anim-rise stagger-2">Five places worth building a trip around — pick one, or tell Sojourn how you want to feel.</p>' +
      '</section>' +
      '<div class="explore-vibes anim-rise stagger-3">' +
        VIBES.map(function (v) {
          return '<button type="button" class="vibe-pill' + (state.vibe === v.key ? " on" : "") + '" data-action="set-vibe" data-vibe="' + v.key + '">' + v.label + '</button>';
        }).join("") +
      '</div>' +
      '<section class="explore-grid-wrap">' +
        (visible.length
          ? '<div class="explore-grid">' + visible.map(function (d, i) { return renderCard(d, i, spans[i]); }).join("") + '</div>'
          : '<p class="explore-empty">Nothing quite matches that vibe yet — try another, or tell Sojourn directly.</p>') +
      '</section>' +
      '<section class="explore-cta anim-rise">' +
        '<p class="lead">Not sure yet?</p>' +
        '<button type="button" class="btn primary lg" data-action="tell-sojourn">Tell Sojourn how you want to feel →</button>' +
      '</section>';
    wire();
  }

  function renderCard(d, i, span) {
    return (
      '<div class="explore-card img-frame xl overlay-bottom img-cover anim-rise stagger-' + Math.min(i + 1, 6) + '" ' +
        'data-action="pick-destination" data-id="' + d.id + '" style="background-image:url(\'' + d.image + '\'); grid-column: span ' + span + '">' +
        '<div class="explore-card-caption">' +
          '<p class="eyebrow on-image">' + d.emoji + ' ' + escapeHtml(d.country.toUpperCase()) + '</p>' +
          '<h3 class="display-lg" style="color:#fff;">' + escapeHtml(d.name) + '</h3>' +
          '<p class="lead on-image explore-card-blurb">' + escapeHtml(d.poetic || d.blurb) + '</p>' +
        '</div>' +
      '</div>'
    );
  }

  function wire() {
    root.querySelectorAll("[data-action]").forEach(function (el) {
      el.addEventListener("click", handleClick);
    });
  }

  function handleClick(e) {
    var action = e.currentTarget.getAttribute("data-action");
    if (action === "pick-destination") {
      var id = e.currentTarget.getAttribute("data-id");
      if (window.SojournPlanUI) window.SojournPlanUI.startWithDestination(id);
      if (window.SojournNav) window.SojournNav.switchTo("plan");
    } else if (action === "tell-sojourn") {
      if (window.SojournPlanUI) window.SojournPlanUI.resetToHero();
      if (window.SojournNav) window.SojournNav.switchTo("plan");
    } else if (action === "set-vibe") {
      state.vibe = e.currentTarget.getAttribute("data-vibe");
      render();
    }
  }

  render();
  window.SojournExplore = { render: render };
})();
