/**
 * Explore — the browsable Home/entry point. Sits alongside Plan (the
 * conversational builder) rather than duplicating it: picking a
 * destination here hands off to Plan's existing generateTrip() path via
 * window.SojournPlanUI.startWithDestination(), so there is exactly one
 * trip-generation flow, not two. Reuses the same curated destination
 * dataset as Plan — no new content, no new AI logic.
 */
(function () {
  "use strict";

  var root = document.getElementById("explore-root");
  if (!root) return;

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function render() {
    var P = window.SojournPlan;
    var destinations = P ? P.DESTINATIONS : [];
    root.innerHTML =
      '<section class="explore-hero">' +
        '<p class="eyebrow anim-rise">EXPLORE</p>' +
        '<h1 class="display-xl anim-rise stagger-1">Where next?</h1>' +
        '<p class="lead anim-rise stagger-2">Five places worth building a trip around — pick one, or tell Sojourn how you want to feel.</p>' +
      '</section>' +
      '<section class="explore-grid-wrap">' +
        '<div class="explore-grid">' + destinations.map(renderCard).join("") + '</div>' +
      '</section>' +
      '<section class="explore-cta anim-rise">' +
        '<p class="lead">Not sure yet?</p>' +
        '<button type="button" class="btn primary lg" data-action="tell-sojourn">Tell Sojourn how you want to feel →</button>' +
      '</section>';
    wire();
  }

  function renderCard(d, i) {
    return (
      '<div class="explore-card img-frame xl overlay-bottom img-cover anim-rise stagger-' + Math.min(i + 1, 6) + '" ' +
        'data-action="pick-destination" data-id="' + d.id + '" style="background-image:url(\'' + d.image + '\')">' +
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
    }
  }

  render();
  window.SojournExplore = { render: render };
})();
