/* ------------------------------------------------------------
   CORS proxies, RSS parsing, de-duplication and lead images
   ------------------------------------------------------------ */
const WORKER_BASE = 'https://finwire-smart-proxy.derrylnnn.workers.dev';
const AI_TIMEOUT_MS = 30000;
const PROXIES = [
  (u) => `${WORKER_BASE}/?url=${encodeURIComponent(u)}`
];
let preferredProxy = 0;
async function fetchViaProxy(targetUrl, options) {
  const opts = options || {}; const timeout = opts.timeout || 8000; const order = [];
  for (let i = 0; i < PROXIES.length; i++) order.push((preferredProxy + i) % PROXIES.length);
  let lastError = null;
  for (let k = 0; k < order.length; k++) {
    const idx = order[k]; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(PROXIES[idx](targetUrl), { signal: controller.signal, method: 'GET', headers: { 'Accept': '*/*' }, redirect: 'follow', credentials: 'omit', mode: 'cors' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      let text = await res.text(); if (!text || text.length < 30) throw new Error('Empty response');
      if (text.trim().charAt(0) === '{') { try { const parsed = JSON.parse(text); if (parsed && typeof parsed.contents === 'string' && parsed.contents.length) text = parsed.contents; } catch (e) {} }
      preferredProxy = idx; return text;
    } catch (err) { lastError = err; } finally { clearTimeout(timer); }
  }
  throw lastError || new Error('All CORS proxies failed');
}

/* RSS & NEWS LOGIC */
function firstTag(node, names) { for (let i = 0; i < names.length; i++) { const list = node.getElementsByTagName(names[i]); if (list && list.length) return list[0]; } return null; }
function textOf(node, names) { const el = firstTag(node, names); if (!el) return ''; return (el.textContent || '').trim(); }
function linkOf(node) { const el = firstTag(node, ['link']); if (!el) return ''; const href = el.getAttribute && el.getAttribute('href'); if (href && href.trim()) return href.trim(); return (el.textContent || '').trim(); }
function extractImage(node, rawDescription) {
  let el = firstTag(node, ['media:thumbnail', 'thumbnail']); if (!el) { const ns = node.getElementsByTagNameNS && node.getElementsByTagNameNS('*', 'thumbnail'); if (ns && ns.length) el = ns[0]; }
  if (el) { const u = el.getAttribute('url') || el.getAttribute('href'); if (u) return u; }
  const contents = node.getElementsByTagName('media:content');
  for (let i = 0; i < contents.length; i++) { const u = contents[i].getAttribute('url'); const type = contents[i].getAttribute('type') || ''; if (u && (type.indexOf('image') === 0 || /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u))) return u; }
  // CNN/CNBC and IDN Financials ship the photo as an RSS enclosure instead.
  const enclosures = node.getElementsByTagName('enclosure');
  for (let i = 0; i < enclosures.length; i++) {
    const u = enclosures[i].getAttribute('url'); const type = enclosures[i].getAttribute('type') || '';
    if (u && (type.indexOf('image') === 0 || /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u))) return u;
  }
  if (rawDescription) { const m = rawDescription.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i); if (m && m[1]) return m[1]; }
  return '';
}
function cleanTitle(title, node) { let t = (title || '').trim(); const srcEl = firstTag(node, ['source']); if (srcEl) { const p = (srcEl.textContent || '').trim(); if (p && t.endsWith(' - ' + p)) t = t.slice(0, t.length - (p.length + 3)).trim(); } return t; }

/* Feeds state their own offset ("... +0700", "... GMT"). rss2json drops it and
   returns "YYYY-MM-DD HH:mm:ss" in the publisher's clock, which browsers read as
   *local* time. On a UTC+7 machine that made every Google News story look 7 hours
   older than it was — a headline posted minutes ago read "7h ago" — so a
   zone-less timestamp is resolved explicitly instead of left to the browser:
   UTC, or the source's own zone where the feed is known to publish in WIB. */
const ZONE_SUFFIX = { WIB: '+07:00', WITA: '+08:00', WIT: '+09:00' };

function parseFeedDate(value, source) {
  let str = String(value || '').trim();
  if (!str) return NaN;
  const named = /\b(WIB|WITA|WIT)\b/i.exec(str);
  if (named) str = str.replace(named[0], ZONE_SUFFIX[named[1].toUpperCase()]);
  const zone = (source && source.zone) || '+00:00';
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2}|\b(?:GMT|UTC|UT)\b)\s*$/i.test(str);
  if (!hasZone) {
    const naive = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(str);
    if (naive) {
      const ts = Date.parse(`${naive[1]}-${naive[2]}-${naive[3]}T${naive[4]}:${naive[5]}:${naive[6] || '00'}${zone}`);
      if (isFinite(ts)) return ts;
    }
    if (/\d{2}:\d{2}/.test(str)) {
      const ts = Date.parse(str + ' ' + zone.replace(':', ''));
      if (isFinite(ts)) return ts;
    }
  }
  return Date.parse(str);
}

function parseFeed(rawText, source) {
  if (rawText.trim().charAt(0) === '{') {
    try {
      const data = JSON.parse(rawText); 
      if (data.status !== 'ok' || !data.items) throw new Error('JSON API error');
      return data.items.map(item => {
        let imgUrl = item.thumbnail || (item.enclosure && item.enclosure.link) || '';
        if (!imgUrl && item.description) { const m = item.description.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i); if (m && m[1]) imgUrl = m[1]; }
        
        const art = { id: item.link, title: item.title, link: item.link, summary: stripHtml(item.description), image: imgUrl, ts: parseFeedDate(item.pubDate, source) || Date.now(), sourceId: source.id, sourceLabel: source.label, color: source.color };
        art.category = categorizeArticle(art);
        return art;
      });
    } catch (e) { return []; }
  }
  const doc = new DOMParser().parseFromString(rawText, 'text/xml');
  let nodes = Array.prototype.slice.call(doc.getElementsByTagName('item'));
  if (!nodes.length) nodes = Array.prototype.slice.call(doc.getElementsByTagName('entry'));
  const out = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]; const rawTitle = textOf(node, ['title']); const link = linkOf(node); if (!rawTitle || !link) continue;
    const title = cleanTitle(rawTitle, node); const rawDesc = textOf(node, ['description', 'summary', 'content']);
    let summary = stripHtml(rawDesc); if (summary.length > 280) summary = summary.slice(0, 277).trim() + '…';
    const dateStr = textOf(node, ['pubDate', 'published', 'updated', 'dc:date', 'date']); let ts = parseFeedDate(dateStr, source); if (!isFinite(ts)) ts = Date.now();
    
    const art = { id: link, title, link, summary, image: extractImage(node, rawDesc) || '', ts, sourceId: source.id, sourceLabel: source.label, color: source.color };
    art.category = categorizeArticle(art);
    out.push(art);
  }
  return out;
}

function dedupe(articles) {
  const seenLinks = new Set(), seenTitles = new Set(), out = [];
  for (let i = 0; i < articles.length; i++) {
    const a = articles[i]; const linkKey = a.link.split('?')[0]; const titleKey = a.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90);
    if (seenLinks.has(linkKey) || seenTitles.has(titleKey)) continue; seenLinks.add(linkKey); seenTitles.add(titleKey); out.push(a);
  }
  return out;
}

/* Feeds are read through the Worker first: it returns the XML untouched, so the
   media:content / enclosure photo most Indonesian publishers attach is still
   there. rss2json is only the fallback for feeds the Worker cannot reach — it
   strips media:content, returns 10 items, and rate-limits when every refresh is
   converted as a brand-new feed (the old cache-buster did exactly that). */
async function fetchFeed(source) {
  const busted = source.url + (source.url.includes('?') ? '&' : '?') + `_t=${Date.now()}`;
  let lastError = null;
  try {
    const items = parseFeed(await fetchViaProxy(busted, { timeout: 7000 }), source);
    if (items.length) return items;
  } catch (err) { lastError = err; }
  try {
    const url = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}`;
    const res = await fetch(url); if (!res.ok) throw new Error('rss2json HTTP ' + res.status);
    return parseFeed(await res.text(), source);
  } catch (err) { lastError = err; }
  throw lastError || new Error('Feed unavailable');
}

async function fetchAllNews() {
  let newArticlesFound = false;
  await Promise.allSettled(SOURCES.map(async (source) => {
    try {
      const items = await fetchFeed(source);
      if (items.length > 0) {
        const cutoff = Date.now() - NEWS_MAX_AGE_MS;
        state.articles = dedupe([...items, ...state.articles])
          .filter(a => a.ts >= cutoff)
          .sort((a, b) => b.ts - a.ts).slice(0, MAX_ARTICLES);
        newArticlesFound = true; render(); backfillImages(items);
      }
    } catch (err) { console.warn('[FINWIRE] feed failed:', source.id, err.message); }
  }));
  if (!newArticlesFound && state.articles.length === 0) throw new Error('No feeds returned data');
  backfillAllImages();
}

/* IMAGE BACKFILL
   A feed carries a photo only sometimes: Antara, CNN, CNBC, MarketWatch and IDN
   attach one, Kontan attaches none at all. For the ones that attach none we read
   the article page and take its own preview image (og:image, twitter:image,
   image_src or the first real content <img>). Two rules keep that honest:
   - a hit is cached for good, a miss only for OG_FAIL_TTL, so a publisher that was
     briefly unreachable gets another chance next visit (the old code cached ''
     forever, so one timeout removed that card's photo permanently);
   - the backfill also covers cached articles, not just the newest fetch.
   Google News links (Reuters) are opaque redirect stubs that only resolve in a
   browser, so they cannot yield a photo; those cards keep the label tile. */
const OG_FAIL_TTL      = 30 * 60 * 1000;
const OG_CACHE_LIMIT   = 2500;
const OG_SCRAPE_BUDGET = 200;
const OG_CONCURRENCY   = 4;

const ogCache = (function () {
  const stored = loadJSON(LS.ogimg, {});
  const out = {};
  Object.keys(stored || {}).forEach(function (key) {
    const value = stored[key];
    if (typeof value === 'string') { if (value) out[key] = { img: value, at: Date.now() }; }
    else if (value && typeof value.img === 'string') out[key] = value;
  });
  return out;
})();

let ogSaveTimer = null;
function scheduleOgSave() {
  if (ogSaveTimer) return;
  ogSaveTimer = setTimeout(function () {
    ogSaveTimer = null;
    const keys = Object.keys(ogCache);
    if (keys.length > OG_CACHE_LIMIT) {
      keys.sort(function (a, b) { return (ogCache[a].at || 0) - (ogCache[b].at || 0); })
        .slice(0, keys.length - OG_CACHE_LIMIT)
        .forEach(function (key) { delete ogCache[key]; });
    }
    saveJSON(LS.ogimg, ogCache);
  }, 1500);
}

function isJunkImage(url) {
  return /google\.com|gstatic|googleusercontent|ggpht\.com|doubleclick|feedburner|gravatar|placeholder|sprite|pixel\.(gif|png)|spacer\.(gif|png)/i.test(url) || /^data:/i.test(url);
}

function normalizeImageUrl(raw, base) {
  let url = String(raw || '').trim().replace(/&amp;/g, '&');
  if (!url) return '';
  if (url.indexOf('//') === 0) url = 'https:' + url;
  if (/\s/.test(url)) url = url.split(/\s+/)[0];
  try { url = new URL(url, base).href; } catch (e) { return ''; }
  if (!/^https?:/i.test(url)) return '';
  return isJunkImage(url) ? '' : url;
}
const OG_META = /<meta[^>]+(?:property|name)\s*=\s*["'](?:og:image(?::url|:secure_url)?|twitter:image(?::src)?)["'][^>]*content\s*=\s*["']([^"']+)["']/i;
const OG_META_REVERSED = /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*(?:property|name)\s*=\s*["'](?:og:image(?::url|:secure_url)?|twitter:image(?::src)?)["']/i;

function imageFromHtml(html, base) {
  const text = String(html || '');
  const direct = [OG_META, OG_META_REVERSED];
  for (let i = 0; i < direct.length; i++) {
    const m = text.match(direct[i]);
    const url = m && normalizeImageUrl(m[1], base);
    if (url) return url;
  }
  const link = /<link[^>]+rel\s*=\s*["']image_src["'][^>]*href\s*=\s*["']([^"']+)["']/i.exec(text);
  if (link) { const url = normalizeImageUrl(link[1], base); if (url) return url; }
  const jsonLd = /"image"\s*:\s*(?:"([^"]+)"|\[\s*"([^"]+)"|\{[^}]{0,160}?"url"\s*:\s*"([^"]+)")/i.exec(text);
  if (jsonLd) { const url = normalizeImageUrl(jsonLd[1] || jsonLd[2] || jsonLd[3], base); if (url) return url; }
  // Last resort: the first real content image. Icons declare a tiny width/height
  // or live under a logo/icon path, so those are skipped.
  const tags = text.match(/<img\b[^>]*>/gi) || [];
  for (let i = 0; i < tags.length && i < 40; i++) {
    if (/(?:width|height)\s*=\s*["']?([0-9]{1,2})\b/i.test(tags[i])) continue;
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tags[i]) || /\bdata-src\s*=\s*["']([^"']+)["']/i.exec(tags[i]);
    const url = src && normalizeImageUrl(src[1], base);
    if (url && !/logo|icon|badge|avatar|emoji|\/ads?\//i.test(url)) return url;
  }
  return '';
}

let ogScrapes = 0;

// Bloomberg and Tempo answer 403 to any datacenter request, so after a few dead
// ends the rest of that publisher's articles are skipped for this session
// instead of asked one by one.
const ogHostFails = new Map();

async function scrapeOgImage(articleUrl) {
  const cached = ogCache[articleUrl];
  if (cached && (cached.img || (Date.now() - (cached.at || 0)) < OG_FAIL_TTL)) return cached.img || '';

  let host = '';
  try { host = new URL(articleUrl).hostname; } catch (e) { return ''; }
  if (/(^|\.)news\.google\.com$/i.test(host)) return '';
  if ((ogHostFails.get(host) || 0) >= 3) return '';
  if (ogScrapes >= OG_SCRAPE_BUDGET) return '';
  ogScrapes++;

  let found = '';
  try { found = imageFromHtml(await fetchViaProxy(articleUrl, { timeout: 6000 }), articleUrl); }
  catch (e) { found = ''; }
  if (found) ogHostFails.delete(host); else ogHostFails.set(host, (ogHostFails.get(host) || 0) + 1);
  ogCache[articleUrl] = { img: found, at: Date.now() };
  scheduleOgSave();
  return found;
}

const ogQueue = [];
const ogQueued = new Set();
let ogActive = 0;

function backfillImages(articles) {
  if (!articles || !articles.length) return;
  for (let i = 0; i < articles.length; i++) {
    if (ogQueue.length >= OG_SCRAPE_BUDGET) break;
    const article = articles[i];
    if (!article || !article.link || article.image || ogQueued.has(article.link)) continue;
    ogQueued.add(article.link);
    ogQueue.push(article);
  }
  pumpImageQueue();
}

function pumpImageQueue() {
  while (ogActive < OG_CONCURRENCY && ogQueue.length) {
    const article = ogQueue.shift();
    ogActive++;
    scrapeOgImage(article.link).then(function (img) {
      if (!img) return;
      article.image = img;
      applyImageToCards(article.link, img);
      scheduleImageSave();
    }).catch(function () {}).finally(function () { ogActive--; pumpImageQueue(); });
  }
}

// Articles are cached too, so a photo found after first paint has to reach the
// saved list, not just the live object.
let imageSaveTimer = null;
function scheduleImageSave() {
  if (imageSaveTimer) return;
  imageSaveTimer = setTimeout(function () {
    imageSaveTimer = null;
    const cached = loadJSON(LS.news, null);
    if (!cached || !Array.isArray(cached.articles)) return;
    const byLink = new Map();
    state.articles.forEach(function (a) { if (a.image) byLink.set(a.link, a.image); });
    let changed = false;
    cached.articles.forEach(function (a) {
      const img = byLink.get(a.link);
      if (img && img !== a.image) { a.image = img; changed = true; }
    });
    if (changed) saveJSON(LS.news, cached); // keeps the original cache timestamp
  }, 3000);
}

function applyImageToCards(link, img) {
  const cards = $$('.card');
  for (let i = 0; i < cards.length; i++) {
    if (cards[i].getAttribute('data-url') !== link) continue;
    const thumb = cards[i].querySelector('.thumb');
    if (!thumb || thumb.querySelector('img')) continue;
    const imgEl = document.createElement('img');
    imgEl.src = img; imgEl.alt = ''; imgEl.loading = 'lazy'; imgEl.decoding = 'async';
    imgEl.referrerPolicy = 'no-referrer';
    imgEl.onerror = function () { this.remove(); };
    thumb.appendChild(imgEl);
  }
}

// On-screen cards first, then the rest of the cached list.
function backfillAllImages() {
  const visible = currentArticles();
  const visibleLinks = new Set(visible.map(function (a) { return a.link; }));
  backfillImages(visible);
  backfillImages(state.articles.filter(function (a) { return !visibleLinks.has(a.link); }));
}

/* TICKER & NEWS RENDERING */
