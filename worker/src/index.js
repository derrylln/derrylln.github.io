/**
 * FINWIRE smart proxy — Cloudflare Worker
 *
 * Routes:
 *   GET  /?url=<encoded>   CORS proxy for RSS feeds, article HTML and Yahoo JSON
 *   POST /ai-summarize     Gemini summary { text, lang, isBriefing }
 *   POST /ai-explain-move  Gemini explanation { symbol, pct, isUp, newsText }
 *   POST /ai-sentiment     Gemini read of whether cached headlines look good or bad { symbol, name, newsText, lang }
 *   GET  /health           Simple liveness check used by the deploy script
 *
 * Every AI route tries Gemini first. If GROQ_API_KEY is set, a Gemini failure is
 * retried once on Groq's OpenAI-compatible endpoint before the reader sees an
 * error; see callAI below.
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

/* Gemini's free tier runs dry under real traffic, so a second provider answers
   when it does. Groq speaks the OpenAI chat format: the whole prompt becomes one
   user message. openai/gpt-oss-20b is the cheapest self-serve model there and
   the only one worth putting behind a personal project's free plan. */
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "openai/gpt-oss-20b";
const GROQ_TIMEOUT_MS = 12000;

const UPSTREAM_TIMEOUT_MS = 7000;
const GEMINI_TIMEOUT_MS = 25000;
/* js/feeds.js aborts the browser request after 30 s, and the fallback runs only
   after Gemini has failed, so the two budgets have to fit in that window. When
   a fallback key is present Gemini gets a shorter leash: 14 s + 12 s = 26 s. */
const GEMINI_FALLBACK_TIMEOUT_MS = 14000;
const MAX_UPSTREAM_BYTES = 5 * 1024 * 1024;
const MAX_AI_INPUT_CHARS = 20000;

// Publishers and Yahoo reject obvious bot traffic. These headers make the
// request look like a normal browser navigation from a real Chrome build.
/* AI ABUSE GUARD
   Anything enforced in the browser can be bypassed by opening a new tab, so the
   real throttle lives here. Counters are per-isolate memory: Cloudflare runs
   several isolates, so this is a burst limiter rather than a hard quota. It is
   what stops someone holding down an AI button (and it costs no storage). */
const AI_IP_LIMITS = { minute: 5, hour: 20, day: 60 };
const AI_IP_WINDOW_MS = 24 * 60 * 60 * 1000;
const aiIpHits = new Map();

function aiRateLimited(request) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();
  const list = (aiIpHits.get(ip) || []).filter(function (t) { return now - t < AI_IP_WINDOW_MS; });
  const count = function (ms) { return list.filter(function (t) { return now - t < ms; }).length; };
  const blocked = count(60000) >= AI_IP_LIMITS.minute ||
    count(3600000) >= AI_IP_LIMITS.hour ||
    list.length >= AI_IP_LIMITS.day;
  if (!blocked) { list.push(now); aiIpHits.set(ip, list); }
  if (aiIpHits.size > 1000) {
    aiIpHits.forEach(function (v, key) {
      if (!v.length || now - v[v.length - 1] > AI_IP_WINDOW_MS) aiIpHits.delete(key);
    });
  }
  return blocked;
}

const AI_LIMIT_BODY = {
  error: "AI generation is paused because too much was requested. Try again later.",
  code: "limit",
};

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
    if (url.pathname === "/ai-sentiment") return handleSentiment(request, env);
    if (url.pathname === "/ai-fundamentals") return handleFundamentals(request, env);
    if (url.pathname === "/health") {
      return json({
        ok: true,
        model: GEMINI_MODEL,
        fallback: env.GROQ_API_KEY ? GROQ_MODEL : null,
      });
    }

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

async function callGemini(prompt, apiKey, timeoutMs = GEMINI_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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

async function callGroq(prompt, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  try {
    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      // A 429 here is the free plan's token or request cap. retry-after is the
      // only part of the response worth keeping in the log line.
      const retry = response.headers.get("retry-after");
      throw new Error(
        `Groq HTTP ${response.status}${retry ? ` (retry after ${retry}s)` : ""}: ${raw.slice(0, 300)}`
      );
    }

    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error("Groq returned a non-JSON response");
    }

    const choice = data && data.choices && data.choices[0];
    const message = choice && choice.message;
    const text = message && typeof message.content === "string" ? message.content.trim() : "";
    if (!text) {
      const reason = choice && choice.finish_reason ? ` (finish_reason: ${choice.finish_reason})` : "";
      throw new Error(`Groq returned an empty answer${reason}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/* Only a transient Gemini failure earns a second provider. A rejected key, a
   malformed request or an empty candidate list would fail the same way on Groq,
   and answering from the fallback would hide a broken deploy, so those errors
   are returned instead of masked.

   The classification is aiFailure's, not a second opinion: whatever it reports
   as 'quota' or 'busy' is retried, and everything it calls 'upstream' is not,
   so the reader-facing code and this decision can never drift apart. A timeout
   is the one case aiFailure cannot see, because the abort happens in fetch.
   Returns the reason, or "" to skip Groq. */
function geminiRetryable(error) {
  const code = aiFailure(error).code;
  if (code === "quota" || code === "busy") return code;
  if (error && error.name === "AbortError") return "timeout";
  return "";
}

/* Gemini first, Groq second, and only for a failure Groq could actually answer.
   A missing GROQ_API_KEY means no fallback at all, so the Gemini error is
   rethrown untouched. When both fail, the two messages are joined: aiFailure
   then classifies the pair (a Groq 429 means the free plan's tokens ran out,
   which reads to the visitor as the site's quota). */
async function callAI(prompt, env) {
  const budget = env.GROQ_API_KEY ? GEMINI_FALLBACK_TIMEOUT_MS : GEMINI_TIMEOUT_MS;
  let geminiError;
  try {
    return { text: await callGemini(prompt, env.GEMINI_API_KEY, budget), provider: "gemini" };
  } catch (error) {
    geminiError = error;
  }

  const reason = geminiRetryable(geminiError);
  if (!reason || !env.GROQ_API_KEY) throw geminiError;

  try {
    const text = await callGroq(prompt, env.GROQ_API_KEY);
    // One line per fallback answer, so `wrangler tail` shows when Groq is the
    // provider actually serving readers.
    console.log(`AI fallback: groq answered (${GROQ_MODEL}) after gemini ${reason}`);
    return { text, provider: "groq" };
  } catch (groqError) {
    const first = geminiError && geminiError.message ? geminiError.message : String(geminiError);
    const second = groqError && groqError.message ? groqError.message : String(groqError);
    throw new Error(`Gemini failed: ${first} | Groq fallback failed: ${second}`);
  }
}

async function aiReply(prompt, env) {
  try {
    const answer = await callAI(prompt, env);
    return json({ summary: answer.text, provider: answer.provider });
  } catch (error) {
    const failure = aiFailure(error);
    return json({ error: failure.message, code: failure.code, detail: failure.detail }, failure.status);
  }
}

/* Gemini's own errors are not reader-friendly: a spike on the free tier shows
   up as HTTP 429 with a RESOURCE_EXHAUSTED payload. Map the two cases a public
   visitor can actually cause to a stable code the client can translate, and
   keep the upstream text in 'detail' for debugging. */
function aiFailure(error) {
  const message = error && error.message ? error.message : String(error || "Unknown error");
  const lower = message.toLowerCase();
  if (/\b429\b|resource_exhausted|quota|rate.?limit/.test(lower)) {
    return { status: 429, code: "quota", message: "The AI quota for this site is used up right now." };
  }
  // Any 5xx is a server-side fault, not something the caller caused: Gemini
  // returning 500/502/504 is as transient as a 503, so it reads as busy and
  // that in turn lets the Groq fallback try. Keeping both decisions here means
  // the reader-facing code and the retry rule cannot disagree.
  if (/\b5\d\d\b|overloaded|unavailable|deadline/.test(lower)) {
    return { status: 503, code: "busy", message: "The AI service is busy right now." };
  }
  return { status: 502, code: "upstream", message: "The AI service could not answer.", detail: message.slice(0, 300) };
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
  if (aiRateLimited(request)) return json(AI_LIMIT_BODY, 429);

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

  return aiReply(prompt, env);
}

async function handleExplainMove(request, env) {
  if (request.method !== "POST") return plain("Method not allowed: use POST", 405);
  if (!env.GEMINI_API_KEY) return json({ error: "Missing GEMINI_API_KEY in Cloudflare" }, 500);
  if (aiRateLimited(request)) return json(AI_LIMIT_BODY, 429);

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

  return aiReply(prompt, env);
}

/* A verdict on cached headlines, asked once per name per day. The prompt pins
   the answer shape so the client can colour the line without parsing prose,
   and lets the model say UNCLEAR rather than invent a direction. */
async function handleSentiment(request, env) {
  if (request.method !== "POST") return plain("Method not allowed: use POST", 405);
  if (!env.GEMINI_API_KEY) return json({ error: "Missing GEMINI_API_KEY in Cloudflare" }, 500);
  if (aiRateLimited(request)) return json(AI_LIMIT_BODY, 429);

  const body = await readJsonBody(request);
  if (!body) return json({ error: "Invalid JSON body" }, 400);

  const symbol = readText(body.symbol, 32);
  if (!symbol) return json({ error: "Missing 'symbol'" }, 400);
  const name = readText(body.name, 80);
  const newsText = readText(body.newsText, 8000);
  if (!newsText) return json({ error: "Missing 'newsText'" }, 400);

  const targetLang = body.lang === "id" ? "Indonesian (Bahasa Indonesia)" : "English";

  const prompt = `You are an equity analyst judging whether the news below looks good or bad for ${symbol}${name ? ` (${name})` : ""}.

Headlines about this company, newest first. The publisher is in brackets:
${newsText}

Answer in ${targetLang}. Every rule is mandatory:
1. First line: exactly one of GOOD, BAD, MIXED or UNCLEAR, then " - ", then at most 12 words giving the reason.
2. Second line: at most 20 words on what would change that read.
3. Use only the headlines above. Name the publisher in brackets when you lean on a story, e.g. [Reuters].
4. Judge the company's business and reported events, not the share price. Routine price movement, index news, macro commentary or a passing mention are not a reason on their own.
5. If the headlines do not say enough about this company, first line must be "UNCLEAR - the cached headlines do not say enough about this company to judge." and nothing else.
6. Never invent events, people or numbers. No preamble, no disclaimer, no investment advice.`;

  return aiReply(prompt, env);
}

async function handleFundamentals(request, env) {
  if (request.method !== "POST") return plain("Method not allowed: use POST", 405);
  if (!env.GEMINI_API_KEY) return json({ error: "Missing GEMINI_API_KEY in Cloudflare" }, 500);
  if (aiRateLimited(request)) return json(AI_LIMIT_BODY, 429);

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

  return aiReply(prompt, env);
}
