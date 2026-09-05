/**
 * Sojourn Plan — the AI-first conversational trip builder.
 *
 * Everything here is namespaced under window.SojournPlan and mounts into
 * #plan-root. It is intentionally independent of the legacy "My Trips"
 * dashboard (sojourn-trips.js) — they share only the design tokens in CSS.
 *
 * Architecture, per the product spec:
 *   - TravelAIService: an interface. MockTravelAIService implements it now
 *     with rule-based parsing + a curated destination dataset. A future
 *     RealTravelAIService (calling a secure backend, never a client-side
 *     API key) can replace it without the UI changing — every call site
 *     below goes through `AI.<method>()`, never a hardcoded response.
 *   - VoiceService: wraps the browser's SpeechRecognition API behind a
 *     provider-agnostic start/stop/cancel interface.
 *   - ImageService: resolves a destination id to a local curated image.
 *     Swappable for a real image API later.
 *
 * DEMO MODE: every AI response in this file is generated locally by
 * MockTravelAIService — rule-based matching against a small curated
 * dataset, not a real model. The UI carries a persistent "Sojourn Demo"
 * badge so this is never presented as genuine AI understanding.
 */
(function () {
  "use strict";

  // ==========================================================================
  // DATA MODEL
  // ==========================================================================

  function createTravelPreferences(partial) {
    return Object.assign({
      travellers: null,
      tripType: null,        // "romantic" | "family" | "solo" | "friends"
      budget: null,
      budgetCurrency: "AUD",
      destination: null,
      duration: null,        // nights
      interests: [],         // e.g. ["food","beach","culture"]
      travelStyle: [],       // e.g. ["romantic","slow travel","foodie"]
      pace: null,            // "slow" | "balanced" | "active"
      accommodationStyle: null,
      rawText: ""
    }, partial);
  }

  function createTrip(partial) {
    return Object.assign({
      id: "trip-" + Date.now().toString(36),
      title: "",
      destination: "",
      country: "",
      startDate: null,
      endDate: null,
      travellers: 2,
      currency: "AUD",
      budget: null,
      estimatedCost: 0,
      travelStyle: [],
      summary: "",
      destinations: [],
      days: [],
      flights: [],
      accommodations: [],
      activities: [],
      restaurants: [],
      transport: [],
      changeLog: []
    }, partial);
  }

  function createTripDay(partial) {
    return Object.assign({
      date: null,
      dayNumber: 1,
      location: "",
      summary: "",
      activities: [],
      meals: [],
      transport: [],
      estimatedCost: 0
    }, partial);
  }

  function createActivity(partial) {
    return Object.assign({
      id: "act-" + Math.random().toString(36).slice(2, 9),
      time: "",
      icon: "•",
      title: "",
      location: "",
      duration: "",
      price: 0,
      notes: "",
      locked: false
    }, partial);
  }

  // ==========================================================================
  // CURATED DEMO DESTINATION DATASET
  // ==========================================================================
  // Real, licensed photography (see ATTRIBUTIONS.md). Everything else here
  // (budgets, itinerary templates) is illustrative demo content, not a
  // verified quote — the persistent Demo Mode badge in the UI says so.

  var DESTINATIONS = [
    {
      id: "amalfi-coast",
      emoji: "🇮🇹",
      name: "Amalfi Coast",
      country: "Italy",
      aliases: ["amalfi", "positano", "sorrento", "capri", "naples", "ravello"],
      image: "assets/images/amalfi-coast.jpg",
      tags: ["romantic", "food", "beach", "slow", "luxury", "culture", "coastal"],
      blurb: "Cliffside towns, lemon groves, and some of the most romantic coastline in Europe.",
      poetic: "Slow mornings, long lunches and impossibly blue water.",
      matchLabel: "Romantic · Food · Beach · Slow",
      dayRate: { low: 180, mid: 320, high: 550 } // AUD per person per day, illustrative
    },
    {
      id: "santorini",
      emoji: "🇬🇷",
      name: "Greek Islands",
      country: "Greece",
      aliases: ["santorini", "mykonos", "oia", "cyclades", "greek islands"],
      image: "assets/images/santorini.jpg",
      tags: ["romantic", "beach", "relaxed", "luxury", "coastal", "food"],
      blurb: "Whitewashed villages over the caldera, long lunches, and the best sunsets in the Aegean.",
      poetic: "Whitewashed cliffs, blue domes and the best sunset on the map.",
      matchLabel: "Beach · Relaxed · Beautiful",
      dayRate: { low: 150, mid: 280, high: 480 }
    },
    {
      id: "algarve-portugal",
      emoji: "🇵🇹",
      name: "Portugal",
      country: "Portugal",
      aliases: ["algarve", "lisbon", "porto", "lagos", "faro"],
      image: "assets/images/algarve-portugal.jpg",
      tags: ["food", "culture", "beach", "value", "coastal", "relaxed"],
      blurb: "Golden cliffs, incredible seafood, and Europe's best value for what you get.",
      poetic: "Golden cliffs, grilled sardines, and a coastline that never gets old.",
      matchLabel: "Food · Culture · Beach · Value",
      dayRate: { low: 100, mid: 200, high: 350 }
    },
    {
      id: "kyoto",
      emoji: "🇯🇵",
      name: "Kyoto & Kansai",
      country: "Japan",
      aliases: ["kyoto", "osaka", "tokyo", "kansai", "japan", "nara"],
      image: "assets/images/kyoto.jpg",
      tags: ["culture", "food", "slow", "local", "history", "luxury"],
      blurb: "Temples, ryokans, and a food scene that rewards slowing down.",
      poetic: "Quiet temples, lantern-lit streets, and food worth slowing down for.",
      matchLabel: "Culture · Food · Traditional",
      dayRate: { low: 140, mid: 260, high: 480 }
    },
    {
      id: "bali",
      emoji: "🇮🇩",
      name: "Bali",
      country: "Indonesia",
      aliases: ["bali", "ubud", "seminyak", "canggu", "uluwatu"],
      image: "assets/images/bali.jpg",
      tags: ["beach", "adventure", "value", "relaxed", "nature", "romantic"],
      blurb: "Rice terraces, surf, and villas that stretch a modest budget a long way.",
      poetic: "Rice terraces, warm water, and villas that stretch every dollar.",
      matchLabel: "Beach · Adventure · Value",
      dayRate: { low: 70, mid: 150, high: 300 }
    }
  ];

  // Shared fuzzy match so any part of the app (My Trips cards, My Year,
  // Plan) can resolve a free-text destination label to curated imagery
  // without re-implementing this — matches on name, country, or city alias.
  function matchDestination(text) {
    if (!text) return null;
    var lower = String(text).toLowerCase();
    var hit = DESTINATIONS.filter(function (d) {
      if (lower.indexOf(d.name.toLowerCase()) > -1) return true;
      if (lower.indexOf(d.country.toLowerCase()) > -1) return true;
      return (d.aliases || []).some(function (a) { return lower.indexOf(a) > -1; });
    })[0];
    return hit || null;
  }

  // Reusable activity templates per interest tag — combined into a day plan
  var ACTIVITY_BANK = {
    romantic: [
      { time: "19:00", icon: "🍝", title: "Candlelit dinner, chef's table", duration: "2h", price: 140 },
      { time: "18:00", icon: "🌅", title: "Sunset viewpoint, just the two of you", duration: "1h", price: 0 }
    ],
    food: [
      { time: "11:30", icon: "🍋", title: "Local lunch, family-run trattoria", duration: "1.5h", price: 55 },
      { time: "10:00", icon: "🥐", title: "Market + cooking class", duration: "3h", price: 120 }
    ],
    beach: [
      { time: "13:00", icon: "🏖️", title: "Beach club, loungers included", duration: "3h", price: 40 },
      { time: "09:00", icon: "🚤", title: "Boat trip along the coast", duration: "4h", price: 180 }
    ],
    culture: [
      { time: "10:00", icon: "🏛️", title: "Old town walking tour", duration: "2h", price: 45 },
      { time: "15:00", icon: "🏛️", title: "Historic landmark visit", duration: "1.5h", price: 20 }
    ],
    slow: [
      { time: "09:00", icon: "🌅", title: "Scenic morning, no agenda", duration: "2h", price: 0 },
      { time: "17:30", icon: "☕", title: "Café, watch the town go by", duration: "1h", price: 15 }
    ],
    adventure: [
      { time: "08:00", icon: "🥾", title: "Guided hike / trek", duration: "4h", price: 90 },
      { time: "14:00", icon: "🚴", title: "Bike or scooter exploring", duration: "3h", price: 45 }
    ]
  };

  // ==========================================================================
  // IMAGE SERVICE
  // ==========================================================================

  var ImageService = {
    getDestinationImage: function (destId) {
      var d = DESTINATIONS.filter(function (x) { return x.id === destId; })[0];
      return d ? d.image : null;
    }
  };

  // ==========================================================================
  // VOICE SERVICE — provider-agnostic wrapper around browser speech recognition
  // ==========================================================================

  function createVoiceService() {
    var Ctor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    var recognition = null;
    var listeners = { transcript: [], state: [] };
    var currentState = "idle"; // idle | listening | processing | success | error
    var lastError = null;

    function setState(s) {
      currentState = s;
      listeners.state.forEach(function (fn) { fn(s); });
    }
    function emitTranscript(text, isFinal) {
      listeners.transcript.forEach(function (fn) { fn(text, isFinal); });
    }

    return {
      isSupported: function () { return !!Ctor; },
      getState: function () { return currentState; },
      getLastError: function () { return lastError; },
      onTranscript: function (fn) { listeners.transcript.push(fn); },
      onStateChange: function (fn) { listeners.state.push(fn); },
      startListening: function () {
        if (!Ctor) { lastError = "unsupported"; setState("error"); return; }
        try {
          recognition = new Ctor();
          recognition.lang = navigator.language || "en-US";
          recognition.continuous = true;
          recognition.interimResults = true;
          var finalText = "";
          recognition.onresult = function (event) {
            var interim = "";
            for (var i = event.resultIndex; i < event.results.length; i++) {
              var chunk = event.results[i][0].transcript;
              if (event.results[i].isFinal) finalText += chunk + " ";
              else interim += chunk;
            }
            emitTranscript((finalText + interim).trim(), false);
          };
          recognition.onerror = function (event) {
            lastError = event.error;
            setState("error");
          };
          recognition.onend = function () {
            if (currentState === "listening") setState("processing");
          };
          recognition.start();
          lastError = null;
          setState("listening");
        } catch (e) {
          lastError = "start_failed";
          setState("error");
        }
      },
      stopListening: function () {
        if (recognition) { try { recognition.stop(); } catch (e) {} }
      },
      cancelListening: function () {
        if (recognition) { try { recognition.abort(); } catch (e) {} }
        setState("idle");
      }
    };
  }

  // ==========================================================================
  // TRAVEL AI SERVICE — interface + Mock implementation
  // ==========================================================================
  // A RealTravelAIService would implement the exact same method names,
  // calling a secure backend instead of the local heuristics below. No UI
  // code should ever need to change when that swap happens.

  var INTEREST_KEYWORDS = {
    food: ["food", "eat", "restaurant", "cuisine", "wine", "dining"],
    beach: ["beach", "coast", "sea", "island", "swim"],
    culture: ["culture", "history", "museum", "temple", "art", "old town"],
    romantic: ["romantic", "honeymoon", "anniversary", "husband", "wife", "partner"],
    adventure: ["adventure", "hike", "hiking", "trek", "active", "explore"],
    luxury: ["luxury", "5 star", "high end", "boutique hotel"],
    value: ["budget", "cheap", "affordable", "value"],
    relaxed: ["relax", "slow", "chill", "rest", "no rush"],
    nature: ["nature", "mountain", "forest", "outdoors"]
  };

  function parseTravelRequest(text) {
    var lower = " " + text.toLowerCase() + " ";
    var prefs = createTravelPreferences({ rawText: text });

    // travellers
    if (/\b(my (husband|wife|partner|boyfriend|girlfriend)|just the two of us|me and my)\b/.test(lower)) {
      prefs.travellers = 2;
      prefs.tripType = "romantic";
    }
    var travellerNum = lower.match(/\bfor (\d+)\s*(people|travellers|travelers|of us)\b/);
    if (travellerNum) prefs.travellers = parseInt(travellerNum[1], 10);
    if (/\bsolo\b|\bby myself\b|\bon my own\b/.test(lower)) { prefs.travellers = 1; prefs.tripType = "solo"; }
    if (/\bfamily\b|\bkids\b|\bchildren\b/.test(lower)) prefs.tripType = "family";
    if (!prefs.travellers) prefs.travellers = 2;

    // duration
    var dur = lower.match(/\b(\d{1,2})\s*[- ]?\s*(day|days|night|nights)\b/);
    if (dur) prefs.duration = parseInt(dur[1], 10);
    var week = lower.match(/\ba week\b/);
    if (!dur && week) prefs.duration = 7;

    // budget
    var budgetMatch = lower.match(/\$\s?([\d,]+)/) || lower.match(/\b([\d,]{3,6})\s*(aud|usd|dollars|bucks)\b/);
    if (budgetMatch) prefs.budget = parseInt(budgetMatch[1].replace(/,/g, ""), 10);
    if (/\bunder\b/.test(lower) === false && /\baround\b/.test(lower) && budgetMatch) {
      // "around $X" — keep as approximate, no special handling needed beyond the number itself
    }

    // pace
    if (/\bslow\b|\bno rush\b|\bdon.?t want to rush\b|\brelax/.test(lower)) prefs.pace = "slow";
    else if (/\badventure\b|\bexplore\b|\bactive\b|\bpacked\b/.test(lower)) prefs.pace = "active";
    else prefs.pace = "balanced";

    // interests
    Object.keys(INTEREST_KEYWORDS).forEach(function (tag) {
      var hit = INTEREST_KEYWORDS[tag].some(function (kw) { return lower.indexOf(kw) > -1; });
      if (hit && prefs.interests.indexOf(tag) === -1) prefs.interests.push(tag);
    });
    if (!prefs.interests.length) prefs.interests = ["culture", "food"]; // gentle default

    prefs.travelStyle = prefs.interests.slice(0, 3);
    if (prefs.pace === "slow") prefs.travelStyle.push("slow travel");

    // explicit destination region (very light touch — Europe/Asia/etc are not destinations themselves)
    var explicitDest = DESTINATIONS.filter(function (d) {
      return lower.indexOf(d.name.toLowerCase()) > -1 || lower.indexOf(d.country.toLowerCase()) > -1;
    })[0];
    if (explicitDest) prefs.destination = explicitDest.id;

    return prefs;
  }

  function scoreDestination(dest, prefs) {
    var score = 0;
    (prefs.interests || []).forEach(function (i) { if (dest.tags.indexOf(i) > -1) score += 2; });
    if (prefs.tripType === "romantic" && dest.tags.indexOf("romantic") > -1) score += 3;
    if (prefs.pace === "slow" && dest.tags.indexOf("slow") > -1) score += 2;
    if (prefs.pace === "active" && dest.tags.indexOf("adventure") > -1) score += 2;
    if (prefs.interests.indexOf("value") > -1 && dest.tags.indexOf("value") > -1) score += 2;
    if (prefs.interests.indexOf("luxury") > -1 && dest.tags.indexOf("luxury") > -1) score += 2;
    return score;
  }

  function suggestDestinations(prefs) {
    if (prefs.destination) {
      var picked = DESTINATIONS.filter(function (d) { return d.id === prefs.destination; });
      return picked.concat(DESTINATIONS.filter(function (d) { return d.id !== prefs.destination; }).slice(0, 2));
    }
    return DESTINATIONS
      .map(function (d) { return { dest: d, score: scoreDestination(d, prefs) }; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, 3)
      .map(function (x) { return x.dest; });
  }

  function whyItFits(dest, prefs) {
    var matched = (prefs.interests || []).filter(function (i) { return dest.tags.indexOf(i) > -1; });
    if (!matched.length) {
      return "A well-rounded match for a " + (prefs.pace || "balanced") + "-paced trip.";
    }
    var label = matched.slice(0, 3).join(", ");
    return "You mentioned " + label + " — " + dest.name + " covers that" +
      (dest.tags.indexOf("value") > -1 ? ", without the price tag of some of the other options." : ".");
  }

  function estimateBudget(dest, prefs) {
    var nights = prefs.duration || 7;
    var travellers = prefs.travellers || 2;
    var tier = "mid";
    if (prefs.interests && prefs.interests.indexOf("luxury") > -1) tier = "high";
    if (prefs.interests && prefs.interests.indexOf("value") > -1) tier = "low";
    var perDay = dest.dayRate[tier];
    return Math.round(perDay * nights * travellers / 10) * 10;
  }

  // `bases` — optional list of {name, note} neighbourhoods from deep
  // research (see travel-research.js). When present, nights are split
  // across them (e.g. 4 nights in Ubud, then the rest in Uluwatu) instead
  // of every day showing the same single destination name — this is what
  // makes the itinerary reflect research rather than a flat template.
  function buildItinerary(dest, prefs, bases) {
    var nights = Math.max(prefs.duration || 7, 3);
    var days = [];
    var styleTags = (prefs.travelStyle || []).filter(function (t) { return ACTIVITY_BANK[t]; });
    if (!styleTags.length) styleTags = ["culture", "food"];

    var useBases = (bases || []).length > 1 ? bases : null;
    var splitAt = useBases ? Math.ceil(nights / 2) : null;

    for (var i = 0; i < nights; i++) {
      var dayTag = styleTags[i % styleTags.length];
      var bank = ACTIVITY_BANK[dayTag] || ACTIVITY_BANK.culture;
      var activities = bank.map(function (a) { return createActivity(a); });
      // sprinkle in a food activity most days if not already the theme
      if (dayTag !== "food" && ACTIVITY_BANK.food[i % 2]) {
        activities.push(createActivity(ACTIVITY_BANK.food[i % 2]));
      }
      activities.sort(function (a, b) { return a.time.localeCompare(b.time); });
      var dayCost = activities.reduce(function (s, a) { return s + a.price; }, 0);
      var location = dest.name;
      var locationNote = "";
      if (useBases) {
        var base = i < splitAt ? useBases[0] : useBases[1];
        location = base.name;
        locationNote = base.note || "";
      }
      days.push(createTripDay({
        dayNumber: i + 1,
        location: location,
        locationNote: locationNote,
        summary: dayTag.charAt(0).toUpperCase() + dayTag.slice(1) + " day",
        activities: activities,
        estimatedCost: dayCost
      }));
    }
    return days;
  }

  // `deepResearch` — optional DestinationResearchResult-shaped object from
  // TravelResearchService.deepResearch(); when present its itineraryBases
  // shape the days above instead of a single flat location.
  function generateTrip(prefs, destId, deepResearch) {
    var dest = DESTINATIONS.filter(function (d) { return d.id === destId; })[0] || DESTINATIONS[0];
    var bases = deepResearch && deepResearch.itineraryBases;
    var days = buildItinerary(dest, prefs, bases);
    var activitiesCost = days.reduce(function (s, d) { return s + d.estimatedCost; }, 0);
    var estimatedCost = (deepResearch && deepResearch.budget && deepResearch.budget.estimatedTotal) || prefs.budget || estimateBudget(dest, prefs);

    return createTrip({
      title: dest.name + " — " + (prefs.travellers > 1 ? prefs.travellers + " travellers" : "solo trip"),
      destination: dest.name,
      country: dest.country,
      travellers: prefs.travellers || 2,
      currency: prefs.budgetCurrency || "AUD",
      budget: prefs.budget,
      estimatedCost: estimatedCost,
      travelStyle: prefs.travelStyle,
      summary: dest.blurb,
      destinations: bases ? bases.map(function (b) { return b.name; }) : [dest.name],
      days: days,
      activities: [].concat.apply([], days.map(function (d) { return d.activities; })),
      changeLog: []
    });
  }

  // "Make it more..." / "Change my trip" command handling.
  // Recognised commands actually mutate the trip object and return a
  // human-readable summary of what changed — never just prose.
  function modifyTrip(trip, request) {
    var lower = request.toLowerCase();
    var updated = JSON.parse(JSON.stringify(trip)); // deep clone, keep original intact for compare
    var message = "";
    var changes = []; // bullet-point list of concrete changes, not just prose
    var before = updated.estimatedCost;

    if (/romantic/.test(lower)) {
      if (updated.travelStyle.indexOf("romantic") === -1) updated.travelStyle.unshift("romantic");
      // swap first day's evening into a candlelit dinner if not already present
      var day = updated.days[0];
      if (day) {
        var hasRomanticDinner = day.activities.some(function (a) { return /candlelit/i.test(a.title); });
        if (!hasRomanticDinner) {
          day.activities.push(createActivity(Object.assign({}, ACTIVITY_BANK.romantic[0])));
          day.activities.sort(function (a, b) { return a.time.localeCompare(b.time); });
          day.estimatedCost += ACTIVITY_BANK.romantic[0].price;
          changes.push("Added a candlelit dinner on Day 1");
        }
      }
      updated.estimatedCost += ACTIVITY_BANK.romantic[0].price;
      changes.push("Leaned the whole trip more romantic");
      message = "Made it more romantic";
    } else if (/cheap|afford|save|budget/.test(lower)) {
      var reduction = Math.round(updated.estimatedCost * 0.14 / 10) * 10;
      updated.estimatedCost -= reduction;
      var trimmedDays = [];
      updated.days.forEach(function (d) {
        var before2 = d.activities.length;
        d.activities = d.activities.filter(function (a) { return a.price < 150; }); // drop the priciest splurge items
        if (d.activities.length < before2) trimmedDays.push(d.dayNumber);
        d.estimatedCost = d.activities.reduce(function (s, a) { return s + a.price; }, 0);
      });
      if (trimmedDays.length) changes.push("Trimmed the priciest optional activities on Day " + trimmedDays.join(", "));
      changes.push("Found about $" + reduction.toLocaleString() + " in savings — the core plan stays the same");
      message = "Made it more affordable";
    } else if (/beach/.test(lower)) {
      var d2 = updated.days[updated.days.length - 1];
      if (d2 && ACTIVITY_BANK.beach[0]) {
        d2.activities.push(createActivity(Object.assign({}, ACTIVITY_BANK.beach[0])));
        d2.estimatedCost += ACTIVITY_BANK.beach[0].price;
        updated.estimatedCost += ACTIVITY_BANK.beach[0].price;
        changes.push("Added a beach afternoon on Day " + d2.dayNumber);
      }
      message = "Added more beach time";
    } else if (/slow|relax/.test(lower)) {
      updated.travelStyle.unshift("slow travel");
      var reducedDays = [];
      updated.days.forEach(function (d) {
        if (d.activities.length > 3) reducedDays.push(d.dayNumber);
        d.activities = d.activities.slice(0, 3);
      });
      if (reducedDays.length) changes.push("Reduced the number of activities on Day " + reducedDays.join(", "));
      changes.push("Thinned every day to 3 activities max, so there's real time to slow down");
      message = "Slowed the pace down";
    } else if (/foodie|more food/.test(lower)) {
      var fday = updated.days[Math.floor(updated.days.length / 2)] || updated.days[0];
      if (fday && ACTIVITY_BANK.food[0]) {
        var alreadyFood = fday.activities.some(function (a) { return /trattoria|cooking class/i.test(a.title); });
        if (!alreadyFood) {
          fday.activities.push(createActivity(Object.assign({}, ACTIVITY_BANK.food[0])));
          fday.activities.sort(function (a, b) { return a.time.localeCompare(b.time); });
          fday.estimatedCost += ACTIVITY_BANK.food[0].price;
          updated.estimatedCost += ACTIVITY_BANK.food[0].price;
          changes.push("Added another food-forward stop on Day " + fday.dayNumber);
        }
      }
      if (updated.travelStyle.indexOf("food") === -1) updated.travelStyle.unshift("food");
      changes.push("This trip leans foodie now");
      message = "Made it more foodie";
    } else if (/luxur/.test(lower)) {
      var bump = Math.round(updated.estimatedCost * 0.18 / 10) * 10;
      updated.estimatedCost += bump;
      if (updated.travelStyle.indexOf("luxury") === -1) updated.travelStyle.unshift("luxury");
      changes.push("Upgraded stays and tables across the trip");
      changes.push("About $" + bump.toLocaleString() + " more, for noticeably nicer touches");
      message = "Upgraded it";
    } else {
      message = "I can currently act on: “more romantic”, “cheaper”, “add a beach”, or “slow it down” — try one of those, or use the chips below.";
      return { trip: trip, message: message, changes: [], changed: false, before: before, after: before };
    }

    updated.changeLog.push({ request: request, message: message, changes: changes, at: new Date().toISOString() });
    return { trip: updated, message: message, changes: changes, changed: true, before: before, after: updated.estimatedCost };
  }

  var MockTravelAIService = {
    parseTravelRequest: function (text) {
      return Promise.resolve(parseTravelRequest(text));
    },
    suggestDestinations: function (prefs) {
      return Promise.resolve(suggestDestinations(prefs).map(function (d) {
        return Object.assign({}, d, { whyItFits: whyItFits(d, prefs), estimatedBudget: estimateBudget(d, prefs) });
      }));
    },
    generateTrip: function (prefs, destId, deepResearch) {
      return Promise.resolve(generateTrip(prefs, destId, deepResearch));
    },
    modifyTrip: function (trip, request) {
      return Promise.resolve(modifyTrip(trip, request));
    }
  };

  // Expose for the UI module below, and for a future RealTravelAIService swap.
  var AI = MockTravelAIService;

  // ==========================================================================
  // Export data/services onto a namespace the UI half of this file uses.
  // ==========================================================================
  window.SojournPlan = window.SojournPlan || {};
  window.SojournPlan.DESTINATIONS = DESTINATIONS;
  window.SojournPlan.AI = AI;
  window.SojournPlan.ImageService = ImageService;
  window.SojournPlan.matchDestination = matchDestination;
  window.SojournPlan.createVoiceService = createVoiceService;
  window.SojournPlan.models = { createTravelPreferences: createTravelPreferences, createTrip: createTrip, createTripDay: createTripDay, createActivity: createActivity };
})();
