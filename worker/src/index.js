/**
 * FINWIRE smart proxy — Cloudflare Worker
 *
 * Routes:
 *   GET  /?url=<encoded>   CORS proxy for RSS feeds, article HTML and Yahoo JSON
 *   POST /ai-summarize     Gemini summary { text, lang, isBriefing }
 *   POST /ai-explain-move  Gemini explanation { symbol, pct, isUp, newsText }
 *   GET  /health           Simple liveness check used by the deploy script
 *
 * The upstream body is read exactly once into an ArrayBuffer. Every Response we
 * build (client copy, cache copy, HEAD copy) is created from that buffer, never
 * from the live ReadableStream — a stream can only be consumed once, and feeding
 * it to two Responses is what produced
 * "This ReadableStream is disturbed (has already been read from)".
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_ENDPOINT =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const UPSTREAM_TIMEOUT_MS = 7000;
const GEMINI_TIMEOUT_MS = 25000;
const MAX_UPSTREAM_BYTES = 5 * 1024 * 1024;
const MAX_AI_INPUT_CHARS = 20000;

// Publishers and Yahoo reject obvious bot traffic. These headers make the
// request look like a normal browser navigation from a real Chrome build.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9," +
    "application/json;q=0.9,text/plain;q=0.8,*/*;q=0.7",
  "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
  "Upgrade-Insecure-Requests": "1",
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    if (url.pathname === "/ai-summarize") return handleSummarize(request, env);
    if (url.pathname === "/ai-explain-move") return handleExplainMove(request, env);
    if (url.pathname === "/ai-fundamentals") return handleFundamentals(request, env);
    if (url.pathname === "/health") return json({ ok: true, model: GEMINI_MODEL });

    return handleProxy(request, url, ctx);
  },
};

/* ------------------------------------------------------------------ helpers */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function plain(message, status = 400) {
  return new Response(message, {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

function headersFor(target) {
  const headers = new Headers(BROWSER_HEADERS);
  // Most publishers check Referer on article pages; sending the site's own
  // origin is both realistic and harmless.
  headers.set("Referer", target.origin + "/");
  if (target.hostname.endsWith("yahoo.com")) {
    headers.set("Accept", "application/json, text/plain, */*");
    headers.set("Referer", "https://finance.yahoo.com/");
  }
  return headers;
}

function altYahooHost(target) {
  if (target.hostname === "query1.finance.yahoo.com") {
    const alt = new URL(target.toString());
    alt.hostname = "query2.finance.yahoo.com";
    return alt;
  }
  if (target.hostname === "query2.finance.yahoo.com") {
    const alt = new URL(target.toString());
    alt.hostname = "query1.finance.yahoo.com";
    return alt;
  }
  return null;
}

// Cloudflare's edge cache is useful for pages and feeds, but 15 minutes of
// stale quotes would be misleading, so JSON gets a much shorter TTL.
function cacheTtlFor(contentType) {
  const type = (contentType || "").toLowerCase();
  // Several Indonesian feeds (antaranews, kontan) are served as
  // application/octet-stream even though the payload is plain XML.
  if (!type || type.includes("octet-stream")) return 900;
  if (type.includes("json")) return 60;
  if (type.startsWith("text/") || type.includes("xml") || type.includes("rss") || type.includes("atom")) {
    return 900;
  }
  return 0;
}

/* -------------------------------------------------------------------- proxy */

async function handleProxy(request, url, ctx) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return plain("Method not allowed: use GET", 405);
  }

  const rawTarget = url.searchParams.get("url");
  if (!rawTarget) return plain("Missing 'url' query parameter", 400);

  let target;
  try {
    target = new URL(rawTarget);
  } catch {
    return plain("Invalid 'url' query parameter", 400);
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return plain("Only http(s) URLs are allowed", 400);
  }

  const cache = caches.default;
  const cacheKey = new Request(target.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      method: "GET",
      headers: headersFor(target),
      redirect: "follow",
      signal: controller.signal,
    });

    // Yahoo rate-limits per host; retrying on the sibling query host usually
    // turns a 429 into a normal response.
    const alt = altYahooHost(target);
    if (alt && [401, 403, 429, 500, 502].includes(upstream.status)) {
      try {
        const retry = await fetch(alt.toString(), {
          method: "GET",
          headers: headersFor(alt),
          redirect: "follow",
          signal: controller.signal,
        });
        if (retry.ok || !upstream.ok) upstream = retry;
      } catch {
        /* keep the first response */
      }
    }
  } catch (error) {
    const aborted = error && error.name === "AbortError";
    return plain(
      aborted
        ? `Upstream timed out after ${UPSTREAM_TIMEOUT_MS}ms`
        : `Upstream fetch failed: ${error && error.message ? error.message : error}`,
      504
    );
  } finally {
    clearTimeout(timer);
  }

  // Pass upstream failures through with their real status instead of a
  // misleading 500/413. Publishers that block datacenter traffic (Bloomberg,
  // Tempo) answer 403; the client only needs to know it was not a success.
  if (!upstream.ok) {
    return plain(`Upstream responded ${upstream.status} ${upstream.statusText || ""}`.trim(), upstream.status);
  }

  // Read once. Everything downstream is built from this buffer.
  let body;
  try {
    body = await upstream.arrayBuffer();
  } catch (error) {
    return plain(`Could not read upstream body: ${error.message}`, 502);
  }

  const contentType = upstream.headers.get("content-type") || "text/plain; charset=utf-8";

  // Article scrapers only need the <head>, so an oversized page is trimmed
  // rather than rejected; binary payloads over the cap still fail loudly.
  let truncated = false;
  if (body.byteLength > MAX_UPSTREAM_BYTES) {
    const textLike = contentType.includes("html") || contentType.includes("xml") || contentType.includes("text/");
    if (!textLike) return plain(`Upstream response too large (${body.byteLength} bytes)`, 413);
    body = body.slice(0, MAX_UPSTREAM_BYTES);
    truncated = true;
  }
  const ttl = cacheTtlFor(contentType);
  const responseHeaders = {
    ...CORS_HEADERS,
    "Content-Type": contentType,
    "X-Finwire-Upstream-Status": String(upstream.status),
  };
  if (truncated) responseHeaders["X-Finwire-Truncated"] = "1";
  if (ttl > 0) responseHeaders["Cache-Control"] = `public, max-age=${ttl}`;

  const isHead = request.method === "HEAD";

  // Only real GETs are cacheable. Caching a HEAD would store a zero-length
  // body under the same key and poison later GETs.
  if (!isHead && ttl > 0 && !truncated && body.byteLength > 0 && ctx && typeof ctx.waitUntil === "function") {
    const cacheCopy = new Response(body, { status: upstream.status, headers: responseHeaders });
    ctx.waitUntil(cache.put(cacheKey, cacheCopy));
  }

  return new Response(isHead ? null : body, { status: upstream.status, headers: responseHeaders });
}

/* ----------------------------------------------------------------------- AI */

function readText(value, max = MAX_AI_INPUT_CHARS) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function callGemini(prompt, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`Gemini HTTP ${response.status}: ${raw.slice(0, 300)}`);
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error("Gemini returned a non-JSON response");
    }

    const candidate = data && data.candidates && data.candidates[0];
    const parts = candidate && candidate.content && candidate.content.parts;
    const text = Array.isArray(parts)
      ? parts.map((part) => (part && part.text) || "").join("").trim()
      : "";

    if (!text) {
      const reason = candidate && candidate.finishReason ? ` (finishReason: ${candidate.finishReason})` : "";
      throw new Error(`Gemini returned an empty summary${reason}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function handleSummarize(request, env) {
  if (request.method !== "POST") return plain("Method not allowed: use POST", 405);
  if (!env.GEMINI_API_KEY) return json({ error: "Missing GEMINI_API_KEY in Cloudflare" }, 500);

  const body = await readJsonBody(request);
  if (!body) return json({ error: "Invalid JSON body" }, 400);

  const input = readText(body.text);
  if (!input) return json({ error: "Missing 'text'" }, 400);

  const targetLang = body.lang === "id" ? "Indonesian (Bahasa Indonesia)" : "English";

  const prompt = body.isBriefing
    ? `You are a senior financial analyst writing an executive morning briefing for a client.
Below are the top news headlines and summaries from today.

Write a professional, structured market briefing in ${targetLang}.
Use exactly 4 to 6 bullet points. Group them into these 3 categories if possible:
- **Market Overview**: Overall sentiment, major indices, and general market direction.
- **Key Movers**: Specific stocks, sectors, or companies making notable moves.
- **Macro & Commodities**: Central bank news, inflation, forex, oil, or gold.

Keep it concise but highly informative. Do not use generic filler words.

NEWS:
${input}`
    : `Summarize the following financial news article in 2 to 3 concise sentences in ${targetLang}:\n\n${input}`;

  try {
    const summary = await callGemini(prompt, env.GEMINI_API_KEY);
    return json({ summary });
  } catch (error) {
    return json({ error: error.message }, 502);
  }
}

async function handleExplainMove(request, env) {
  if (request.method !== "POST") return plain("Method not allowed: use POST", 405);
  if (!env.GEMINI_API_KEY) return json({ error: "Missing GEMINI_API_KEY in Cloudflare" }, 500);

  const body = await readJsonBody(request);
  if (!body) return json({ error: "Invalid JSON body" }, 400);

  const symbol = readText(body.symbol, 32);
  if (!symbol) return json({ error: "Missing 'symbol'" }, 400);

  const pct = Number.isFinite(Number(body.pct)) ? Number(body.pct) : 0;
  const direction = body.isUp ? "UP" : "DOWN";
  const newsText = readText(body.newsText, 8000) || "(no headlines supplied)";

  const prompt = `You are a market analyst explaining today's price move in ${symbol}, which is ${direction} ${pct}%.

Headlines published about this instrument, newest first. The publisher is in brackets:
${newsText}

Write at most 2 sentences (55 words max) explaining why the price is ${direction.toLowerCase()} today.
Every one of these rules is mandatory:
1. Use only facts stated in the headlines above, and name the publisher in brackets, e.g. [Reuters].
2. Do not mention macro trends, sector rotation, commodity prices, global cross-currents, geopolitics, investor sentiment or routine volatility unless a headline above explicitly says it.
3. Never invent events, people, numbers, quotes or dates. No company news that is not in the headlines.
4. If no headline plausibly explains the move, do not speculate. Reply with exactly: "No headline today explains this move. Most discussed story: <title of the most relevant headline>. Watch the company's filings and disclosures for the reason."
5. No preamble, no title, no disclaimer.`;

  try {
    const summary = await callGemini(prompt, env.GEMINI_API_KEY);
    return json({ summary });
  } catch (error) {
    return json({ error: error.message }, 502);
  }
}
async function handleFundamentals(request, env) {
  if (request.method !== "POST") return plain("Method not allowed: use POST", 405);
  if (!env.GEMINI_API_KEY) return json({ error: "Missing GEMINI_API_KEY in Cloudflare" }, 500);

  const body = await readJsonBody(request);
  if (!body) return json({ error: "Invalid JSON body" }, 400);

  const symbol = readText(body.symbol, 32);
  if (!symbol) return json({ error: "Missing 'symbol'" }, 400);

  const name = readText(body.name, 80);
  const figures = readText(body.figures, 4000);
  if (!figures) return json({ error: "Missing 'figures'" }, 400);

  const targetLang = body.lang === "id" ? "Indonesian (Bahasa Indonesia)" : "English";

  const prompt = `You are an equity analyst giving a short fundamental read on ${symbol}${name ? ` (${name})` : ""}.

Reported figures, one per line. The period is in [brackets]; quarters come first and are the most recent:
${figures}

Write exactly 3 sentences, 85 words maximum, in ${targetLang}:
1. What the figures say about the business: growth, profitability, margins and cash generation.
2. The clearest strength and the clearest weakness visible in these numbers.
3. What to watch next, only as far as these figures hint at it (for example a margin or cash flow trend).

These rules are mandatory:
- Use only the figures above. Never add debt, dividends, guidance, valuation opinions, price targets, news or anything not listed.
- Quote at most two numbers, and keep each currency marker exactly as written.
- No buy, sell or hold recommendation, no disclaimer, no title, no preamble.`;

  try {
    const summary = await callGemini(prompt, env.GEMINI_API_KEY);
    return json({ summary });
  } catch (error) {
    return json({ error: error.message }, 502);
  }
}
