/**
 * UI for the Sojourn Plan experience. Depends on window.SojournPlan
 * (sojourn-plan.js) for data/services. Mounts into #plan-root.
 */
(function () {
  "use strict";
  var P = window.SojournPlan;
  if (!P) { console.error("sojourn-plan.js must load before plan-ui.js"); return; }

  var root = document.getElementById("plan-root");
  if (!root) return;

  var voice = P.createVoiceService();

  var state = {
    view: "hero",              // hero | listening | understanding | confirm | destinations | generating | trip
    inputText: "",
    prefs: null,
    destinationOptions: [],
    selectedDest: null,
    trip: null,
    previousTrip: null,        // for "compare" after a modification
    lastChangeMessage: null,
    loadingLabel: "",
    modifyInput: "",
    errorMessage: null
  };

  var LOADING_STEPS = {
    understanding: ["Understanding your travel style…", "Reading between the lines…"],
    destinations: ["Finding the right destinations…", "Matching places to your vibe…"],
    generating: ["Matching hotels…", "Finding places you'll love…", "Putting the route together…"]
  };

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function money(n, currency) { return (currency || "AUD") + " " + Math.round(n).toLocaleString(); }

  // ---------------------------------------------------------------- render

  function render() {
    root.innerHTML = renderDemoBadge() + renderView();
    wire();
  }

  function renderDemoBadge() {
    return '<div class="demo-badge" title="Every suggestion here is generated locally by rule-based matching, not a real AI model — see the audit notes for why.">Sojourn Demo · suggestions are simulated, not live AI</div>';
  }

  function renderView() {
    switch (state.view) {
      case "hero": return renderHero();
      case "listening": return renderListening();
      case "understanding": return renderLoading("understanding");
      case "confirm": return renderConfirm();
      case "destinations": return renderDestinations();
      case "generating": return renderLoading("generating");
      case "trip": return renderTrip();
      default: return renderHero();
    }
  }

  function renderHero() {
    var chips = [
      { label: "✨ Surprise me", text: "Surprise me with somewhere beautiful, I'm flexible." },
      { label: "🏖️ I need a beach", text: "I need a beach trip, somewhere relaxed." },
      { label: "❤️ Romantic escape", text: "A romantic escape for two, beautiful hotels, great food." },
      { label: "🍜 Food trip", text: "A trip that's mostly about the food." },
      { label: "🏔️ Adventure", text: "Somewhere active — hiking, exploring, adventure." },
      { label: "💰 Budget getaway", text: "Somewhere beautiful that won't break the budget." }
    ];
    return (
      '<section class="hero">' +
        '<p class="hero-eyebrow">SOJOURN</p>' +
        '<h1 class="hero-title">Don’t plan your trip.<br>Tell Sojourn how you want to feel.</h1>' +
        '<p class="hero-sub">Describe your dream trip. Sojourn turns the conversation into a personalised itinerary.</p>' +
        (voice.isSupported() ?
          '<button class="mic-cta" data-action="start-voice" aria-label="Tell Sojourn your travel dream by voice">' +
            '<span class="mic-cta-icon">🎙️</span><span>Tell me your travel dream</span>' +
          '</button>' : "") +
        '<div class="hero-textrow">' +
          '<input type="text" id="hero-text" class="hero-text-input" placeholder="' + (voice.isSupported() ? "…or type it instead" : "Tell me about the trip you want") + '" value="' + escapeHtml(state.inputText) + '">' +
          '<button class="btn primary" data-action="submit-text">Go</button>' +
        '</div>' +
        '<div class="chip-row center">' +
          chips.map(function (c) { return '<button type="button" class="prompt-chip" data-action="use-chip" data-text="' + escapeHtml(c.text) + '">' + c.label + '</button>'; }).join("") +
        '</div>' +
        (state.errorMessage ? '<p class="hero-error">' + escapeHtml(state.errorMessage) + '</p>' : "") +
      '</section>'
    );
  }

  function renderListening() {
    var err = voice.getState() === "error";
    return (
      '<section class="hero listening-view">' +
        '<div class="mic-orb ' + (err ? "error" : "active") + '">🎙️</div>' +
        '<p class="listening-label">' + (err ? "I couldn’t quite hear that." : "Listening…") + '</p>' +
        '<div class="transcript-box" id="live-transcript">' + escapeHtml(state.inputText || "Say something like: “I want a romantic 10-day trip to Italy…”") + '</div>' +
        '<div class="panel-footer center">' +
          (err ?
            '<button class="btn" data-action="cancel-voice">Type instead</button><button class="btn primary" data-action="start-voice">Try again</button>' :
            '<button class="btn" data-action="cancel-voice">Cancel</button><button class="btn primary" data-action="finish-voice">Done — use this</button>'
          ) +
        '</div>' +
      '</section>'
    );
  }

  function renderLoading(kind) {
    if (!state.loadingLabel) state.loadingLabel = pick(LOADING_STEPS[kind]);
    return (
      '<section class="hero">' +
        '<div class="ai-loading"><div class="spinner-lg"></div><p>' + escapeHtml(state.loadingLabel) + '</p></div>' +
      '</section>'
    );
  }

  function renderConfirm() {
    var p = state.prefs;
    var summaryBits = [];
    if (p.travellers) summaryBits.push(p.travellers === 1 ? "solo" : p.travellers + " travellers");
    if (p.duration) summaryBits.push(p.duration + " days");
    if (p.budget) summaryBits.push("around " + money(p.budget, p.budgetCurrency));
    if (p.interests.length) summaryBits.push(p.interests.join(", "));

    return (
      '<section class="hero confirm-view">' +
        '<p class="ai-line">I think I’ve got most of it ' + (p.tripType === "romantic" ? "❤️" : "✨") + '</p>' +
        '<p class="ai-summary">' + escapeHtml(summaryBits.join(" · ") || "A trip, your way") + '</p>' +
        '<p class="ai-line small">One thing before I find some places — what’s the pace?</p>' +
        '<div class="chip-row center">' +
          '<button type="button" class="prompt-chip lg" data-action="set-pace" data-pace="slow">😌 Slow &amp; romantic</button>' +
          '<button type="button" class="prompt-chip lg" data-action="set-pace" data-pace="active">🗺️ Explore &amp; adventure</button>' +
        '</div>' +
      '</section>'
    );
  }

  function renderDestinations() {
    return (
      '<section class="destinations-view">' +
        '<p class="ai-line center">Your kind of trip</p>' +
        '<div class="dest-grid">' +
          state.destinationOptions.map(renderDestCard).join("") +
        '</div>' +
      '</section>'
    );
  }

  function renderDestCard(d) {
    return (
      '<div class="dest-card" data-action="pick-destination" data-id="' + d.id + '">' +
        '<div class="dest-card-img" style="background-image:url(\'' + d.image + '\')"></div>' +
        '<div class="dest-card-body">' +
          '<h3>' + d.emoji + ' ' + escapeHtml(d.name) + '</h3>' +
          '<p class="dest-match">' + escapeHtml(d.matchLabel) + '</p>' +
          '<p class="dest-blurb">' + escapeHtml(d.blurb) + '</p>' +
          '<p class="dest-why"><strong>Why this fits you —</strong> ' + escapeHtml(d.whyItFits) + '</p>' +
          '<div class="dest-budget">~' + money(d.estimatedBudget, "AUD") + ' <small>estimated, for your trip</small></div>' +
        '</div>' +
      '</div>'
    );
  }

  function renderTrip() {
    var t = state.trip;
    var currency = t.currency || "AUD";
    var total = t.estimatedCost;
    var breakdown = budgetBreakdown(t);

    var compareBlock = state.previousTrip ? (
      '<div class="compare-banner">' +
        '<span>' + escapeHtml(state.lastChangeMessage || "Trip updated.") + '</span>' +
        '<span class="compare-figures">' + money(state.previousTrip.estimatedCost, currency) + ' → <strong>' + money(t.estimatedCost, currency) + '</strong></span>' +
        '<button class="btn small ghost" data-action="undo-change">Undo</button>' +
      '</div>'
    ) : "";

    return (
      '<section class="trip-view">' +
        compareBlock +
        '<div class="trip-canvas">' +
          '<p class="trip-canvas-eyebrow">' + (P.DESTINATIONS.filter(function (d) { return d.name === t.destination; })[0] || {}).emoji + ' ' + escapeHtml(t.country || "").toUpperCase() + '</p>' +
          '<h2 class="trip-canvas-title">' + escapeHtml(t.destination) + '</h2>' +
          '<p class="trip-canvas-meta">' + t.days.length + ' days · ' + t.travellers + ' traveller(s)</p>' +
          '<div class="trip-canvas-budget">' + money(total, currency) + ' <small>estimated</small></div>' +
          '<div class="chip-row">' + t.travelStyle.map(function (s) { return '<span class="style-chip">' + escapeHtml(styleLabel(s)) + '</span>'; }).join("") + '</div>' +
        '</div>' +

        '<div class="trip-section">' +
          '<h3>Itinerary</h3>' +
          '<div class="itinerary">' + t.days.map(renderDay).join("") + '</div>' +
        '</div>' +

        '<div class="trip-section">' +
          '<h3>Budget</h3>' +
          '<div class="budget-breakdown">' +
            breakdown.map(function (b) {
              return '<div class="budget-row"><span>' + b.icon + ' ' + b.label + '</span><span>' + money(b.amount, currency) + '</span></div>';
            }).join("") +
            '<div class="budget-row total"><span>Total</span><span>' + money(total, currency) + '</span></div>' +
          '</div>' +
        '</div>' +

        '<div class="trip-section modify-section">' +
          '<h3>Change my trip</h3>' +
          '<p class="ai-line small">Tell Sojourn what to change — it’ll actually update the plan above.</p>' +
          '<div class="chip-row">' +
            ["Make it more romantic", "Make it cheaper", "Add a beach", "Slow it down"].map(function (c) {
              return '<button type="button" class="prompt-chip" data-action="quick-modify" data-text="' + c + '">' + c + '</button>';
            }).join("") +
          '</div>' +
          '<div class="hero-textrow">' +
            '<input type="text" id="modify-text" class="hero-text-input" placeholder="e.g. add one more day, find a nicer restaurant…" value="' + escapeHtml(state.modifyInput) + '">' +
            '<button class="btn primary" data-action="submit-modify">Apply</button>' +
          '</div>' +
        '</div>' +

        '<div class="trip-section">' +
          '<button class="btn primary" data-action="save-to-trips">Save to My Trips</button>' +
          '<button class="btn ghost" data-action="start-over">Start a different trip</button>' +
        '</div>' +
      '</section>'
    );
  }

  function styleLabel(s) {
    var labels = { romantic: "❤️ Romantic", food: "🍜 Foodie", beach: "🏖️ Beach", culture: "🎨 Culture", "slow travel": "😌 Slow travel", adventure: "🗺️ Adventure", luxury: "✨ Luxury", value: "💰 Value", relaxed: "😌 Relaxed", nature: "🌿 Nature" };
    return labels[s] || s;
  }

  function renderDay(day) {
    return (
      '<div class="itin-day">' +
        '<div class="itin-day-head">DAY ' + day.dayNumber + ' — ' + escapeHtml(day.location.toUpperCase()) + '</div>' +
        day.activities.map(function (a) {
          return '<div class="itin-activity"><span class="itin-time">' + a.time + '</span><span class="itin-icon">' + a.icon + '</span><span class="itin-title">' + escapeHtml(a.title) + '</span>' +
            (a.price ? '<span class="itin-price">$' + a.price + '</span>' : '<span class="itin-price free">free</span>') + '</div>';
        }).join("") +
      '</div>'
    );
  }

  function budgetBreakdown(trip) {
    var total = trip.estimatedCost;
    var activitiesCost = trip.days.reduce(function (s, d) { return s + d.estimatedCost; }, 0);
    var remaining = Math.max(total - activitiesCost, 0);
    return [
      { icon: "✈️", label: "Flights", amount: Math.round(remaining * 0.32) },
      { icon: "🏨", label: "Hotels", amount: Math.round(remaining * 0.40) },
      { icon: "🍝", label: "Food", amount: Math.round(activitiesCost * 0.4) },
      { icon: "🎟️", label: "Activities", amount: Math.round(activitiesCost * 0.6) },
      { icon: "🚆", label: "Transport", amount: Math.round(remaining * 0.18) },
      { icon: "🛍️", label: "Flexible", amount: Math.round(remaining * 0.10) }
    ];
  }

  // ---------------------------------------------------------------- flow

  function submitDescription(text) {
    text = (text || "").trim();
    if (!text) return;
    state.inputText = text;
    state.view = "understanding";
    state.loadingLabel = "";
    render();
    P.AI.parseTravelRequest(text).then(function (prefs) {
      setTimeout(function () {
        state.prefs = prefs;
        state.view = "confirm";
        render();
      }, 550); // brief, deliberate pause — this is a simulated "thinking" beat, not a real model call
    });
  }

  function confirmPace(pace) {
    state.prefs.pace = pace;
    if (pace === "slow" && state.prefs.travelStyle.indexOf("slow travel") === -1) state.prefs.travelStyle.push("slow travel");
    if (pace === "active" && state.prefs.travelStyle.indexOf("adventure") === -1) state.prefs.travelStyle.push("adventure");
    state.view = "destinations";
    state.loadingLabel = "";
    render();
    P.AI.suggestDestinations(state.prefs).then(function (options) {
      state.destinationOptions = options;
      render();
    });
  }

  function pickDestination(id) {
    state.selectedDest = id;
    state.view = "generating";
    state.loadingLabel = "";
    render();
    P.AI.generateTrip(state.prefs, id).then(function (trip) {
      setTimeout(function () {
        state.trip = trip;
        state.previousTrip = null;
        state.lastChangeMessage = null;
        state.view = "trip";
        render();
      }, 700);
    });
  }

  function applyModification(text) {
    text = (text || "").trim();
    if (!text || !state.trip) return;
    P.AI.modifyTrip(state.trip, text).then(function (result) {
      if (result.changed) {
        state.previousTrip = state.trip;
        state.trip = result.trip;
      }
      state.lastChangeMessage = result.message;
      state.modifyInput = "";
      render();
    });
  }

  // ---------------------------------------------------------------- events

  function wire() {
    root.querySelectorAll("[data-action]").forEach(function (el) {
      el.addEventListener("click", handleClick);
    });
    var heroText = document.getElementById("hero-text");
    if (heroText) {
      heroText.addEventListener("keydown", function (e) { if (e.key === "Enter") submitDescription(heroText.value); });
    }
    var modifyText = document.getElementById("modify-text");
    if (modifyText) {
      modifyText.addEventListener("keydown", function (e) { if (e.key === "Enter") applyModification(modifyText.value); });
    }
  }

  voice.onTranscript(function (text) {
    state.inputText = text;
    var box = document.getElementById("live-transcript");
    if (box) box.textContent = text; // direct DOM update — avoid a full re-render mid-dictation
  });
  voice.onStateChange(function (s) {
    if (s === "error" || s === "listening") render();
  });

  function handleClick(e) {
    var action = e.currentTarget.getAttribute("data-action");
    switch (action) {
      case "start-voice":
        state.view = "listening";
        state.inputText = "";
        render();
        voice.startListening();
        break;
      case "cancel-voice":
        voice.cancelListening();
        state.view = "hero";
        render();
        break;
      case "finish-voice":
        voice.stopListening();
        submitDescription(state.inputText);
        break;
      case "submit-text":
        submitDescription(document.getElementById("hero-text").value);
        break;
      case "use-chip":
        submitDescription(e.currentTarget.getAttribute("data-text"));
        break;
      case "set-pace":
        confirmPace(e.currentTarget.getAttribute("data-pace"));
        break;
      case "pick-destination":
        pickDestination(e.currentTarget.getAttribute("data-id"));
        break;
      case "quick-modify":
        applyModification(e.currentTarget.getAttribute("data-text"));
        break;
      case "submit-modify":
        applyModification(document.getElementById("modify-text").value);
        break;
      case "undo-change":
        state.trip = state.previousTrip;
        state.previousTrip = null;
        state.lastChangeMessage = null;
        render();
        break;
      case "save-to-trips":
        if (window.SojournTrips && window.SojournTrips.importFromPlan) {
          window.SojournTrips.importFromPlan(state.trip, state.prefs);
          if (window.SojournNav) window.SojournNav.switchTo("trips");
        }
        break;
      case "start-over":
        state = { view: "hero", inputText: "", prefs: null, destinationOptions: [], selectedDest: null, trip: null, previousTrip: null, lastChangeMessage: null, loadingLabel: "", modifyInput: "", errorMessage: null };
        render();
        break;
    }
  }

  render();
  window.SojournPlanUI = {
    render: render,
    getState: function () { return state; },
    // Entry point for other modules (e.g. My Year's "Plan my year" CTA) to
    // jump straight into the conversational flow with a starting prompt,
    // reusing this same TravelAIService path rather than a separate one.
    startWithText: function (text) {
      state = { view: "hero", inputText: "", prefs: null, destinationOptions: [], selectedDest: null, trip: null, previousTrip: null, lastChangeMessage: null, loadingLabel: "", modifyInput: "", errorMessage: null };
      submitDescription(text);
    },
    resetToHero: function () {
      state = { view: "hero", inputText: "", prefs: null, destinationOptions: [], selectedDest: null, trip: null, previousTrip: null, lastChangeMessage: null, loadingLabel: "", modifyInput: "", errorMessage: null };
      render();
    }
  };
})();
