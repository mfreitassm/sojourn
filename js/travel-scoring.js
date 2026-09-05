/**
 * Deterministic destination scoring — explicitly NOT left to the LLM.
 * "The LLM is the brain. Research tools are its eyes. The application
 * controls the data, scoring, state and UX."
 *
 * computeWeights() adapts category weights to what the user actually said
 * (explicit budget emphasis, explicit disinterest in sightseeing, etc.),
 * then scoreDestination() applies those weights to a researched
 * DestinationResearchResult to produce a transparent, explainable score.
 */
(function () {
  "use strict";

  var BASE_WEIGHTS = {
    weather: 15, beach: 15, food: 15, romance: 10,
    culture: 10, relaxation: 10, budget: 15, travelTime: 5, paceFit: 5
  };

  function computeWeights(profile) {
    var w = Object.assign({}, BASE_WEIGHTS);
    var text = ((profile && profile.rawText) || "").toLowerCase();
    var interests = (profile && profile.interests) || [];

    if (/budget is (really |very |extremely )?important|as cheap as possible|don.?t want to spend more than|budget.conscious|save money/.test(text)) {
      w.budget *= 1.8;
    }
    if (interests.indexOf("beach") === -1) w.beach *= 0.25;
    if (interests.indexOf("food") === -1) w.food *= 0.6;
    if (interests.indexOf("culture") === -1) w.culture *= 0.35;
    if (/don.?t care about sightseeing|not interested in (museums|culture|sightseeing)/.test(text)) w.culture = 0;
    if (profile && profile.tripType === "romantic") w.romance *= 1.6;
    if (profile && profile.pace === "slow") { w.relaxation *= 1.7; }
    if (profile && profile.pace === "active") { w.relaxation *= 0.6; }

    // Renormalise to sum to 100 so contributions stay easy to read.
    var total = Object.keys(w).reduce(function (s, k) { return s + w[k]; }, 0);
    Object.keys(w).forEach(function (k) { w[k] = Math.round((w[k] / total) * 1000) / 10; });
    return w;
  }

  function budgetScore(research, profile) {
    var userBudget = profile && profile.budget;
    if (!userBudget) return 68; // no stated ceiling — neutral, not penalised
    var ratio = research.budget.estimatedTotal / userBudget;
    if (ratio <= 0.7) return 96;
    if (ratio <= 0.9) return 85;
    if (ratio <= 1.0) return 70;
    if (ratio <= 1.15) return 45;
    return 20;
  }

  function travelTimeScore(research) {
    var h = research.logistics.flightHours;
    if (h <= 5) return 92;
    if (h <= 11) return 75;
    if (h <= 18) return 55;
    return 40;
  }

  function paceFitScore(research, profile) {
    var pace = profile && profile.pace;
    if (!pace || pace === "balanced") return 75;
    if (pace === "slow") return research.relaxation;
    // "active" pace fits lower-crowd-tolerance, higher-culture/adventure destinations loosely —
    // approximate with an inverse of relaxation, since this dataset has no direct "activity density" field.
    return Math.max(30, 100 - research.relaxation * 0.4);
  }

  function scoreDestination(research, profile, weights) {
    var w = weights || computeWeights(profile);
    var raw = {
      weather: research.weather.score,
      beach: research.beach,
      food: research.food,
      romance: research.romance,
      culture: research.culture,
      relaxation: research.relaxation,
      budget: budgetScore(research, profile),
      travelTime: travelTimeScore(research),
      paceFit: paceFitScore(research, profile)
    };

    var categoryScores = Object.keys(w).map(function (cat) {
      var score = raw[cat];
      var weight = w[cat];
      return { category: cat, score: Math.round(score), weight: weight, contribution: Math.round((score * weight) / 100 * 10) / 10 };
    });

    var overall = Math.round(categoryScores.reduce(function (s, c) { return s + c.contribution; }, 0));

    var sorted = categoryScores.slice().sort(function (a, b) { return b.contribution - a.contribution; });
    var strengths = sorted.filter(function (c) { return c.weight > 1 && c.score >= 70; }).slice(0, 2).map(function (c) { return c.category; });
    var weaknesses = sorted.filter(function (c) { return c.weight > 1 && c.score < 55; }).slice(-2).map(function (c) { return c.category; });

    return { overall: overall, categoryScores: categoryScores, strengths: strengths, weaknesses: weaknesses };
  }

  var LABEL_CATEGORY = {
    "BEST VALUE": "budget",
    "BEST FOR BEACHES": "beach",
    "MOST ROMANTIC": "romance",
    "BEST FOR FOOD": "food",
    "BEST FOR CULTURE": "culture"
  };

  // Ranks a researched+scored candidate set and assigns non-redundant
  // labels — BEST OVERALL always goes to the top score; other labels go
  // to whichever remaining candidate actually wins that category, so a
  // label is never handed out just to fill a slot.
  function rankAndLabel(researchedList, profile) {
    var weights = computeWeights(profile);
    var scored = researchedList.map(function (research) {
      return { research: research, score: scoreDestination(research, profile, weights) };
    }).sort(function (a, b) { return b.score.overall - a.score.overall; });

    var labelled = scored.map(function (item, i) { return Object.assign({ label: i === 0 ? "BEST OVERALL" : null }, item); });
    var used = { 0: true };

    Object.keys(LABEL_CATEGORY).forEach(function (label) {
      var cat = LABEL_CATEGORY[label];
      var best = null, bestVal = -1, bestIdx = -1;
      labelled.forEach(function (item, i) {
        if (used[i]) return;
        var catScore = item.score.categoryScores.filter(function (c) { return c.category === cat; })[0];
        if (catScore && catScore.score > bestVal) { bestVal = catScore.score; best = item; bestIdx = i; }
      });
      if (best && bestVal >= 65) { best.label = label; used[bestIdx] = true; }
    });

    return { weights: weights, ranked: labelled };
  }

  window.SojournScoring = { computeWeights: computeWeights, scoreDestination: scoreDestination, rankAndLabel: rankAndLabel };
})();
