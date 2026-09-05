/**
 * LLMProvider abstraction.
 *
 * Sojourn has no backend, so a real third-party LLM API key can never live
 * here (see the security boundary discussed throughout this project). But
 * there is one genuine, keyless path to real inference: claude.use("sample"),
 * available when this page runs inside a claude.ai Artifact. When present,
 * it's a real LLM call with structured JSON output — not a mock. When
 * absent (e.g. the GitHub Pages deployment), everything falls back to the
 * deterministic templates that already work today. The rest of the app
 * never needs to know which path ran.
 */
(function () {
  "use strict";

  var sampleFn = null;
  var checked = false;

  function ensureChecked() {
    if (checked) return;
    checked = true;
    if (window.claude && window.claude.use) {
      window.claude.use("sample").then(function (fn) { sampleFn = fn || null; }).catch(function () { sampleFn = null; });
    }
  }
  ensureChecked();

  function isLive() { return !!sampleFn; }

  // Structured, validated call — mirrors the "no free-form parsing" rule.
  // `validate(obj)` returns true/false; on any failure this rejects rather
  // than returning a malformed shape for the caller to trip over.
  function generateStructured(prompt, validate) {
    if (!sampleFn) return Promise.reject({ code: "not_available" });
    return sampleFn.json(prompt, { modelTier: "quick", cache: false }).then(function (data) {
      if (!data || typeof data !== "object" || (validate && !validate(data))) {
        return Promise.reject({ code: "invalid_shape" });
      }
      return data;
    });
  }

  // "Why this fits you" — genuinely LLM-written when live, reasoned over
  // the SAME evidence/score the deterministic template uses (never invents
  // new claims), so Live and Demo Mode never contradict each other.
  function explainMatch(research, score, profile) {
    var fallback = deterministicExplanation(research, score, profile);
    if (!sampleFn) return Promise.resolve(fallback);

    var top = score.categoryScores.slice().sort(function (a, b) { return b.contribution - a.contribution; }).slice(0, 3);
    var prompt =
      "A traveller described their trip as: \"" + (profile.rawText || "") + "\"\n" +
      "We researched " + research.destination + ", " + research.country + " and scored it against their stated preferences. " +
      "Top-contributing factors: " + top.map(function (c) { return c.category + " (score " + c.score + "/100)"; }).join(", ") + ".\n" +
      "Known drawbacks: " + research.drawbacks.join("; ") + ".\n\n" +
      "Reply with only a JSON object: {\"why\": string (1-2 sentences, warm and specific, second person, referencing what they actually said), " +
      "\"tradeoff\": string (one honest sentence, must be grounded in the known drawbacks above, do not invent a new one)}";

    return generateStructured(prompt, function (d) { return typeof d.why === "string" && typeof d.tradeoff === "string"; })
      .then(function (d) { return d; })
      .catch(function () { return fallback; });
  }

  function deterministicExplanation(research, score, profile) {
    var top = score.categoryScores.slice().sort(function (a, b) { return b.contribution - a.contribution; }).slice(0, 2);
    var labels = { weather: "the weather", beach: "the beaches", food: "the food", romance: "how romantic it is",
      culture: "the culture", relaxation: "how relaxed it is", budget: "staying on budget", travelTime: "the travel time", paceFit: "the pace" };
    var bits = top.map(function (c) { return labels[c.category] || c.category; });
    var why = "You're after " + bits.join(" and ") + " — " + research.destination + " is a strong match on both.";
    var tradeoff = research.drawbacks[0] || "No major trade-offs found for this trip.";
    return { why: why, tradeoff: tradeoff };
  }

  window.SojournLLM = {
    isLive: isLive,
    explainMatch: explainMatch
  };
})();
