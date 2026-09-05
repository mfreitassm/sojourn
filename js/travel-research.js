/**
 * TravelResearchService — Sojourn's research orchestration layer.
 *
 * Architecture (per the "Real Travel Intelligence" spec):
 *   TravelAIService (plan-ui.js's pipeline)
 *         -> TravelResearchService (this file)
 *               -> research providers (MockResearchProvider today)
 *         -> structured evidence
 *   No agents. No agent-to-agent calls. A future LiveResearchProvider
 *   (backed by a real backend + search API) can be dropped in behind the
 *   exact same interface without touching the pipeline or UI.
 *
 * DEMO MODE INTEGRITY: MockResearchProvider's "evidence" is hand-curated,
 * generally-true reference knowledge about these 5 real destinations
 * (seasonal climate, rough flight times, typical costs) — not fabricated
 * per-request, and never presented with invented source URLs. Its
 * `sources` arrays are always empty; the UI says "Demo Mode — no live
 * sources" rather than pretending anything was fetched from the web.
 */
(function () {
  "use strict";

  // ==========================================================================
  // CURATED SEASONAL REFERENCE DATA — the 5 existing Explore/Plan destinations
  // ==========================================================================
  // Season windows use each destination's own real climate pattern (temperate
  // 4-season vs. tropical wet/dry) rather than forcing one calendar model on
  // every place. Subscores are 0-100, editorial judgment (basis: "inference"),
  // not measurements — labelled as such wherever shown.

  var RESEARCH_DATA = {
    "amalfi-coast": {
      neighbourhoods: [
        { name: "Positano", note: "Cliffside, iconic, the most romantic base — also the busiest and priciest." },
        { name: "Ravello", note: "Quiet hilltop town, gardens and views, a short drive from the coast road." },
        { name: "Amalfi Town", note: "Central and walkable, good ferry connections to Capri and Positano." }
      ],
      seasons: {
        winter: { months: [11, 0, 1], weatherScore: 42, summary: "Cold and wet by coastal-Italy standards — many hotels close for the season." },
        spring: { months: [2, 3, 4], weatherScore: 76, summary: "Mild, green and blooming, before the summer crowds arrive." },
        summer: { months: [5, 6, 7], weatherScore: 80, summary: "Hot, dry and at its busiest — book well ahead." },
        autumn: { months: [8, 9, 10], weatherScore: 74, summary: "Warm sea, thinner crowds — a favourite window for locals." }
      },
      crowdBase: 55,
      dailyCost: { low: 180, mid: 320, high: 550 },
      flightHoursFromAU: 24,
      subscores: { romance: 90, beach: 62, food: 85, culture: 72, relaxation: 68 },
      highlights: ["Cliffside towns and lemon groves", "Boat-hopping between Positano, Amalfi and Capri", "Some of the most photographed coastline in Europe"],
      drawbacks: ["Beaches are mostly pebble, not soft sand", "Summer traffic on the one coast road can be brutal"]
    },
    santorini: {
      neighbourhoods: [
        { name: "Oia", note: "The famous sunset view — small, romantic, very busy at golden hour." },
        { name: "Imerovigli", note: "Same caldera views as Oia with noticeably fewer crowds." },
        { name: "Kamari", note: "Black-sand beach town, more relaxed and better value." }
      ],
      seasons: {
        winter: { months: [11, 0, 1], weatherScore: 45, summary: "Quiet and cool — many businesses close, ferries can be unreliable." },
        spring: { months: [2, 3, 4], weatherScore: 78, summary: "Warming up fast, wildflowers out, well before peak crowds." },
        summer: { months: [5, 6, 7], weatherScore: 82, summary: "Hot, dry, and extremely busy — the famous sunset spots get crowded." },
        autumn: { months: [8, 9, 10], weatherScore: 79, summary: "Warm sea and softer light, noticeably calmer than summer." }
      },
      crowdBase: 68,
      dailyCost: { low: 150, mid: 280, high: 480 },
      flightHoursFromAU: 25,
      subscores: { romance: 92, beach: 55, food: 78, culture: 55, relaxation: 72 },
      highlights: ["Whitewashed villages over the caldera", "The Aegean's best-known sunsets", "Excellent wine on volcanic soil"],
      drawbacks: ["Beaches are volcanic black sand, not classic tropical sand", "Oia's sunset viewpoints get genuinely crowded in season"]
    },
    "algarve-portugal": {
      neighbourhoods: [
        { name: "Lagos", note: "Dramatic cliffs and grottoes, lively old town, good for a base." },
        { name: "Praia da Marinha area", note: "The Algarve's most photographed beach, quieter fishing villages nearby." },
        { name: "Faro", note: "Main airport town, good jumping-off point, less touristy itself." }
      ],
      seasons: {
        winter: { months: [11, 0, 1], weatherScore: 60, summary: "Mild for Europe, occasional rain, very quiet — good value season." },
        spring: { months: [2, 3, 4], weatherScore: 80, summary: "Warm and green, wildflowers on the cliffs, before the summer rush." },
        summer: { months: [5, 6, 7], weatherScore: 83, summary: "Hot, dry, and the busiest months — peak pricing on the coast." },
        autumn: { months: [8, 9, 10], weatherScore: 81, summary: "Still warm enough to swim, meaningfully quieter than summer." }
      },
      crowdBase: 48,
      dailyCost: { low: 100, mid: 200, high: 350 },
      flightHoursFromAU: 26,
      subscores: { romance: 68, beach: 88, food: 82, culture: 60, relaxation: 76 },
      highlights: ["Golden cliffs and grotto beaches", "Excellent, inexpensive seafood", "The best value-for-money coastline in Western Europe"],
      drawbacks: ["Some of the best beaches are only reachable by boat or a steep path", "Peak summer brings large crowds to the famous viewpoints"]
    },
    kyoto: {
      neighbourhoods: [
        { name: "Gion / Higashiyama", note: "Traditional streets and temples, the postcard Kyoto — busy with day-trippers." },
        { name: "Arashiyama", note: "Bamboo grove and river, quieter in early morning, further from the centre." },
        { name: "Central Kyoto Station area", note: "Practical base with the best rail connections onward to Osaka/Nara." }
      ],
      seasons: {
        winter: { months: [11, 0, 1], weatherScore: 58, summary: "Cold and often crisp/clear, thin crowds, occasional snow on temples." },
        spring: { months: [2, 3, 4], weatherScore: 88, summary: "Cherry blossom season — beautiful, but the single busiest window of the year." },
        summer: { months: [5, 6, 7], weatherScore: 48, summary: "Hot and very humid, with a rainy season in June." },
        autumn: { months: [8, 9, 10], weatherScore: 84, summary: "Comfortable temperatures and autumn foliage — the other peak season." }
      },
      crowdBase: 60,
      dailyCost: { low: 140, mid: 260, high: 480 },
      flightHoursFromAU: 10,
      subscores: { romance: 65, beach: 15, food: 90, culture: 95, relaxation: 62 },
      highlights: ["Centuries of temples and gardens within a walkable city", "One of the world's great food cities", "Genuinely excellent rail access to the rest of Kansai"],
      drawbacks: ["No beach culture to speak of — a city-and-culture trip, not a coastal one", "Cherry blossom and autumn-leaf weeks are extremely crowded and pricier"]
    },
    bali: {
      neighbourhoods: [
        { name: "Ubud", note: "Rice terraces, wellness, and culture — inland, no beach at your doorstep." },
        { name: "Uluwatu", note: "Dramatic clifftop coast, surf, quieter beach clubs." },
        { name: "Seminyak", note: "Polished beach town, best restaurants and nightlife, busiest of the three." }
      ],
      seasons: {
        dry: { months: [3, 4, 5, 6, 7, 8, 9], weatherScore: 85, summary: "The dry season — sunny, lower humidity, the most reliable weather window." },
        wet: { months: [10, 11, 0, 1, 2], weatherScore: 62, summary: "Wet season — hot and humid with regular afternoon downpours; still warm enough to swim." }
      },
      crowdBase: 58,
      dailyCost: { low: 70, mid: 150, high: 300 },
      flightHoursFromAU: 4,
      subscores: { romance: 74, beach: 80, food: 68, culture: 62, relaxation: 85 },
      highlights: ["Closest genuinely tropical escape from Australia", "Rice terraces, surf and beach clubs all within a couple of hours of each other", "Villas and spas that stretch a modest budget a long way"],
      drawbacks: ["Traffic between areas (e.g. Ubud to Uluwatu) can take much longer than the map suggests", "Seminyak/Canggu are increasingly built-up, not a quiet escape"]
    }
  };

  function seasonFor(destId, month) {
    var data = RESEARCH_DATA[destId];
    if (!data) return null;
    var keys = Object.keys(data.seasons);
    for (var i = 0; i < keys.length; i++) {
      if (data.seasons[keys[i]].months.indexOf(month) > -1) return Object.assign({ key: keys[i] }, data.seasons[keys[i]]);
    }
    return Object.assign({ key: keys[0] }, data.seasons[keys[0]]);
  }

  function monthFromProfile(profile) {
    if (profile && profile.dates && profile.dates.start) {
      var m = parseInt(String(profile.dates.start).slice(5, 7), 10) - 1;
      if (m >= 0 && m <= 11) return m;
    }
    // No explicit date — research against the coming month, a reasonable
    // default for "when would this actually be good" rather than "today".
    var d = new Date();
    return (d.getMonth() + 1) % 12;
  }

  function budgetTier(profile) {
    var interests = (profile && profile.interests) || [];
    if (interests.indexOf("luxury") > -1) return "high";
    if (interests.indexOf("value") > -1) return "low";
    return "mid";
  }

  var evId = 0;
  function evidence(claim, value, basis, confidence) {
    evId++;
    return { id: "ev" + evId, claim: claim, value: value, basis: basis, confidence: confidence, sourceIds: [] };
  }

  // ==========================================================================
  // MockResearchProvider — Demo Mode implementation of TravelResearchService
  // ==========================================================================

  function researchDestination(destId, profile) {
    var data = RESEARCH_DATA[destId];
    var P = window.SojournPlan;
    var dest = P.DESTINATIONS.filter(function (d) { return d.id === destId; })[0];
    if (!data || !dest) return Promise.reject({ code: "unknown_destination" });

    var month = monthFromProfile(profile);
    var season = seasonFor(destId, month);
    var tier = budgetTier(profile);
    var nights = (profile && profile.duration) || 7;
    var travellers = (profile && profile.travellers) || 2;
    var estimatedDailyCost = data.dailyCost[tier];
    var estimatedTotal = Math.round((estimatedDailyCost * nights * travellers) / 10) * 10;

    var ev = [
      evidence("Season fit", season.summary, "fact", "high"),
      evidence("Typical daily cost (" + tier + " tier)", "~AUD " + estimatedDailyCost + " per person/day", "estimate", "medium"),
      evidence("Approx. flight time from Australia", "~" + data.flightHoursFromAU + "h, illustrative — varies by route and stops", "estimate", "low"),
      evidence("Character", data.highlights[0], "inference", "medium")
    ];

    var result = {
      destinationId: destId,
      destination: dest.name,
      country: dest.country,
      image: dest.image,
      emoji: dest.emoji,
      weather: { score: season.weatherScore, summary: season.summary, seasonKey: season.key },
      budget: {
        score: null, // filled in by the scoring layer, which knows the user's budget
        estimatedDailyCost: estimatedDailyCost,
        estimatedTotal: estimatedTotal,
        tier: tier
      },
      romance: data.subscores.romance,
      beach: data.subscores.beach,
      food: data.subscores.food,
      culture: data.subscores.culture,
      relaxation: data.subscores.relaxation,
      logistics: {
        flightHours: data.flightHoursFromAU,
        flightSummary: "~" + data.flightHoursFromAU + "h from Australia (illustrative)"
      },
      crowdLevel: Math.min(100, data.crowdBase + (season.key === "summer" || season.key === "dry" ? 15 : 0)),
      neighbourhoods: data.neighbourhoods,
      highlights: data.highlights,
      drawbacks: data.drawbacks,
      evidence: ev,
      sources: [] // Demo Mode: never fabricate citations — see file header
    };
    return Promise.resolve(result);
  }

  function researchAllCandidates(candidateIds, profile) {
    return Promise.all(candidateIds.map(function (id) { return researchDestination(id, profile); }));
  }

  // Deep research after the user selects a destination — richer detail
  // used to shape the itinerary (which neighbourhoods to split time
  // between), not just to rank candidates.
  function deepResearch(destId, profile) {
    return researchDestination(destId, profile).then(function (base) {
      var nights = (profile && profile.duration) || 7;
      // Longer stays get split across two real neighbourhoods; short
      // stays stay single-base — mirrors how an actual planner would work.
      var splitBases = nights >= 6 ? base.neighbourhoods.slice(0, 2) : base.neighbourhoods.slice(0, 1);
      return Object.assign({}, base, { itineraryBases: splitBases });
    });
  }

  // ==========================================================================
  // Simple in-memory cache — destination + month + budget tier is the key.
  // Deliberately not overengineered: a Map with a TTL, cleared on reload.
  // ==========================================================================
  var CACHE_TTL_MS = 10 * 60 * 1000;
  var cache = new Map();
  function cacheKey(destId, profile) {
    return [destId, monthFromProfile(profile), budgetTier(profile), (profile && profile.duration) || 7, (profile && profile.travellers) || 2].join("|");
  }
  function cachedResearch(destId, profile) {
    var key = cacheKey(destId, profile);
    var hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return Promise.resolve(hit.value);
    return researchDestination(destId, profile).then(function (result) {
      cache.set(key, { value: result, at: Date.now() });
      return result;
    });
  }

  var MockResearchProvider = {
    mode: "demo",
    researchDestination: cachedResearch,
    researchAllCandidates: function (ids, profile) { return Promise.all(ids.map(function (id) { return cachedResearch(id, profile); })); },
    deepResearch: deepResearch
  };

  // ==========================================================================
  // LiveResearchProvider — calls the Sojourn Research API (backend/worker.js).
  // Never falls back to mock data internally on failure: every method
  // rejects with a clear {code, message} so plan-ui.js can show the
  // explicit "Live research isn't available right now" state (§20) rather
  // than silently serving Demo Mode content under a "LIVE" label.
  // ==========================================================================

  var MONTH_NAMES_FULL = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  function extractMonthWord(text) {
    if (!text) return undefined;
    var lower = String(text).toLowerCase();
    for (var i = 0; i < MONTH_NAMES_FULL.length; i++) {
      if (lower.indexOf(MONTH_NAMES_FULL[i]) > -1) return MONTH_NAMES_FULL[i].charAt(0).toUpperCase() + MONTH_NAMES_FULL[i].slice(1);
    }
    return undefined;
  }

  function shapeProfileForBackend(profile) {
    profile = profile || {};
    var homeCity;
    try { homeCity = window.SojournTrips && window.SojournTrips.getProfile && window.SojournTrips.getProfile().homeCity; } catch (e) { homeCity = undefined; }
    var out = {
      travellers: profile.travellers || undefined,
      duration: profile.duration || undefined,
      month: extractMonthWord(profile.rawText),
      interests: profile.interests || [],
      pace: (profile.pace === "active" ? "active" : profile.pace === "slow" ? "slow" : "balanced"),
      origin: homeCity || undefined,
      rawText: (profile.rawText || "").slice(0, 2000)
    };
    if (profile.budget) out.budget = { amount: profile.budget, currency: profile.budgetCurrency || "AUD" };
    return out;
  }

  function liveFetch(path, body) {
    var base = window.SojournConfig && window.SojournConfig.apiBaseUrl;
    if (!base) return Promise.reject({ code: "not_configured", message: "Live Mode has no backend URL configured." });
    return fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (errBody) {
          return Promise.reject({ code: errBody.error || "backend_error", status: res.status, message: errBody.message });
        });
      }
      return res.json();
    }, function () {
      return Promise.reject({ code: "network_error", message: "Couldn't reach the research backend." });
    });
  }

  function liveResearchOne(path, destId, profile) {
    var P = window.SojournPlan;
    var dest = P.DESTINATIONS.filter(function (d) { return d.id === destId; })[0];
    if (!dest) return Promise.reject({ code: "unknown_destination" });
    var body = { destination: dest.name, country: dest.country, travelProfile: shapeProfileForBackend(profile) };
    return liveFetch(path, body).then(function (result) {
      return Object.assign({}, result, { destinationId: destId, image: dest.image, emoji: dest.emoji });
    });
  }

  var LiveResearchProvider = {
    mode: "live",
    researchDestination: function (destId, profile) { return liveResearchOne("/api/research/destination", destId, profile); },
    researchAllCandidates: function (ids, profile) {
      // Fail-fast, deliberately: if live research is genuinely broken it's
      // broken for all candidates, and a partially-mock result set under a
      // "LIVE" label would be exactly the silent fallback §20 forbids.
      return Promise.all(ids.map(function (id) { return liveResearchOne("/api/research/destination", id, profile); }));
    },
    deepResearch: function (destId, profile) { return liveResearchOne("/api/research/deep", destId, profile); }
  };

  // The integration boundary: swapping Demo/Live means reassigning this one
  // property. Chosen at boot from window.SojournConfig (js/sojourn-config.js,
  // loaded first) — nothing else in the app needs to know which is active.
  var selectedProvider = (window.SojournConfig && window.SojournConfig.researchMode === "live") ? LiveResearchProvider : MockResearchProvider;

  window.SojournResearch = {
    provider: selectedProvider,
    isLive: function () { return window.SojournResearch.provider.mode === "live"; },
    researchDestination: function (destId, profile) { return window.SojournResearch.provider.researchDestination(destId, profile); },
    researchAllCandidates: function (ids, profile) { return window.SojournResearch.provider.researchAllCandidates(ids, profile); },
    deepResearch: function (destId, profile) { return window.SojournResearch.provider.deepResearch(destId, profile); }
  };
  // Exposed so the UI's explicit "Use Demo Mode" fallback (after a Live
  // Mode failure) can switch providers deliberately — never silently.
  window.SojournResearchDemoProvider = MockResearchProvider;
})();
