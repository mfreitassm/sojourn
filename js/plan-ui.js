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

  var HERO_IMAGE = "assets/images/amalfi-coast.jpg";

  function freshState() {
    return {
      view: "hero",              // hero | listening | understanding | confirm | destinations | generating | trip
      inputText: "",
      prefs: null,
      destinationOptions: [],
      destinationIndex: 0,
      selectedDest: null,
      trip: null,
      previousTrip: null,        // for "compare" after a modification
      lastChangeMessage: null,
      loadingLabel: "",
      modifyInput: "",
      errorMessage: null
    };
  }

  var state = freshState();

  // Views before a destination is chosen share one immersive full-bleed
  // photo backdrop — the conversation happens "inside" the journey, not
  // against a flat dashboard background.
  var IMMERSIVE_VIEWS = ["hero", "listening", "understanding", "confirm"];

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
    var immersive = IMMERSIVE_VIEWS.indexOf(state.view) > -1;
    root.innerHTML = renderDemoBadge() + (immersive ? renderImmersiveShell() : renderView());
    wire();
  }

  function renderDemoBadge() {
    return '<div class="demo-badge" title="Every suggestion here is generated locally by rule-based matching, not a real AI model — see the audit notes for why.">Sojourn Demo · suggestions are simulated, not live AI</div>';
  }

  function renderImmersiveShell() {
    return (
      '<div class="photo-shell img-cover" style="background-image:url(\'' + HERO_IMAGE + '\')">' +
        '<div class="photo-shell-overlay"></div>' +
        '<div class="photo-shell-inner">' + renderView() + '</div>' +
      '</div>'
    );
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
        '<p class="eyebrow on-image anim-rise">SOJOURN</p>' +
        '<h1 class="display-xl on-image anim-rise stagger-1">Don’t plan your trip.<br>Tell me how you want to feel.</h1>' +
        '<p class="lead on-image anim-rise stagger-2">Describe your dream trip. Sojourn turns the feeling into a journey.</p>' +
        '<div class="mic-stage anim-scale stagger-2">' +
          (voice.isSupported() ?
            '<button class="mic-orb-cta" data-action="start-voice" aria-label="Tell Sojourn your travel dream by voice">' +
              '<span class="mic-orb-ring"></span><span class="mic-orb-icon">🎙️</span>' +
            '</button><p class="mic-stage-label">Tell Sojourn</p>' : ""
          ) +
        '</div>' +
        '<div class="conversation-input anim-rise stagger-3">' +
          '<input type="text" id="hero-text" class="conversation-input-field" placeholder="' + (voice.isSupported() ? "…or type how you want to feel" : "Tell me about the trip you want") + '" value="' + escapeHtml(state.inputText) + '">' +
          '<button class="btn primary" data-action="submit-text">Go</button>' +
        '</div>' +
        '<div class="chip-row center anim-rise stagger-4">' +
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
        '<div class="mic-orb-cta lg ' + (err ? "error" : "active") + '"><span class="mic-orb-ring"></span><span class="mic-orb-icon">🎙️</span></div>' +
        '<p class="listening-label on-image">' + (err ? "I couldn’t quite hear that." : "Listening…") + '</p>' +
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
    var onImage = IMMERSIVE_VIEWS.indexOf(state.view) > -1;
    return (
      '<section class="hero">' +
        '<div class="ai-loading anim-fade"><div class="spinner-lg' + (onImage ? " on-image" : "") + '"></div><p class="' + (onImage ? "on-image" : "") + '">' + escapeHtml(state.loadingLabel) + '</p></div>' +
      '</section>'
    );
  }

  function renderConfirm() {
    var p = state.prefs;
    var chips = buildPrefChips(p);
    return (
      '<section class="hero confirm-view">' +
        '<p class="eyebrow on-image anim-rise">I heard…</p>' +
        '<div class="pref-chip-row">' +
          chips.map(function (c, i) { return '<span class="pref-chip anim-pop stagger-' + Math.min(i + 1, 6) + '">' + c + '</span>'; }).join("") +
        '</div>' +
        '<p class="display-md on-image center anim-rise stagger-4">I think I know your kind of trip.</p>' +
        '<p class="lead on-image center anim-rise stagger-5">One more thing — what’s the pace?</p>' +
        '<div class="mood-row center anim-rise stagger-6">' +
          '<button type="button" class="mood-chip lg" data-action="set-pace" data-pace="slow">😌 Slow &amp; romantic</button>' +
          '<button type="button" class="mood-chip lg" data-action="set-pace" data-pace="active">🗺️ Explore &amp; adventure</button>' +
        '</div>' +
      '</section>'
    );
  }

  // Turns parsed preferences into the small set of visual chips the
  // conversation "extracts" — this replaces a plain text summary line.
  function buildPrefChips(p) {
    var chips = [];
    var seenTags = {};
    if (p.tripType === "romantic" && p.interests.indexOf("romantic") === -1) {
      chips.push(styleLabel("romantic")); seenTags.romantic = true;
    }
    if (p.tripType === "family") chips.push("👨‍👩‍👧 Family trip");
    (p.interests || []).forEach(function (tag) {
      if (seenTags[tag]) return;
      seenTags[tag] = true;
      chips.push(styleLabel(tag));
    });
    if (p.pace === "slow") chips.push("😌 Slow pace");
    else if (p.pace === "active") chips.push("🗺️ Active pace");
    if (p.travellers === 1) chips.push("👤 Solo trip");
    else if (p.travellers) chips.push("👫 " + p.travellers + " travellers");
    if (p.budget) chips.push("💵 ~" + money(p.budget, p.budgetCurrency));
    return chips;
  }

  function renderDestinations() {
    if (!state.destinationOptions.length) {
      return '<section class="hero"><p class="display-md on-image center anim-fade">I think I found your kind of place.</p></section>';
    }
    var d = state.destinationOptions[state.destinationIndex];
    return renderDestinationReveal(d);
  }

  function renderDestinationReveal(d) {
    var p = state.prefs || {};
    var matchedTags = (p.interests || []).filter(function (t) { return d.tags.indexOf(t) > -1; }).slice(0, 4);
    var moreLeft = state.destinationOptions.length > 1;
    return (
      '<section class="destinations-view">' +
        '<div class="dest-reveal-media img-frame xl overlay-full img-cover anim-scale" style="background-image:url(\'' + d.image + '\')">' +
          '<div class="dest-reveal-caption">' +
            '<p class="eyebrow on-image">' + d.emoji + ' ' + escapeHtml(d.country.toUpperCase()) + '</p>' +
            '<h2 class="display-xl" style="color:#fff;">' + escapeHtml(d.name) + '</h2>' +
          '</div>' +
        '</div>' +
        '<p class="dest-reveal-poetic anim-rise stagger-1">' + escapeHtml(d.poetic || d.blurb) + '</p>' +
        '<div class="mood-row center anim-rise stagger-2">' +
          (matchedTags.length ? matchedTags.map(function (t) { return '<span class="mood-chip static">' + styleLabel(t) + '</span>'; }).join("") : '<span class="mood-chip static">' + styleLabel("culture") + '</span>') +
        '</div>' +
        '<p class="dest-reveal-meta anim-rise stagger-2">' + (p.duration || 7) + ' days · ~' + money(d.estimatedBudget, "AUD") + '</p>' +
        '<div class="dest-reveal-actions anim-rise stagger-3">' +
          '<button class="btn primary lg" data-action="pick-destination" data-id="' + d.id + '">This feels like me →</button>' +
          (moreLeft ? '<button class="btn ghost" data-action="show-another">Show me another</button>' : "") +
        '</div>' +
      '</section>'
    );
  }

  function renderTrip() {
    var t = state.trip;
    var currency = t.currency || "AUD";
    var total = t.estimatedCost;
    var breakdown = budgetBreakdown(t);
    var destMeta = P.DESTINATIONS.filter(function (d) { return d.name === t.destination; })[0] || {};

    var compareBlock = state.previousTrip ? (
      '<div class="compare-banner anim-rise">' +
        '<span>' + escapeHtml(state.lastChangeMessage || "Trip updated.") + '</span>' +
        '<span class="compare-figures">' + money(state.previousTrip.estimatedCost, currency) + ' → <strong>' + money(t.estimatedCost, currency) + '</strong></span>' +
        '<button class="btn small ghost" data-action="undo-change">Undo</button>' +
      '</div>'
    ) : "";

    return (
      '<section class="trip-view">' +
        compareBlock +
        '<div class="trip-hero img-frame xl overlay-full img-cover anim-scale" style="' + (destMeta.image ? "background-image:url('" + destMeta.image + "')" : "") + '">' +
          '<div class="trip-hero-caption">' +
            '<p class="eyebrow on-image">' + (destMeta.emoji || "") + ' ' + escapeHtml(t.country || "").toUpperCase() + '</p>' +
            '<h1 class="display-xl" style="color:#fff;">' + escapeHtml(t.destination) + '</h1>' +
            '<p class="lead on-image">' + t.days.length + ' days · ' + t.travellers + ' traveller(s)</p>' +
            '<div class="mood-row">' + t.travelStyle.map(function (s) { return '<span class="mood-chip static on-image">' + styleLabel(s) + '</span>'; }).join("") + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="trip-budget-line anim-rise stagger-1"><span class="trip-budget-figure">' + money(total, currency) + '</span><span class="trip-budget-label">estimated total</span></div>' +

        '<div class="trip-section">' +
          '<p class="eyebrow">Your journey</p>' +
          '<div class="itinerary">' + t.days.map(renderDay).join("") + '</div>' +
        '</div>' +

        '<div class="trip-section">' +
          '<p class="eyebrow">Budget</p>' +
          '<div class="budget-breakdown">' +
            breakdown.map(function (b) {
              var pct = total ? Math.max(2, Math.round((b.amount / total) * 100)) : 0;
              return '<div class="budget-row"><div class="budget-row-head"><span>' + b.icon + ' ' + b.label + '</span><span>' + money(b.amount, currency) + '</span></div><div class="budget-row-bar"><div style="width:' + pct + '%"></div></div></div>';
            }).join("") +
            '<div class="budget-row total"><span>Total</span><span>' + money(total, currency) + '</span></div>' +
          '</div>' +
        '</div>' +

        '<div class="trip-section modify-section">' +
          '<p class="eyebrow">Make it more…</p>' +
          '<p class="lead">Tell Sojourn what to change — it’ll actually update the plan above.</p>' +
          '<div class="mood-row">' +
            [["❤️ More romantic", "Make it more romantic"], ["💰 More affordable", "Make it cheaper"], ["🏖️ More beachy", "Add a beach"], ["😌 More relaxing", "Slow it down"], ["🍝 More foodie", "Make it more foodie"], ["✨ More luxurious", "Make it more luxurious"]].map(function (c) {
              return '<button type="button" class="mood-chip" data-action="quick-modify" data-text="' + c[1] + '">' + c[0] + '</button>';
            }).join("") +
          '</div>' +
          '<div class="conversation-input">' +
            '<input type="text" id="modify-text" class="conversation-input-field" placeholder="e.g. add one more day, find a nicer restaurant…" value="' + escapeHtml(state.modifyInput) + '">' +
            '<button class="btn primary" data-action="submit-modify">Apply</button>' +
          '</div>' +
        '</div>' +

        '<div class="trip-section trip-final-actions">' +
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

  var DAY_NARRATIVE = {
    food: "A day built around the table.",
    culture: "Wandering, slowly.",
    beach: "Sun, salt water, repeat.",
    slow: "Wake up slowly.",
    adventure: "Out and moving.",
    romantic: "Just the two of you."
  };

  function renderDay(day, index) {
    var tag = (day.summary || "").replace(/ day$/i, "").toLowerCase();
    var narrative = DAY_NARRATIVE[tag] || day.summary;
    var dayNum = String(day.dayNumber).length < 2 ? "0" + day.dayNumber : String(day.dayNumber);
    var photo = index === 0 ? (P.DESTINATIONS.filter(function (d) { return d.name === state.trip.destination; })[0] || {}).image : null;
    return (
      '<div class="itin-day anim-rise">' +
        (photo ? '<div class="itin-day-photo img-frame img-cover" style="background-image:url(\'' + photo + '\')"></div>' : "") +
        '<div class="itin-day-eyebrow">DAY ' + dayNum + '</div>' +
        '<h3 class="itin-day-loc">' + escapeHtml(day.location) + '</h3>' +
        (narrative ? '<p class="itin-day-narrative">' + escapeHtml(narrative) + '</p>' : "") +
        '<div class="itin-timeline">' +
          day.activities.map(function (a) {
            return '<div class="itin-activity"><span class="itin-time">' + a.time + '</span><span class="itin-dot"></span>' +
              '<span class="itin-title">' + a.icon + ' ' + escapeHtml(a.title) + '</span>' +
              (a.price ? '<span class="itin-price">$' + a.price + '</span>' : '<span class="itin-price free">free</span>') + '</div>';
          }).join("") +
        '</div>' +
        '<div class="itin-day-mood">' +
          '<span class="itin-day-mood-label">Make today feel…</span>' +
          '<div class="mood-row">' +
            [["❤️ More romantic", "Make it more romantic"], ["😌 Slower", "Slow it down"], ["🍝 More foodie", "Make it more foodie"], ["✨ More luxurious", "Make it more luxurious"]].map(function (c) {
              return '<button type="button" class="mood-chip small" data-action="quick-modify" data-text="' + c[1] + '">' + c[0] + '</button>';
            }).join("") +
          '</div>' +
        '</div>' +
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
    state.destinationOptions = [];
    state.destinationIndex = 0;
    render();
    P.AI.suggestDestinations(state.prefs).then(function (options) {
      // brief, deliberate pause so "I think I found your kind of place." reads
      // as a reveal rather than an instant grid — not a real model call.
      setTimeout(function () {
        state.destinationOptions = options;
        state.destinationIndex = 0;
        render();
      }, 600);
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
      case "show-another":
        state.destinationIndex = (state.destinationIndex + 1) % state.destinationOptions.length;
        render();
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
        state = freshState();
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
