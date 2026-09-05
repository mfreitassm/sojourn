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
      view: "hero",              // hero | listening | understanding | confirm | researching | destinations | generating | trip
      inputText: "",
      prefs: null,
      recommendations: [],       // [{research, score, label, explanation}] — the researched, scored, ranked candidates
      researchStep: 0,
      expandedSources: {},       // index -> bool, which rec cards have "Research & sources" open
      selectedDest: null,
      trip: null,
      previousTrip: null,        // for "compare" after a modification
      lastChangeMessage: null,
      lastChanges: [],           // bullet points describing what a modification actually changed
      loadingLabel: "",
      modifyInput: "",
      errorMessage: null,
      entryPoint: "plan"          // "plan" | "explore" — drives the back-link label deeper in the flow
    };
  }

  function backLink() {
    if (state.entryPoint === "explore") {
      return '<button type="button" class="back-link" data-action="back-to-explore">← Explore</button>';
    }
    return '<button type="button" class="back-link" data-action="back-to-plan-hero">← Plan</button>';
  }

  var state = freshState();

  // Views before a destination is chosen share one immersive full-bleed
  // photo backdrop — the conversation happens "inside" the journey, not
  // against a flat dashboard background.
  var IMMERSIVE_VIEWS = ["hero", "listening", "understanding", "confirm", "researching"];

  var LOADING_STEPS = {
    understanding: ["Understanding your travel style…", "Reading between the lines…"],
    researching: ["Checking the season…", "Looking at beaches…", "Comparing travel times…", "Finding experiences…", "Checking the budget…"],
    generating: ["Researching neighbourhoods…", "Matching hotels…", "Putting the route together…"]
  };

  var CATEGORY_META = {
    weather: { emoji: "☀️", label: "Warm weather" },
    beach: { emoji: "🏖️", label: "Beaches" },
    food: { emoji: "🍜", label: "Great food" },
    romance: { emoji: "❤️", label: "Romantic" },
    culture: { emoji: "🎨", label: "Culture" },
    relaxation: { emoji: "😌", label: "Relaxed" },
    budget: { emoji: "💰", label: "Good value" },
    travelTime: { emoji: "✈️", label: "Easy to reach" },
    paceFit: { emoji: "🎯", label: "Right pace" }
  };
  function categoryChip(cat) {
    var m = CATEGORY_META[cat] || { emoji: "•", label: cat };
    return m.emoji + " " + m.label;
  }

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
    var liveResearch = window.SojournResearch && window.SojournResearch.isLive();
    var liveLLM = window.SojournLLM && window.SojournLLM.isLive();
    if (liveResearch) return '<div class="demo-badge live">LIVE RESEARCH</div>';
    var label = liveLLM
      ? "DEMO MODE · reasoning is live Claude, research is still simulated"
      : "DEMO MODE · suggestions are simulated, not live AI";
    return '<div class="demo-badge" title="Destination research is hand-curated reference data, not fetched from the web — see the audit notes for why.">' + label + '</div>';
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
      case "researching": return renderResearching();
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

  // "SOJOURN IS LOOKING AROUND" — the elegant stand-in for a bare spinner
  // while researchDestination()/scoreDestination() actually run underneath.
  function renderResearching() {
    var steps = LOADING_STEPS.researching;
    return (
      '<section class="hero research-loading">' +
        '<p class="eyebrow on-image anim-rise">SOJOURN IS LOOKING AROUND</p>' +
        '<div class="research-steps">' +
          steps.map(function (label, i) {
            var st = i < state.researchStep ? "done" : (i === state.researchStep ? "active" : "pending");
            return '<p class="research-step ' + st + '"><span class="research-step-mark">' + (st === "done" ? "✓" : "") + '</span>' + escapeHtml(label) + '</p>';
          }).join("") +
        '</div>' +
      '</section>'
    );
  }

  function renderDestinations() {
    if (state.errorMessage && !state.recommendations.length) {
      return (
        '<section class="hero"><p class="display-md center anim-fade">' + escapeHtml(state.errorMessage) + '</p>' +
          '<div class="dest-reveal-actions"><button class="btn primary" data-action="back-to-plan-hero">Try again</button></div>' +
        '</section>'
      );
    }
    if (!state.recommendations.length) {
      return '<section class="hero"><p class="display-md center anim-fade">I couldn’t find a confident match — try describing it a little differently.</p></section>';
    }
    return (
      '<section class="recs-view">' +
        backLink() +
        '<p class="eyebrow anim-rise">' + state.recommendations.length + ' PLACES I’D SERIOUSLY CONSIDER</p>' +
        '<h2 class="display-lg anim-rise stagger-1">Here’s what I found.</h2>' +
        (state.errorMessage ? '<p class="hero-error dark">' + escapeHtml(state.errorMessage) + '</p>' : "") +
        '<div class="recs-list">' + state.recommendations.map(renderRecCard).join("") + '</div>' +
      '</section>'
    );
  }

  function renderRecCard(item, i) {
    var research = item.research, score = item.score, explanation = item.explanation || {};
    var topCats = score.categoryScores.filter(function (c) { return c.weight > 1; })
      .slice().sort(function (a, b) { return b.contribution - a.contribution; }).slice(0, 4);
    return (
      '<div class="rec-card anim-rise stagger-' + Math.min(i + 1, 6) + '">' +
        '<div class="rec-card-media img-frame xl overlay-bottom img-cover" style="background-image:url(\'' + research.image + '\')">' +
          (item.label ? '<span class="rec-badge">' + item.label + '</span>' : "") +
          '<div class="rec-card-caption">' +
            '<p class="eyebrow on-image">' + research.emoji + ' ' + escapeHtml(research.country.toUpperCase()) + '</p>' +
            '<h3 class="display-lg" style="color:#fff;">' + escapeHtml(research.destination) + '</h3>' +
          '</div>' +
        '</div>' +
        '<div class="rec-card-body">' +
          '<div class="rec-match"><span class="rec-match-figure">' + score.overall + '%</span><span class="rec-match-label">match</span></div>' +
          '<p class="rec-why"><strong>Why this fits you —</strong> ' + escapeHtml(explanation.why || "") + '</p>' +
          '<div class="mood-row">' + topCats.map(function (c) { return '<span class="mood-chip static">' + categoryChip(c.category) + '</span>'; }).join("") + '</div>' +
          '<p class="rec-tradeoff">⚖️ One trade-off: ' + escapeHtml(explanation.tradeoff || "") + '</p>' +
          renderSourcesToggle(research, score, i) +
          '<div class="rec-actions"><button class="btn primary" data-action="pick-destination" data-id="' + research.destinationId + '">Choose this trip →</button></div>' +
        '</div>' +
      '</div>'
    );
  }

  var BASIS_LABEL = { fact: "FACT", estimate: "ESTIMATE", inference: "INFERENCE" };

  function renderSourcesToggle(research, score, idx) {
    var open = !!state.expandedSources[idx];
    var evidenceHtml = research.evidence.map(function (e) {
      return '<div class="evidence-row"><span class="evidence-basis basis-' + e.basis + '">' + BASIS_LABEL[e.basis] + '</span>' +
        '<span class="evidence-body"><span class="evidence-claim">' + escapeHtml(e.claim) + '</span><span class="evidence-value">' + escapeHtml(e.value) + '</span></span></div>';
    }).join("");
    var scoresHtml = score.categoryScores.filter(function (c) { return c.weight > 1; }).map(function (c) {
      return '<div class="score-row"><span>' + categoryChip(c.category) + '</span><span>' + c.score + '/100 · ' + c.weight + '% weight</span></div>';
    }).join("");
    var isLive = window.SojournResearch && window.SojournResearch.isLive();
    return (
      '<div class="rec-sources">' +
        '<button type="button" class="rec-sources-toggle" data-action="toggle-sources" data-idx="' + idx + '">' +
          (open ? "Hide research & sources" : "Why this recommendation? See the research →") +
        '</button>' +
        (open ?
          '<div class="rec-sources-panel anim-rise">' +
            '<p class="rec-sources-note">' + (isLive ? "Live research" : "DEMO MODE — curated reference data, no live sources yet") + '</p>' +
            '<div class="evidence-list">' + evidenceHtml + '</div>' +
            '<div class="score-breakdown">' + scoresHtml + '</div>' +
          '</div>' : ""
        ) +
      '</div>'
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
        '<div class="compare-banner-head">' +
          '<strong>' + escapeHtml(state.lastChangeMessage || "Trip updated.") + '</strong>' +
          '<span class="compare-figures">' + money(state.previousTrip.estimatedCost, currency) + ' → <strong>' + money(t.estimatedCost, currency) + '</strong></span>' +
          '<button class="btn small ghost" data-action="undo-change">Undo</button>' +
        '</div>' +
        (state.lastChanges && state.lastChanges.length ?
          '<ul class="compare-changes">' + state.lastChanges.map(function (c) { return '<li>' + escapeHtml(c) + '</li>'; }).join("") + '</ul>' : ""
        ) +
      '</div>'
    ) : "";

    return (
      '<section class="trip-view">' +
        backLink() +
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
        (day.locationNote ? '<p class="itin-day-note">' + escapeHtml(day.locationNote) + '</p>' : "") +
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

  // The core research pipeline (§9 of the spec):
  //   generateCandidates -> researchCandidates -> scoreCandidates -> rank+explain
  // Candidates here are simply "all 5 curated destinations" — the dataset is
  // small and entirely local, so there's no cost-control reason to
  // pre-filter before researching (that pre-filter step matters once a real
  // search provider with per-call cost exists; see the final report).
  var researchTimer = null;
  function stopResearchStepper() {
    if (researchTimer) { clearInterval(researchTimer); researchTimer = null; }
  }
  function confirmPace(pace) {
    state.prefs.pace = pace;
    if (pace === "slow" && state.prefs.travelStyle.indexOf("slow travel") === -1) state.prefs.travelStyle.push("slow travel");
    if (pace === "active" && state.prefs.travelStyle.indexOf("adventure") === -1) state.prefs.travelStyle.push("adventure");
    state.view = "researching";
    state.researchStep = 0;
    state.recommendations = [];
    state.errorMessage = null;
    render();

    var steps = LOADING_STEPS.researching;
    researchTimer = setInterval(function () {
      if (state.view !== "researching") { stopResearchStepper(); return; }
      state.researchStep = Math.min(steps.length - 1, state.researchStep + 1);
      render();
    }, 480);

    var candidateIds = P.DESTINATIONS.map(function (d) { return d.id; });
    var pipeline = window.SojournResearch.researchAllCandidates(candidateIds, state.prefs)
      .then(function (researched) {
        var ranked = window.SojournScoring.rankAndLabel(researched, state.prefs).ranked;
        var keep = ranked.filter(function (r) { return r.score.overall >= 40; });
        var top = (keep.length >= 3 ? keep : ranked).slice(0, 5);
        return Promise.all(top.map(function (item) {
          return window.SojournLLM.explainMatch(item.research, item.score, state.prefs).then(function (explanation) {
            return Object.assign({}, item, { explanation: explanation });
          });
        }));
      });
    var minDelay = new Promise(function (resolve) { setTimeout(resolve, 2200); });

    Promise.all([pipeline, minDelay]).then(function (results) {
      stopResearchStepper();
      state.recommendations = results[0];
      state.view = "destinations";
      render();
    }).catch(function () {
      stopResearchStepper();
      state.errorMessage = "I couldn't finish researching just now — here's what came back before that happened.";
      state.view = "destinations";
      render();
    });
  }

  function pickDestination(id) {
    state.selectedDest = id;
    state.view = "generating";
    state.loadingLabel = "";
    render();
    window.SojournResearch.deepResearch(id, state.prefs)
      .then(function (deep) { return P.AI.generateTrip(state.prefs, id, deep); })
      .catch(function () { return P.AI.generateTrip(state.prefs, id); }) // deep research failed — still build the trip, just without the neighbourhood split
      .then(function (trip) {
        setTimeout(function () {
          state.trip = trip;
          state.previousTrip = null;
          state.lastChangeMessage = null;
          state.lastChanges = [];
          state.view = "trip";
          render();
        }, 500);
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
      state.lastChanges = result.changes || [];
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
        // Land the phrase in the input first (visible, tactile) before it
        // submits — a beat of "you said this" rather than an instant jump-cut.
        var chipText = e.currentTarget.getAttribute("data-text");
        var heroInput = document.getElementById("hero-text");
        if (heroInput) {
          heroInput.value = chipText;
          heroInput.classList.add("chip-fill");
          setTimeout(function () { submitDescription(chipText); }, 320);
        } else {
          submitDescription(chipText);
        }
        break;
      case "set-pace":
        confirmPace(e.currentTarget.getAttribute("data-pace"));
        break;
      case "pick-destination":
        pickDestination(e.currentTarget.getAttribute("data-id"));
        break;
      case "toggle-sources":
        var idx = e.currentTarget.getAttribute("data-idx");
        state.expandedSources[idx] = !state.expandedSources[idx];
        render();
        break;
      case "back-to-plan-hero":
        state.view = "hero";
        render();
        break;
      case "back-to-explore":
        if (window.SojournNav) window.SojournNav.switchTo("explore");
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
      state = freshState();
      submitDescription(text);
    },
    resetToHero: function () {
      state = freshState();
      render();
    },
    // Entry point for Explore: user already picked a destination visually,
    // so skip straight to trip generation for it — same AI.generateTrip()
    // path as the conversational flow, just with neutral default prefs.
    startWithDestination: function (destId) {
      state = freshState();
      state.entryPoint = "explore";
      var prefs = P.models.createTravelPreferences({ travellers: 2, duration: 7, pace: "balanced", interests: [], travelStyle: [], destination: destId });
      state.prefs = prefs;
      state.view = "generating";
      state.loadingLabel = "";
      render();
      window.SojournResearch.deepResearch(destId, prefs)
        .then(function (deep) { return P.AI.generateTrip(prefs, destId, deep); })
        .catch(function () { return P.AI.generateTrip(prefs, destId); })
        .then(function (trip) {
          setTimeout(function () {
            state.trip = trip;
            state.previousTrip = null;
            state.lastChangeMessage = null;
            state.lastChanges = [];
            state.view = "trip";
            render();
          }, 500);
        });
    }
  };
})();
