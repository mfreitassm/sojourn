/**
 * Runtime configuration — the one place that knows whether research is
 * Demo or Live, and where the backend lives. Never put secrets here; this
 * file is served as a plain static asset on GitHub Pages, fully public.
 *
 * To enable Live Mode after deploying backend/worker.js (see its README):
 *   researchMode: "live",
 *   apiBaseUrl: "https://sojourn-research-api.<you>.workers.dev"
 *
 * For quick testing without editing this file, both values can be
 * overridden via URL query params, e.g.:
 *   ?researchMode=live&apiBaseUrl=http://localhost:8787
 * The override never persists anywhere (no localStorage, no cookie) — it's
 * just for this page load, so a shared link can't silently flip a
 * visitor's mode.
 */
(function () {
  "use strict";

  var config = {
    researchMode: "demo", // "demo" | "live"
    apiBaseUrl: ""
  };

  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get("researchMode") === "live" || params.get("researchMode") === "demo") {
      config.researchMode = params.get("researchMode");
    }
    if (params.get("apiBaseUrl")) {
      config.apiBaseUrl = params.get("apiBaseUrl");
    }
  } catch (e) { /* malformed query string — keep the static defaults above */ }

  window.SojournConfig = config;
})();
