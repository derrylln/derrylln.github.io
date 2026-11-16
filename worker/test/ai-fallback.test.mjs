/**
 * Fallback and error-classification behaviour of the AI routes, with fetch
 * mocked. No keys, no network, no Cloudflare account needed.
 *
 *   node worker/test/ai-fallback.test.mjs
 *
 * Node treats a .js file with `export default` as CommonJS unless the nearest
 * package.json says otherwise, so the Worker source is copied to a temp .mjs
 * before it is imported.
 */
import assert from "assert";
import { copyFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const copy = join(mkdtempSync(join(tmpdir(), "finwire-worker-")), "index.mjs");
copyFileSync(join(here, "..", "src", "index.js"), copy);
const { default: worker, AiIpGuard } = await import("file://" + copy);

const logs = [];
const realLog = console.log;
console.log = (...args) => logs.push(args.join(" "));

const calls = [];
let gemini = () =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: "gemini answer" }] } }] }),
    { status: 200 }
  );
let groq = () =>
  new Response(JSON.stringify({ choices: [{ message: { content: "groq answer" }, finish_reason: "stop" }] }), {
    status: 200,
  });

globalThis.fetch = async (url, init) => {
  const href = typeof url === "string" ? url : url.url;
  if (href.includes("generativelanguage")) {
    calls.push("gemini");
    return gemini(init);
  }
  if (href.includes("api.groq.com")) {
    calls.push("groq");
    assert.ok(href.endsWith("/openai/v1/chat/completions"), "groq path");
    const body = JSON.parse(init.body);
    assert.strictEqual(body.model, "openai/gpt-oss-20b");
    assert.strictEqual(body.messages.length, 1);
    assert.strictEqual(body.messages[0].role, "user");
    assert.strictEqual(init.headers.Authorization, "Bearer groq-key");
    return groq(init);
  }
  throw new Error("unexpected fetch " + href);
};

let ip = 0;
async function ask(env, path = "/ai-summarize", payload = { text: "Bank Indonesia held rates.", lang: "en" }) {
  const req = new Request("https://w.dev" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.0.1." + ++ip },
    body: JSON.stringify(payload),
  });
  const res = await worker.fetch(req, env, {});
  return { status: res.status, body: await res.json() };
}
const ENV = { GEMINI_API_KEY: "g-key", GROQ_API_KEY: "groq-key" };
const reset = () => {
  calls.length = 0;
  logs.length = 0;
};

// 1. Gemini healthy: Groq untouched, nothing logged.
reset();
let r = await ask(ENV);
assert.deepStrictEqual(
  [r.status, r.body.summary, r.body.provider, calls.join(","), logs.length],
  [200, "gemini answer", "gemini", "gemini", 0]
);

// 2. Quota: Groq answers, exactly one log line naming the reason.
gemini = () => new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }), { status: 429 });
reset();
r = await ask(ENV);
assert.deepStrictEqual([r.status, r.body.provider, calls.join(",")], [200, "groq", "gemini,groq"]);
assert.strictEqual(logs[0], "AI fallback: groq answered (openai/gpt-oss-20b) after gemini quota");

// 3. Overload: retried, logged as busy.
gemini = () => new Response("model overloaded", { status: 503 });
reset();
r = await ask(ENV);
assert.deepStrictEqual([r.status, r.body.provider], [200, "groq"]);
assert.strictEqual(logs[0], "AI fallback: groq answered (openai/gpt-oss-20b) after gemini busy");

// 4. Timeout: the abort has no status code, so it is detected by name.
gemini = () => {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  throw error;
};
reset();
r = await ask(ENV);
assert.deepStrictEqual([r.status, r.body.provider, calls.join(",")], [200, "groq", "gemini,groq"]);
assert.strictEqual(logs[0], "AI fallback: groq answered (openai/gpt-oss-20b) after gemini timeout");

// 5. Caller-caused failures are not hidden behind a working Groq.
for (const [status, body] of [
  [400, "API key not valid"],
  [401, "unauthorized"],
  [403, "permission denied"],
]) {
  gemini = () => new Response(body, { status });
  reset();
  r = await ask(ENV);
  assert.deepStrictEqual([r.status, r.body.code, calls.join(",")], [502, "upstream", "gemini"], status);
  assert.ok(new RegExp(String(status)).test(r.body.detail), r.body.detail);
  assert.strictEqual(logs.length, 0, "must not log a fallback answer");
}

// 5b. Any 5xx is a provider fault: it falls back and reads as busy.
for (const [status, body] of [
  [500, "internal"],
  [502, "bad gateway"],
  [504, "gateway timeout"],
]) {
  gemini = () => new Response("Gemini HTTP " + status + ": " + body, { status });
  reset();
  r = await ask(ENV);
  assert.deepStrictEqual([r.status, r.body.provider, calls.join(","), logs.length], [200, "groq", "gemini,groq", 1], String(status));
  assert.strictEqual(logs[0], "AI fallback: groq answered (openai/gpt-oss-20b) after gemini busy");
}

// 6. An empty candidate list is a real problem, not a fallback trigger.
gemini = () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [] }, finishReason: "SAFETY" }] }), { status: 200 });
reset();
r = await ask(ENV);
assert.deepStrictEqual([r.status, r.body.code, calls.join(",")], [502, "upstream", "gemini"]);
assert.ok(/finishReason: SAFETY/.test(r.body.detail), r.body.detail);

// 7. Both exhausted: quota, and no fallback log.
gemini = () => new Response("quota", { status: 429 });
groq = () => new Response("rate limit exceeded", { status: 429, headers: { "retry-after": "7" } });
reset();
r = await ask(ENV);
assert.deepStrictEqual([r.status, r.body.code, logs.length], [429, "quota", 0]);

// 8. 5xx plus a dead fallback still reads as busy, without leaking detail.
gemini = () => new Response("Gemini HTTP 500: internal", { status: 500 });
groq = () => new Response("boom", { status: 500 });
r = await ask(ENV);
assert.deepStrictEqual([r.status, r.body.code], [503, "busy"]);
assert.strictEqual(r.body.detail, undefined);

// 9. No Groq key: the Gemini error passes through, Groq never called.
reset();
gemini = () => new Response("quota", { status: 429 });
groq = () => {
  throw new Error("should not be called");
};
r = await ask({ GEMINI_API_KEY: "g-key" });
assert.deepStrictEqual([r.status, r.body.code, calls.join(","), logs.length], [429, "quota", "gemini", 0]);

// 10. Empty Groq content is a failure, not a blank card.
gemini = () => new Response("quota", { status: 429 });
groq = () => new Response(JSON.stringify({ choices: [{ message: { content: "   " }, finish_reason: "length" }] }), { status: 200 });
reset();
r = await ask(ENV);
assert.deepStrictEqual([r.status, r.body.code, logs.length], [429, "quota", 0]);

// 11. The other routes share the path.
gemini = () => new Response("quota", { status: 429 });
groq = () => new Response(JSON.stringify({ choices: [{ message: { content: "groq answer" } }] }), { status: 200 });
for (const [path, payload] of [
  ["/ai-explain-move", { symbol: "BBCA.JK", pct: 1.2, isUp: true, newsText: "x" }],
  ["/ai-sentiment", { symbol: "BBCA.JK", newsText: "x" }],
  ["/ai-fundamentals", { symbol: "BBCA.JK", figures: "Revenue [2025] 1,000" }],
]) {
  reset();
  const res = await ask(ENV, path, payload);
  assert.deepStrictEqual([res.status, res.body.provider, logs.length], [200, "groq", 1], path);
}

// 13. Durable Object counters: the sixth hit in a minute is refused.
const mem = new Map();
const state = {
  storage: {
    get: async (key) => mem.get(key),
    put: async (key, value) => {
      mem.set(key, value);
    },
  },
};
const guard = new AiIpGuard(state);
const guardHit = async () =>
  (await guard.fetch(new Request("https://ai-guard/check", { headers: { "CF-Connecting-IP": "1.2.3.4" } }))).json();
const allowed = [];
for (let i = 0; i < 6; i++) allowed.push((await guardHit()).allowed);
assert.deepStrictEqual(allowed, [true, true, true, true, true, false]);
assert.strictEqual(mem.get("hits").length, 5, "refused hits are not stored");

// 14. The minute window rolls off, the hour window does not.
mem.set("hits", Array.from({ length: 5 }, () => Date.now() - 120000));
assert.strictEqual((await guardHit()).allowed, true, "minute window should be clear");
mem.set("hits", Array.from({ length: 20 }, (_, i) => Date.now() - 60000 * (i + 1.1)));
assert.strictEqual((await guardHit()).allowed, false, "hour window should block");

// 15. The Worker asks the object, and a refusal never reaches a provider.
const refusing = { idFromName: (name) => name, get: () => ({ fetch: async () => Response.json({ allowed: false }) }) };
reset();
gemini = () => {
  throw new Error("must not be called");
};
r = await ask({ ...ENV, AI_IP_GUARD: refusing });
assert.deepStrictEqual([r.status, r.body.code, calls.join(",")], [429, "limit", ""]);

// 16. A broken object degrades to local counters instead of failing the route.
const broken = {
  idFromName: (name) => name,
  get: () => ({
    fetch: async () => {
      throw new Error("boom");
    },
  }),
};
gemini = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "gemini answer" }] } }] }), { status: 200 });
reset();
r = await ask({ ...ENV, AI_IP_GUARD: broken });
assert.deepStrictEqual([r.status, r.body.provider], [200, "gemini"]);
assert.ok(logs.some((line) => line.includes("AI guard: durable limiter failed (boom)")), logs.join(" | "));

// 12. /health reports the fallback only when its key is present.
let health = await worker.fetch(new Request("https://w.dev/health"), ENV, {});
assert.deepStrictEqual(await health.json(), {
  ok: true,
  model: "gemini-3.5-flash-lite",
  fallback: "openai/gpt-oss-20b",
});
health = await worker.fetch(new Request("https://w.dev/health"), { GEMINI_API_KEY: "g" }, {});
assert.strictEqual((await health.json()).fallback, null);

console.log = realLog;
console.log("all fallback tests: PASS");
