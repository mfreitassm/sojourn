# Sojourn Research API

A small, dependency-free Cloudflare Worker that gives Sojourn's frontend
real, evidence-based destination research without ever putting an API key
in the browser. See `worker.js` for the implementation and the top-level
project's final report for how this fits into the wider architecture.

This is **source code only** — nothing here is deployed yet. Deploying it
requires your own Cloudflare account and your own API keys; no one else
can do that step for you (an AI assistant included), since it means
creating your accounts and paying for your own usage.

## What you need before you start

1. A **Cloudflare account** (free tier is fine) — https://dash.cloudflare.com/sign-up
2. An **Anthropic API key** — https://console.anthropic.com/ (pay-as-you-go; this Worker uses `claude-3-5-haiku` for cost)
3. A **Brave Search API key** — https://brave.com/search/api/ (has a free tier suitable for demo-level traffic)
4. Node.js installed locally, to run `wrangler` (Cloudflare's CLI) — no other build tooling needed

## Local setup

```bash
cd backend
npx wrangler login          # opens a browser to authorize wrangler against your Cloudflare account
npx wrangler kv namespace create SOJOURN_KV
```

The last command prints an `id`. Paste it into `wrangler.toml`, replacing
`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`.

Edit `wrangler.toml`'s `SOJOURN_ALLOWED_ORIGIN` to your actual GitHub Pages
origin (e.g. `https://yourname.github.io`). This is the **only** origin the
Worker will answer CORS requests from in production — add
`http://localhost:8765` (comma-separated) while you're testing locally
against the static frontend.

## Secrets (never go in wrangler.toml or any committed file)

```bash
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put SEARCH_API_KEY
```

Each prompts you to paste the key interactively — it's stored encrypted in
Cloudflare, never written to disk in this repo, never visible in `wrangler.toml`.

## Run it locally

```bash
npx wrangler dev
```

This starts the Worker on `http://localhost:8787`. Point the frontend at it
by opening `js/sojourn-config.js` (or using the `?apiBaseUrl=` override —
see the main README) and setting:

```js
window.SojournConfig = {
  researchMode: "live",
  apiBaseUrl: "http://localhost:8787"
};
```

Then serve the frontend as usual (`python3 -m http.server 8765` from the
repo root) and open it in a browser. Watch Worker logs with:

```bash
npx wrangler tail
```

## Deploy

```bash
npx wrangler deploy
```

This prints your Worker's real URL, something like
`https://sojourn-research-api.<your-subdomain>.workers.dev`. Set that as
`apiBaseUrl` in `js/sojourn-config.js` (or via the `?apiBaseUrl=` override)
and set `researchMode: "live"`.

## Test Live Mode end-to-end

1. `curl https://sojourn-research-api.<you>.workers.dev/api/health` → `{"ok":true}`
2. Open the deployed frontend, describe a trip, confirm the "LIVE RESEARCH" badge appears instead of "DEMO MODE"
3. Check a recommendation card's "Research & sources" panel — it should show real, clickable source links with real publisher names, not the Demo Mode placeholder text
4. Temporarily set `SOJOURN_ALLOWED_ORIGIN` to something wrong and confirm the frontend shows the explicit "Live research isn't available right now" message — never a silent fallback to Demo Mode data

## Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/health` | GET | Liveness check, no auth |
| `/api/research/destination` | POST | Candidate-stage research for one destination (2-4 searches) |
| `/api/research/deep` | POST | Deeper research for the user's selected destination (up to 10 searches, includes neighbourhoods) |

Request/response shapes are documented in comments at the top of the
relevant handler functions in `worker.js` — they're built to match the
existing frontend's `DestinationResearchResult` shape (`js/travel-research.js`)
exactly, so `TravelScoring` and the recommendation cards don't need to know
whether they're looking at mock or live data.

## Cost control

- Candidate research: up to 4 web searches + 1 LLM call per destination
- Deep research: up to 10 web searches + 1 LLM call, once, for the selected destination only
- Both are cached in KV for 6 hours per destination+month+budget-tier, so repeat requests for the same trip don't re-spend
- Rate-limited to 30 requests/hour per IP per endpoint (`429` beyond that)
- No autonomous loops, no "keep searching until satisfied" — every call path has a hard, small, fixed query budget

## Swapping providers later

- **Search**: replace the `braveSearch()` function with a call to whatever
  API you prefer (Serper, Bing Search, SerpAPI, ...) — keep the same
  return shape (`{title, url, snippet, publisher, publishedAt, retrievedAt, sourceQuality}`)
  and nothing else in the file needs to change.
- **LLM**: replace `callAnthropic()` similarly. The rest of the pipeline
  (search → evidence → your existing client-side `TravelScoring`) doesn't
  care which model produced the evidence.
