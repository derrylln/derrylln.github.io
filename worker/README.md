# FINWIRE smart proxy (Cloudflare Worker)

The static site in the repo root calls this Worker for three things:

| Route | Used for |
| --- | --- |
| `GET /?url=<encoded>` | CORS proxy for RSS feeds (`api.rss2json.com` is not the only consumer), article HTML for Open Graph images and full-text summaries, and Yahoo Finance chart JSON |
| `POST /ai-summarize` | Gemini summary of one article, or the morning briefing |
| `POST /ai-explain-move` | Gemini explanation of a single stock move |
| `POST /ai-fundamentals` | Gemini read of a company's reported figures (growth, margins, cash, one strength and one weakness) |

`GET /health` returns `{"ok":true}` and is only used to verify a deploy.

## AI limits and error codes

Two independent gates protect the Gemini key. The browser gate is for user
experience; the Worker gate is the one that actually stops abuse, because
anything in `localStorage` / `sessionStorage` can be cleared.

### Browser (`app.js`)

| Guard | Value | Constant |
| --- | --- | --- |
| AI calls per tab | 12 | `AI_SESSION_CAP` |
| Cooldown between calls | 4 s | `AI_COOLDOWN_MS` |
| Summary cache | 7 days, 300 entries | `AI_CACHE_TTL` / `AI_CACHE_LIMIT` |
| Call counter | `sessionStorage` `finwire.ai.calls.v1` | `AI_SESSION_KEY` |
| Summary cache | `localStorage` `finwire.ai.summaries.v1` | `AI_CACHE_KEY` |

All AI entry points share one budget: the article summary, the daily briefing,
"why it moved", a holding's AI read and the financial report's AI read. A
cached summary is served without spending a call, including after the cap is
reached. The counter resets when the tab is closed; clearing site data also
clears the summary cache.

### Worker

| Window | Limit | Constant |
| --- | --- | --- |
| 1 minute | 5 | `AI_IP_LIMITS.minute` |
| 1 hour | 20 | `AI_IP_LIMITS.hour` |
| 24 hours | 60 | `AI_IP_LIMITS.day` |

Keyed on `CF-Connecting-IP`. A blocked request returns 429 before Gemini is
called, so it spends no quota. Hits older than 24 hours are dropped, and the
map prunes itself once it holds more than 1,000 addresses.

These counters live in isolate memory. Cloudflare runs several isolates per
location, so a visitor rotating IPs can still get through; treat this as burst
protection, not a hard global quota. For a hard quota, move the counter to D1,
KV or a Durable Object, keyed the same way.

### Error codes

`POST /ai-summarize`, `/ai-explain-move` and `/ai-fundamentals` return
`{ error, code, detail? }`. The client translates `code`; only `detail` (when
present) carries the raw upstream message.

| Code | HTTP | Meaning | Reader sees |
| --- | --- | --- | --- |
| `limit` | 429 | This IP exceeded the Worker limits above | "AI generation is paused because too much was requested…" |
| `quota` | 429 | Gemini's own free-tier quota is exhausted | "The free AI quota is used up for now…" |
| `busy` | 503 | Gemini is overloaded or timed out | "The AI service is busy right now…" |
| `upstream` | 502 | Any other Gemini failure | "Could not reach the AI service." |
| — | 500 | `GEMINI_API_KEY` is not set | Setup error, never shown to readers |

`limit` is checked before `quota` on the client, so a throttled visitor is told
about their own usage rather than a site-wide outage.

### Tuning

Change the numbers in `worker/src/index.js` (`AI_IP_LIMITS`,
`AI_IP_WINDOW_MS`) and redeploy the Worker. Change the browser values in
`app.js` (`AI_SESSION_CAP`, `AI_COOLDOWN_MS`, `AI_CACHE_TTL`,
`AI_CACHE_LIMIT`) and redeploy the site. The reader-facing text lives in the
`I18N.en` / `I18N.id` dictionaries (`aiCap`, `aiLimit`, `aiSlow`, `aiQuota`,
`aiBusy`, `aiTimeout`, `aiFailed`).

Keep the two gates roughly consistent: a browser cap far above the Worker's
daily limit just means readers hit the server message first.

### Local development

`wrangler dev` has no `CF-Connecting-IP`, so every local AI request shares the
"unknown" bucket and the sixth request in a minute is refused. Restart the dev
server, or wait a minute, to reset the in-memory counters. Browser counters
reset when the tab closes or site data is cleared.

## Why the old Worker broke

The previous version handed the **same** upstream stream to two responses:

```js
const responseToCache = new Response(originResponse.body, originResponse);
ctx.waitUntil(cache.put(targetUrl, responseToCache.clone()));

const finalResponse = new Response(originResponse.body, originResponse); // <- boom
```

A `ReadableStream` can only be consumed once, so the second read threw:

```
This ReadableStream is disturbed (has already been read from), and cannot be used as a body.
```

That is why every HTML/RSS URL returned HTTP 500 (no Open Graph images, no
full-article text for the AI summary) and why most Yahoo chart requests failed
(the ticker showed `IHSG ——`, the dashboard rendered no stock cards).

The rebuild reads the body exactly once with `await upstream.arrayBuffer()` and
builds every response — client copy and cache copy — from that buffer.

Other changes:

- Upstream status codes are propagated instead of being flattened to 500, with
  `X-Finwire-Upstream-Status` for debugging.
- Browser-like `User-Agent`, `Accept`, `Accept-Language` and `Referer` headers.
  This fixes some 403s (Yahoo in particular); a few publishers (Bloomberg,
  Tempo) block datacenter IP ranges outright and may still return 403.
- Yahoo requests retry on the sibling host (`query1` ⇄ `query2`) on
  `401/403/429/5xx`.
- Cache TTLs are per content type: 15 min for HTML/XML/RSS, 60 s for JSON.
  Previously quotes were cached for 15 minutes, which made prices stale.
- 7 s upstream timeout, 5 MB response cap, `http(s)` only targets, `HEAD`
  support, and CORS headers on every response (including errors).
- AI routes validate input, cap prompt size at 20 000 characters, time out after
  25 s, and return the real Gemini error message instead of a generic 500.

## Deploy

Requires Node 18+ (Wrangler runs through `npx`, no dependencies to install).

```bash
cd worker

# 1. Log in to the Cloudflare account that owns derrylnnn.workers.dev
npx wrangler login

# 2. One-time: store the Gemini key as a secret (never in a file)
npx wrangler secret put GEMINI_API_KEY

# 3. Ship it
npx wrangler deploy
```

`wrangler.toml` keeps `name = "finwire-smart-proxy"`, so the deployed URL stays
`https://finwire-smart-proxy.derrylnnn.workers.dev` and the site needs no
changes. If Wrangler prints a different `workers.dev` subdomain, the account's
subdomain differs from `derrylnnn` — update `PROXIES` in `app.js` (line ~140)
and the two `fetch(...)` calls for the AI routes to match.

## Verify after deploying

```bash
# 1. Worker is alive
curl -s https://finwire-smart-proxy.derrylnnn.workers.dev/health

# 2. HTML proxying works (this used to return 500)
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' \
  'https://finwire-smart-proxy.derrylnnn.workers.dev/?url=https%3A%2F%2Fexample.com'

# 3. RSS feed arrives intact
curl -s 'https://finwire-smart-proxy.derrylnnn.workers.dev/?url=https%3A%2F%2Fwww.antaranews.com%2Frss%2Fekonomi' | head -c 200

# 4. Yahoo chart JSON (the ticker/dashboard path)
curl -s 'https://finwire-smart-proxy.derrylnnn.workers.dev/?url=https%3A%2F%2Fquery1.finance.yahoo.com%2Fv8%2Ffinance%2Fchart%2F%255EJKSE%3Frange%3D1d%26interval%3D5m' | head -c 200

# 5. AI route
curl -s -X POST https://finwire-smart-proxy.derrylnnn.workers.dev/ai-summarize \
  -H 'Content-Type: application/json' \
  -d '{"text":"Bank Indonesia held its benchmark rate at 6.25% on Wednesday, citing stable inflation and a resilient rupiah.","lang":"en"}'
```

Every response must carry `Access-Control-Allow-Origin: *`; check with
`curl -sI` if the browser reports a CORS error.

## Local development

```bash
cd worker
npx wrangler dev --port 8787 --var GEMINI_API_KEY:dummy-key
```

`--var` is only for exercising the proxy locally; use
`npx wrangler secret put GEMINI_API_KEY` for the real key.
