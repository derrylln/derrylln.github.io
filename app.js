/* ============================================================
   FINWIRE — client-side financial news aggregator
   Vanilla JS · no build step · GitHub Pages friendly
   ============================================================ */
'use strict';

/* ============================================================
   1. CONFIG
   ============================================================ */
const CACHE_TTL       = 15 * 60 * 1000;  // 15 minutes
const AUTO_REFRESH_MS = 15 * 60 * 1000;
const OG_MAX_SCRAPES  = 9;               // how many og:image lookups per refresh
const OG_CONCURRENCY  = 3;

const LS = {
  news:   'finwire.news.v2',
  ticker: 'finwire.ticker.v2',
  read:   'finwire.read.v2',
  watch:  'finwire.watch.v2',
  lang:   'finwire.lang.v2',
  ogimg:  'finwire.ogimg.v2'
};

const SOURCES = [
  {
    id: 'bloomberg',
    label: 'Bloomberg',
    color: '#111827',
    url: 'https://news.google.com/rss/search?q=when:24h+site:bloomberg.com+markets&hl=en-US&gl=US&ceid=US:en'
  },
  {
    id: 'reuters',
    label: 'Reuters',
    color: '#7c2d12',
    url: 'https://news.google.com/rss/search?q=when:24h+site:reuters.com+business&hl=en-US&gl=US&ceid=US:en'
  },
  {
    id: 'cnbc',
    label: 'CNBC Indonesia',
    color: '#1e3a8a',
    url: 'https://www.cnbcindonesia.com/market/rss'
  },
  {
    id: 'kontan',
    label: 'Kontan',
    color: '#14532d',
    url: 'https://investasi.kontan.co.id/rss'
  },
  {
    id: 'idn',
    label: 'IDN Financials',
    color: '#4c1d95',
    url: 'https://news.google.com/rss/search?q=site:idnfinancials.com&hl=id&gl=ID&ceid=ID:id'
  }
];

const TICKERS = [
  { symbol: '^JKSE',    label: 'IHSG'      },
  { symbol: 'BBCA.JK',  label: 'BBCA'      },
  { symbol: 'BBRI.JK',  label: 'BBRI'      },
  { symbol: 'TLKM.JK',  label: 'TLKM'      },
  { symbol: 'IDR=X',    label: 'USD/IDR'   },
  { symbol: 'CL=F',     label: 'CRUDE OIL' }
];

/* ============================================================
   2. I18N
   ============================================================ */
const I18N = {
  en: {
    tagline:      'Markets · Business · Economy',
    markAllRead:  'Mark all read',
    watchPh:      'Add watchlist keyword…',
    refresh:      'Refresh',
    all:          'All',
    unreadOnly:   'Unread only',
    loading:      'Fetching latest stories…',
    noArticles:   'No articles match your filters.',
    liveLabel:    'Live',
    cacheLabel:   'Cached',
    staleLabel:   'Offline · cached',
    errorLabel:   'Could not load feeds. Check your connection.',
    updated:      'Updated',
    watch:        'Watch',
    footer:       'FINWIRE — client-side market news aggregator. Data via public RSS feeds & CORS proxies.',
    justNow:      'just now',
    minAgo:       n => `${n}m ago`,
    hourAgo:      n => `${n}h ago`,
    dayAgo:       n => `${n}d ago`,
    stories:      n => `${n} stories`,
    added:        'Added'
  },
  id: {
    tagline:      'Pasar · Bisnis · Ekonomi',
    markAllRead:  'Tandai semua dibaca',
    watchPh:      'Tambah kata kunci pantauan…',
    refresh:      'Muat ulang',
    all:          'Semua',
    unreadOnly:   'Belum dibaca',
    loading:      'Mengambil berita terbaru…',
    noArticles:   'Tidak ada berita yang cocok dengan filter Anda.',
    liveLabel:    'Langsung',
    cacheLabel:   'Cache',
    staleLabel:   'Offline · cache',
    errorLabel:   'Gagal memuat feed. Periksa koneksi Anda.',
    updated:      'Diperbarui',
    watch:        'Pantau',
    footer:       'FINWIRE — agregator berita pasar berbasis klien. Data dari RSS publik & proksi CORS.',
    justNow:      'baru saja',
    minAgo:       n => `${n}m lalu`,
    hourAgo:      n => `${n}j lalu`,
    dayAgo:       n => `${n} hari lalu`,
    stories:      n => `${n} berita`,
    added:        'Ditambahkan'
  }
};

/* ============================================================
   3. STATE
   ============================================================ */
const state = {
  articles: [],
  ticker:   [],
  filter:   'all',
  unreadOnly: false,
  lang:     'en',
  read:     new Set(),
  watch:    [],
  lastTs:   0,
  loading:  false
};

/* ============================================================
   4. SMALL UTILITIES
   ============================================================ */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.prototype.slice.call(root.querySelectorAll(sel));

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('[FINWIRE] localStorage write failed:', e);
    return false;
  }
}

function timeAgo(ts, lang) {
  const t = I18N[lang] || I18N.en;
  const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 60)   return t.justNow;
  const mins = Math.floor(secs / 60);
  if (mins < 60)   return t.minAgo(mins);
  const hours = Math.floor(mins / 60);
  if (hours < 24)  return t.hourAgo(hours);
  const days = Math.floor(hours / 24);
  return t.dayAgo(days);
}

function stripHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(String(html), 'text/html');
  doc.querySelectorAll('script, style, noscript').forEach(n => n.remove());
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/* ============================================================
   5. CORS PROXY LAYER
   ------------------------------------------------------------
   Every outbound request goes through one of several public
   CORS proxies. We remember the last one that worked and try
   it first on subsequent calls (fast path), falling back to
   the rest if it starts failing.
   ============================================================ */
const PROXIES = [
  (u) => `https://finwire-proxy.derrylnnn.workers.dev/?url=${encodeURIComponent(u)}`,
  (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`
];

let preferredProxy = 0;

async function fetchViaProxy(targetUrl, options) {
  const opts    = options || {};
  const timeout = opts.timeout || 15000;

  const order = [];
  for (let i = 0; i < PROXIES.length; i++) {
    order.push((preferredProxy + i) % PROXIES.length);
  }

  let lastError = null;

  for (let k = 0; k < order.length; k++) {
    const idx = order[k];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(PROXIES[idx](targetUrl), {
        signal: controller.signal,
        method: 'GET',
        headers: { 'Accept': '*/*' },
        redirect: 'follow',
        credentials: 'omit',
        mode: 'cors'
      });

      if (!res.ok) throw new Error('HTTP ' + res.status);

      let text = await res.text();
      if (!text || text.length < 30) throw new Error('Empty response');

      // Unwrap the allorigins JSON envelope if present.
      if (text.trim().charAt(0) === '{') {
        try {
          const parsed = JSON.parse(text);
          if (parsed && typeof parsed.contents === 'string' && parsed.contents.length) {
            text = parsed.contents;
          }
        } catch (e) { /* not an envelope — raw JSON payload, keep as-is */ }
      }

      preferredProxy = idx;      // remember the winner
      return text;
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('All CORS proxies failed');
}

/* ============================================================
   6. RSS PARSING
   ============================================================ */
function firstTag(node, names) {
  for (let i = 0; i < names.length; i++) {
    const list = node.getElementsByTagName(names[i]);
    if (list && list.length) return list[0];
  }
  return null;
}

function textOf(node, names) {
  const el = firstTag(node, names);
  if (!el) return '';
  const value = (el.textContent || '').trim();
  return value;
}

function linkOf(node) {
  const el = firstTag(node, ['link']);
  if (!el) return '';
  const href = el.getAttribute && el.getAttribute('href');
  if (href && href.trim()) return href.trim();
  return (el.textContent || '').trim();
}

function extractImage(node, rawDescription) {
  // media:thumbnail
  let el = firstTag(node, ['media:thumbnail', 'thumbnail']);
  if (!el) {
    const ns = node.getElementsByTagNameNS && node.getElementsByTagNameNS('*', 'thumbnail');
    if (ns && ns.length) el = ns[0];
  }
  if (el) {
    const u = el.getAttribute('url') || el.getAttribute('href');
    if (u) return u;
  }

  // media:content
  const contents = node.getElementsByTagName('media:content');
  for (let i = 0; i < contents.length; i++) {
    const u = contents[i].getAttribute('url');
    const type = contents[i].getAttribute('type') || '';
    const medium = contents[i].getAttribute('medium') || '';
    if (u && (type.indexOf('image') === 0 || medium === 'image' ||
        /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u))) {
      return u;
    }
  }

  // enclosure
  const enclosures = node.getElementsByTagName('enclosure');
  for (let i = 0; i < enclosures.length; i++) {
    const u = enclosures[i].getAttribute('url');
    const type = enclosures[i].getAttribute('type') || '';
    if (u && (type.indexOf('image') === 0 ||
        /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u))) {
      return u;
    }
  }

  // <img> inside the description HTML
  if (rawDescription) {
    const m = rawDescription.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
    if (m && m[1]) return m[1];
  }

  return '';
}

function cleanTitle(title, node) {
  let t = (title || '').trim();
  const srcEl = firstTag(node, ['source']);
  if (srcEl) {
    const publisher = (srcEl.textContent || '').trim();
    if (publisher && t.endsWith(' - ' + publisher)) {
      t = t.slice(0, t.length - (publisher.length + 3)).trim();
    }
  }
  return t;
}

function parseFeed(xmlText, source) {
  if (typeof xmlText !== 'string' || xmlText.indexOf('<') === -1) {
    throw new Error('Not XML');
  }

  const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new Error('XML parse error');
  }

  let nodes = Array.prototype.slice.call(doc.getElementsByTagName('item'));
  if (!nodes.length) {
    nodes = Array.prototype.slice.call(doc.getElementsByTagName('entry')); // Atom
  }

  const out = [];

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];

    const rawTitle = textOf(node, ['title']);
    const link     = linkOf(node);
    if (!rawTitle || !link) continue;

    const title = cleanTitle(rawTitle, node);

    const rawDesc = textOf(node, ['description', 'summary', 'content']);
    let summary = stripHtml(rawDesc);
    if (summary.length > 280) summary = summary.slice(0, 277).trim() + '…';

    const dateStr = textOf(node, ['pubDate', 'published', 'updated', 'dc:date', 'date']);
    let ts = Date.parse(dateStr);
    if (!isFinite(ts)) ts = Date.now();

    const image = extractImage(node, rawDesc);

    out.push({
      id: link,
      title: title,
      link: link,
      summary: summary,
      image: image || '',
      ts: ts,
      sourceId: source.id,
      sourceLabel: source.label,
      color: source.color
    });
  }

  return out;
}

/* ============================================================
   7. FETCHING NEWS
   ============================================================ */
function dedupe(articles) {
  const seenLinks = new Set();
  const seenTitles = new Set();
  const out = [];

  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    const linkKey = a.link.split('?')[0];
    const titleKey = a.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 90);

    if (seenLinks.has(linkKey) || seenTitles.has(titleKey)) continue;
    seenLinks.add(linkKey);
    seenTitles.add(titleKey);
    out.push(a);
  }
  return out;
}

async function fetchAllNews() {
  const settled = await Promise.allSettled(
    SOURCES.map(async (source) => {
      // Change the timeout from 16000 to 7000
      const xml = await fetchViaProxy(source.url, { timeout: 7000 });
      return parseFeed(xml, source);
    })
  );

  const all = [];

  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      all.push.apply(all, result.value);
    } else {
      console.warn('[FINWIRE] feed failed:', SOURCES[i].id, result.reason && result.reason.message);
    }
  });

  if (!all.length) throw new Error('No feeds returned data');

  return dedupe(all).sort((a, b) => b.ts - a.ts);   // strictly newest → oldest
}

/* ============================================================
   8. OG:IMAGE SCRAPING (fallback thumbnails)
   ============================================================ */
const ogCache = loadJSON(LS.ogimg, {});

function isJunkImage(url) {
  return /google\.com|gstatic|googleusercontent|ggpht\.com|doubleclick|feedburner|gravatar|placeholder/i.test(url)
      || /^data:/i.test(url);
}

async function scrapeOgImage(articleUrl) {
  if (Object.prototype.hasOwnProperty.call(ogCache, articleUrl)) {
    return ogCache[articleUrl];
  }

  let found = '';

  try {
    const html = await fetchViaProxy(articleUrl, { timeout: 12000 });

    const patterns = [
      /<meta[^>]+(?:property|name)\s*=\s*["']og:image(?::url|:secure_url)?["'][^>]*content\s*=\s*["']([^"']+)["']/i,
      /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*(?:property|name)\s*=\s*["']og:image(?::url|:secure_url)?["']/i,
      /<meta[^>]+(?:property|name)\s*=\s*["']twitter:image(?::src)?["'][^>]*content\s*=\s*["']([^"']+)["']/i,
      /<link[^>]+rel\s*=\s*["']image_src["'][^>]*href\s*=\s*["']([^"']+)["']/i
    ];

    for (let i = 0; i < patterns.length; i++) {
      const m = html.match(patterns[i]);
      if (m && m[1]) { found = m[1]; break; }
    }

    if (found) {
      try { found = new URL(found, articleUrl).href; } catch (e) { found = ''; }
      if (found && isJunkImage(found)) found = '';
    }
  } catch (e) {
    found = '';
  }

  ogCache[articleUrl] = found;
  return found;
}

async function enrichImages(articles) {
  const candidates = articles
    .filter(a => !a.image)
    .slice(0, OG_MAX_SCRAPES);

  if (!candidates.length) return false;

  const queue = candidates.slice();
  let changed = false;

  async function worker() {
    while (queue.length) {
      const article = queue.shift();
      const img = await scrapeOgImage(article.link);
      if (img) {
        article.image = img;
        changed = true;
      }
    }
  }

  const workers = [];
  for (let i = 0; i < OG_CONCURRENCY; i++) workers.push(worker());
  await Promise.all(workers);

  // Keep the og cache bounded.
  const keys = Object.keys(ogCache);
  if (keys.length > 400) {
    const trimmed = {};
    keys.slice(-300).forEach(k => { trimmed[k] = ogCache[k]; });
    Object.keys(ogCache).forEach(k => { delete ogCache[k]; });
    Object.keys(trimmed).forEach(k => { ogCache[k] = trimmed[k]; });
  }

  saveJSON(LS.ogimg, ogCache);
  return changed;
}

/* ============================================================
   9. TICKER FETCHING
   ============================================================ */
async function fetchTicker() {
  const settled = await Promise.allSettled(
    TICKERS.map(async (t) => {
      const url = 'https://query1.finance.yahoo.com/v8/finance/chart/'
                + encodeURIComponent(t.symbol) + '?interval=1d&range=5d';

      const raw = await fetchViaProxy(url, { timeout: 12000 });
      const data = JSON.parse(raw);
      const meta = data && data.chart && data.chart.result && data.chart.result[0] && data.chart.result[0].meta;

      if (!meta || typeof meta.regularMarketPrice !== 'number') {
        throw new Error('No price for ' + t.symbol);
      }

      const price = meta.regularMarketPrice;
      const prev = (typeof meta.chartPreviousClose === 'number') ? meta.chartPreviousClose
                 : (typeof meta.previousClose === 'number') ? meta.previousClose
                 : price;

      const change = prev ? ((price - prev) / prev) * 100 : 0;

      return { label: t.label, symbol: t.symbol, price: price, change: change };
    })
  );

  const cached = loadJSON(LS.ticker, null);
  const cachedMap = {};
  if (cached && cached.items) cached.items.forEach(it => { cachedMap[it.symbol] = it; });

  const out = settled.map((res, i) => {
    if (res.status === 'fulfilled') return res.value;
    const fallback = cachedMap[TICKERS[i].symbol];
    return fallback || { label: TICKERS[i].label, symbol: TICKERS[i].symbol, price: null, change: null };
  });

  return out;
}

/* ============================================================
   10. RENDERING — TICKER
   ============================================================ */
function renderTicker(items) {
  const track = $('#tickerTrack');
  if (!track) return;

  if (!items || !items.length) { track.innerHTML = ''; return; }

  const locale = state.lang === 'id' ? 'id-ID' : 'en-US';

  const unit = items.map(t => {
    let priceTxt = '—';
    if (typeof t.price === 'number') {
      const digits = t.price >= 1000 ? 2 : (t.price >= 10 ? 2 : 4);
      priceTxt = t.price.toLocaleString(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: digits
      });
    }

    let changeTxt = '—';
    let dir = 'flat';
    if (typeof t.change === 'number' && isFinite(t.change)) {
      dir = t.change > 0 ? 'up' : (t.change < 0 ? 'down' : 'flat');
      changeTxt = (dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : '') +
                  Math.abs(t.change).toFixed(2) + '%';
    }

    return '<span class="tk">'
         +   '<span class="tk-sym">' + esc(t.label) + '</span>'
         +   '<span class="tk-price">' + esc(priceTxt) + '</span>'
         +   '<span class="tk-chg ' + dir + '">' + esc(changeTxt) + '</span>'
         + '</span>';
  }).join('');

  // Repeat enough sets so the marquee never shows a gap.
  track.style.animation = 'none';
  track.innerHTML = unit;
  const singleWidth = track.scrollWidth || 1;
  const viewport = window.innerWidth || 1280;

  let reps = 1;
  while (singleWidth * reps < viewport * 1.6 && reps < 24) reps++;

  track.innerHTML = unit.repeat(reps) + unit.repeat(reps);
  track.style.animationDuration = Math.max(35, reps * items.length * 5) + 's';
  // Re-trigger the CSS animation.
  void track.offsetWidth;
  track.style.animation = '';
}

/* ============================================================
   11. RENDERING — ARTICLES
   ============================================================ */
function matchWatch(article) {
  if (!state.watch.length) return false;
  const haystack = (article.title + ' ' + article.summary).toLowerCase();
  for (let i = 0; i < state.watch.length; i++) {
    const kw = state.watch[i];
    if (kw && haystack.indexOf(kw.toLowerCase()) !== -1) return true;
  }
  return false;
}

function cardHTML(article, variant) {
  const t = I18N[state.lang];
  const isRead = state.read.has(article.link);
  const isHit = matchWatch(article);

  const classes = [
    'card',
    variant || 'grid',
    isRead ? 'read' : 'unread',
    isHit ? 'hit' : ''
  ].filter(Boolean).join(' ');

  const thumbInner = article.image
    ? '<img src="' + esc(article.image) + '" alt="" loading="lazy" decoding="async" '
      + 'referrerpolicy="no-referrer" onerror="this.remove()">'
    : '';

  const thumb = '<span class="thumb" style="--cat:' + esc(article.color) + '">'
              +   '<span class="thumb-fb">' + esc(article.sourceLabel) + '</span>'
              +   thumbInner
              + '</span>';

  const summary = (variant !== 'side' && article.summary)
    ? '<p class="summary">' + esc(article.summary) + '</p>'
    : '';

  const watchBadge = isHit
    ? '<span class="badge-watch">' + esc(t.watch) + '</span>'
    : '';

  const dot = isRead ? '' : '<span class="unread-dot" aria-hidden="true"></span>';

  return '<a class="' + classes + '" href="' + esc(article.link) + '" target="_blank" '
       +   'rel="noopener noreferrer" data-url="' + esc(article.link) + '">'
       +   thumb
       +   '<div class="card-body">'
       +     '<div class="meta">'
       +       '<span class="src">' + esc(article.sourceLabel) + '</span>'
       +       '<span class="sep">•</span>'
       +       '<time class="ago" data-ts="' + article.ts + '">' + esc(timeAgo(article.ts, state.lang)) + '</time>'
       +       watchBadge
       +     '</div>'
       +     '<h2 class="headline">' + esc(article.title) + '</h2>'
       +     summary
       +   '</div>'
       +   dot
       + '</a>';
}

function currentArticles() {
  let list = state.articles.slice();
  if (state.filter !== 'all') {
    list = list.filter(a => a.sourceId === state.filter);
  }
  if (state.unreadOnly) {
    list = list.filter(a => !state.read.has(a.link));
  }
  return list;
}

function render() {
  const heroEl = $('#hero');
  const gridEl = $('#grid');
  const t = I18N[state.lang];

  const list = currentArticles();

  if (!list.length) {
    heroEl.innerHTML = '';
    gridEl.innerHTML = '<div class="empty">' + esc(t.noArticles) + '</div>';
    return;
  }

  // Hero = most recent article that actually has an image.
  let heroIndex = list.findIndex(a => !!a.image);
  if (heroIndex < 0) heroIndex = 0;

  const hero = list[heroIndex];
  const rest = list.slice(0, heroIndex).concat(list.slice(heroIndex + 1));
  const side = rest.slice(0, 2);
  const grid = rest.slice(2);

  heroEl.innerHTML =
      '<div class="hero-main">' + cardHTML(hero, 'hero') + '</div>'
    + '<div class="hero-side">' + side.map(a => cardHTML(a, 'side')).join('') + '</div>';

  gridEl.innerHTML = grid.map(a => cardHTML(a, 'grid')).join('');
}

function refreshTimes() {
  const t = I18N[state.lang];
  $$('.ago[data-ts]').forEach(el => {
    const ts = parseInt(el.getAttribute('data-ts'), 10);
    if (!isNaN(ts)) el.textContent = timeAgo(ts, state.lang);
  });
  if (state.lastTs) updateStatusLabel(state.lastKind || 'live', state.lastTs);
}

function updateStatusLabel(kind, ts) {
  const el = $('#status');
  if (!el) return;
  const t = I18N[state.lang];

  if (kind === 'loading') {
    el.className = 'status loading';
    el.textContent = t.loading;
    return;
  }
  if (kind === 'error') {
    el.className = 'status stale';
    el.innerHTML = '<span class="dot stale"></span>' + esc(t.errorLabel);
    return;
  }

  const label = kind === 'live' ? t.liveLabel : (kind === 'cached' ? t.cacheLabel : t.staleLabel);

  el.className = 'status ' + kind;
  el.innerHTML = '<span class="dot ' + kind + '"></span>'
               + esc(label) + ' · ' + esc(t.updated) + ' ' + esc(timeAgo(ts, state.lang))
               + ' · ' + esc(t.stories(state.articles.length));
}

/* ============================================================
   12. RENDERING — FILTERS & WATCH CHIPS
   ============================================================ */
function renderFilters() {
  const bar = $('#filters');
  if (!bar) return;
  const t = I18N[state.lang];

  const sourceChips = SOURCES.map(s =>
    '<button type="button" class="chip' + (state.filter === s.id ? ' active' : '') + '" '
    + 'data-filter="' + esc(s.id) + '">' + esc(s.label) + '</button>'
  ).join('');

  bar.innerHTML =
      '<div class="filters-inner">'
    +   '<button type="button" class="chip' + (state.filter === 'all' ? ' active' : '') + '" '
    +     'data-filter="all">' + esc(t.all) + '</button>'
    +   sourceChips
    +   '<span class="spacer"></span>'
    +   '<label class="switch">'
    +     '<input type="checkbox" id="unreadToggle"' + (state.unreadOnly ? ' checked' : '') + '>'
    +     '<span>' + esc(t.unreadOnly) + '</span>'
    +   '</label>'
    + '</div>';
}

function renderWatchChips() {
  const el = $('#watchChips');
  if (!el) return;

  el.innerHTML = state.watch.map((kw, i) =>
    '<span class="chip-watch">' + esc(kw)
    + '<button type="button" data-remove-watch="' + i + '" aria-label="Remove ' + esc(kw) + '">×</button>'
    + '</span>'
  ).join('');
}

/* ============================================================
   13. LANGUAGE
   ============================================================ */
function applyLang() {
  const t = I18N[state.lang];

  document.documentElement.lang = state.lang;

  $$('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key]) el.textContent = t[key];
  });

  $$('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    if (t[key]) el.setAttribute('placeholder', t[key]);
  });

  $$('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (t[key]) el.setAttribute('title', t[key]);
  });

  $$('.lang-toggle button').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-lang') === state.lang);
  });

  renderFilters();
  renderTicker(state.ticker);
  render();
  refreshTimes();
}

/* ============================================================
   14. PERSISTENCE HELPERS
   ============================================================ */
function persistRead() {
  const arr = Array.from(state.read);
  if (arr.length > 1000) arr.splice(0, arr.length - 1000);
  saveJSON(LS.read, arr);
}

function persistWatch() {
  saveJSON(LS.watch, state.watch);
}

/* ============================================================
   15. DATA LOADING ORCHESTRATION
   ============================================================ */
async function loadNews(force) {
  const cached = loadJSON(LS.news, null);
  
  // 1. INSTANTLY load from cache (even if expired) so the user sees data immediately
  if (cached && cached.articles && cached.articles.length > 0) {
    state.articles = cached.articles;
    state.lastTs = cached.ts;
    state.lastKind = 'cached';
    render();
    updateStatusLabel('cached', cached.ts);
    
    // If it's fresh, we stop here and don't fetch.
    if (!force && (Date.now() - cached.ts) < CACHE_TTL) return;
  } else {
    // Only show loading if we have NO cache at all
    updateStatusLabel('loading');
  }

  // 2. Fetch fresh data in the background
  try {
    const articles = await fetchAllNews();
    
    // Check if data actually changed before re-rendering to prevent visual flicker
    const hasChanged = JSON.stringify(articles) !== JSON.stringify(state.articles);

    state.articles = articles;
    state.lastTs = Date.now();
    state.lastKind = 'live';

    saveJSON(LS.news, { ts: Date.now(), articles: articles });
    
    if (hasChanged) {
      render();
    }
    updateStatusLabel('live', state.lastTs);

    // 3. Scrape missing images silently in the background
    enrichImages(articles).then(changed => {
      if (!changed) return;
      saveJSON(LS.news, { ts: Date.now(), articles: articles });
      
      // Update ONLY the images directly in the DOM instead of re-rendering the whole page
      articles.forEach(a => {
        if (a.image) {
          const card = document.querySelector(`.card[data-url="${a.link}"]`);
          if (card) {
            const thumb = card.querySelector('.thumb');
            if (thumb && !thumb.querySelector('img')) {
              const img = document.createElement('img');
              img.src = a.image;
              img.loading = 'lazy';
              img.referrerPolicy = 'no-referrer';
              img.onerror = function() { this.remove(); };
              thumb.appendChild(img);
            }
          }
        }
      });
    }).catch(() => {});

  } catch (err) {
    console.warn('[FINWIRE] news load failed:', err);
    if (!cached) {
      state.articles = [];
      render();
      updateStatusLabel('error');
    }
  }
}

async function loadTicker(force) {
  const cached = loadJSON(LS.ticker, null);
  const isFresh = cached && cached.items && (Date.now() - cached.ts) < CACHE_TTL;

  if (!force && isFresh) {
    state.ticker = cached.items;
    renderTicker(state.ticker);
    return;
  }

  try {
    const items = await fetchTicker();
    state.ticker = items;
    saveJSON(LS.ticker, { ts: Date.now(), items: items });
    renderTicker(items);
  } catch (err) {
    console.warn('[FINWIRE] ticker load failed:', err);
    if (cached && cached.items) {
      state.ticker = cached.items;
      renderTicker(state.ticker);
    } else {
      renderTicker(TICKERS.map(t => ({ label: t.label, symbol: t.symbol, price: null, change: null })));
    }
  }
}

async function loadAll(force) {
  if (state.loading) return;
  state.loading = true;
  try {
    await Promise.all([ loadNews(force), loadTicker(force) ]);
  } finally {
    state.loading = false;
  }
}

/* ============================================================
   16. EVENT BINDING
   ============================================================ */
function bindUI() {
  // --- filter chips / unread toggle (delegated) ---
  $('#filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-filter]');
    if (!chip) return;
    state.filter = chip.getAttribute('data-filter');
    $$('#filters .chip').forEach(c => c.classList.toggle('active', c === chip));
    render();
  });

  $('#filters').addEventListener('change', (e) => {
    if (e.target && e.target.id === 'unreadToggle') {
      state.unreadOnly = e.target.checked;
      render();
    }
  });

  // --- language toggle ---
  $$('.lang-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      const lang = btn.getAttribute('data-lang');
      if (lang === state.lang) return;
      state.lang = lang;
      localStorage.setItem(LS.lang, lang);
      applyLang();
      if (state.lastTs) updateStatusLabel(state.lastKind || 'live', state.lastTs);
    });
  });

  // --- mark all read ---
  $('#markAllRead').addEventListener('click', () => {
    currentArticles().forEach(a => state.read.add(a.link));
    persistRead();
    render();
    refreshTimes();
  });

  // --- refresh ---
  $('#refreshBtn').addEventListener('click', () => {
    loadAll(true);
  });

  // --- watchlist add ---
  const input = $('#watchInput');
  const addKeyword = () => {
    const raw = (input.value || '').trim();
    if (!raw) return;
    const exists = state.watch.some(k => k.toLowerCase() === raw.toLowerCase());
    if (!exists) {
      state.watch.push(raw);
      persistWatch();
      renderWatchChips();
      render();
    }
    input.value = '';
  };

  $('#watchAdd').addEventListener('click', addKeyword);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addKeyword(); }
  });

  // --- watchlist remove (delegated) ---
  $('#watchChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-watch]');
    if (!btn) return;
    const idx = parseInt(btn.getAttribute('data-remove-watch'), 10);
    if (!isNaN(idx)) {
      state.watch.splice(idx, 1);
      persistWatch();
      renderWatchChips();
      render();
    }
  });

  // --- article click => mark as read ---
  document.addEventListener('click', (e) => {
    const card = e.target.closest('a.card');
    if (!card) return;
    const url = card.getAttribute('data-url');
    if (!url || state.read.has(url)) return;

    state.read.add(url);
    persistRead();

    card.classList.remove('unread');
    card.classList.add('read');
    const dot = card.querySelector('.unread-dot');
    if (dot) dot.remove();
  });

  // --- re-render ticker on resize (debounced) ---
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderTicker(state.ticker), 350);
  });

  // --- refresh relative timestamps every minute ---
  setInterval(refreshTimes, 60 * 1000);
}

/* ============================================================
   17. BOOT
   ============================================================ */
function init() {
  // Restore persisted state
  const savedLang = localStorage.getItem(LS.lang);
  state.lang = (savedLang === 'id' || savedLang === 'en') ? savedLang : 'en';

  const savedRead = loadJSON(LS.read, []);
  state.read = new Set(Array.isArray(savedRead) ? savedRead : []);

  const savedWatch = loadJSON(LS.watch, null);
  state.watch = Array.isArray(savedWatch)
    ? savedWatch
    : []; // Changed this to an empty array

  bindUI();
  renderFilters();
  renderWatchChips();
  applyLang();

  loadAll(false);

  // Auto-refresh every 15 minutes
  setInterval(() => loadAll(true), AUTO_REFRESH_MS);

  // Re-check cache freshness if the tab is restored after a long sleep
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const cached = loadJSON(LS.news, null);
      const expired = !cached || (Date.now() - cached.ts) >= CACHE_TTL;
      if (expired) loadAll(false);
      else refreshTimes();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}