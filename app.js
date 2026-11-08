/* ============================================================
   FINWIRE — client-side financial news aggregator
   ============================================================ */
'use strict';

const CACHE_TTL       = 15 * 60 * 1000;
const AUTO_REFRESH_MS = 15 * 60 * 1000;
const OG_MAX_SCRAPES  = 10; 

const LS = {
  news: 'finwire.news.v3', ticker: 'finwire.ticker.v3', read: 'finwire.read.v2',
  watch: 'finwire.watch.v2', lang: 'finwire.lang.v2', ogimg: 'finwire.ogimg.v2'
};

const SOURCES = [
  { id: 'bloomberg', label: 'Bloomberg', color: '#111827', url: 'https://feeds.bloomberg.com/markets/news.rss', useJsonApi: true },
  { id: 'reuters', label: 'Reuters', color: '#7c2d12', url: 'https://news.google.com/rss/search?q=when:24h+site:reuters.com/business&hl=en-US&gl=US&ceid=US:en', useJsonApi: true },
  { id: 'marketwatch', label: 'MarketWatch', color: '#059669', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', useJsonApi: true },
  
  // Indonesian Sources
  { id: 'cnbc', label: 'CNBC Indonesia', color: '#e11d48', url: 'https://www.cnbcindonesia.com/market/rss', useJsonApi: true },
  { id: 'kontan', label: 'Kontan', color: '#14532d', url: 'https://investasi.kontan.co.id/rss', useJsonApi: true },
  { id: 'idn', label: 'IDN Financials', color: '#4c1d95', url: 'https://news.google.com/rss/search?q=site:idnfinancials.com&hl=id&gl=ID&ceid=ID:id', useJsonApi: true },
  { id: 'antara', label: 'Antara Ekonomi', color: '#b91c1c', url: 'https://www.antaranews.com/rss/ekonomi', useJsonApi: true },
  { id: 'cnn_id', label: 'CNN Ekonomi', color: '#dc2626', url: 'https://www.cnnindonesia.com/ekonomi/rss', useJsonApi: true },
  { id: 'tempo', label: 'Tempo Bisnis', color: '#ea580c', url: 'https://rss.tempo.co/bisnis', useJsonApi: true }
];

const TICKERS = [
  { symbol: '^JKSE', label: 'IHSG' }, 
  { symbol: '^GSPC', label: 'S&P 500' },
  { symbol: '^IXIC', label: 'NASDAQ' },
  { symbol: 'IDR=X', label: 'USD/IDR' },
  { symbol: 'SGD=X', label: 'USD/SGD' },
  { symbol: 'CHF=X', label: 'USD/CHF' },
  { symbol: '^TNX', label: 'US 10Y' },
  { symbol: 'GC=F', label: 'GOLD' },
  { symbol: 'CL=F', label: 'CRUDE OIL' },
  { symbol: 'BTC-USD', label: 'BITCOIN' }
];

const INDICES = [
  { symbol: '^JKSE', name: 'IHSG' }, 
  { symbol: '^IXIC', name: 'NASDAQ' }, 
  { symbol: '^DJI', name: 'DOW JONES' }
];

const MACRO = [
  { symbol: 'IDR=X', name: 'USD/IDR' }, { symbol: 'GC=F', name: 'Gold' }, 
  { symbol: 'CL=F', name: 'Crude Oil' }, { symbol: '^TNX', name: 'US 10Y Yield' }, 
  { symbol: 'BTC-USD', name: 'Bitcoin' }
];

const ECON_INDICATORS = [
  { symbol: '^VIX', name: 'CBOE Volatility (VIX)' },
  { symbol: '^TNX', name: 'US 10Y Treasury Yield' }
];

const IDX_POOL = [
  'BBCA.JK', 'BBRI.JK', 'BMRI.JK', 'BBNI.JK', 'TLKM.JK', 'ASII.JK', 'GOTO.JK', 'AMRT.JK', 
  'BRPT.JK', 'ANTM.JK', 'ICBP.JK', 'INDF.JK', 'KLBF.JK', 'UNVR.JK', 'ADRO.JK', 'PTBA.JK', 
  'ITMG.JK', 'MDKA.JK', 'CPIN.JK', 'JPFA.JK', 'EXCL.JK', 'ISAT.JK', 'TOWR.JK', 'MIKA.JK', 
  'PGAS.JK', 'SMGR.JK', 'INTP.JK', 'CTRA.JK', 'BSDE.JK', 'PWON.JK'
].map(sym => ({ symbol: sym, name: sym.replace('.JK', '') }));

const US_POOL = [
  'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'TSLA', 'META', 'AMD', 'NFLX', 'JPM', 
  'V', 'MA', 'DIS', 'BA', 'KO', 'PEP', 'WMT', 'TGT', 'XOM', 'CVX', 
  'PFE', 'MRNA', 'JNJ', 'UNH', 'CRM', 'ORCL', 'ADBE', 'INTC', 'CSCO', 'QCOM'
].map(sym => ({ symbol: sym, name: sym }));

const ETFS = [
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF' }, { symbol: 'QQQ', name: 'Invesco QQQ Trust' },
  { symbol: 'VOO', name: 'Vanguard S&P 500' }, { symbol: 'EIDO', name: 'iShares MSCI Indonesia' },
  { symbol: 'ARKK', name: 'ARK Innovation ETF' }
];

const CATEGORIES = [
  { id: 'all', label: 'All Topics' },
  { id: 'markets', label: 'Markets', keywords: ['stock', 'market', 'ihsg', 'nasdaq', 's&p', 'saham', 'trading', 'equity', 'wall street'] },
  { id: 'macro', label: 'Macro', keywords: ['fed', 'inflation', 'interest rate', 'gdp', 'economy', 'central bank', 'bank indonesia', 'bi rate', 'ekonomi', 'inflasi', 'suku bunga', 'rupiah'] },
  { id: 'tech', label: 'Tech', keywords: ['technology', 'tech', 'apple', 'microsoft', 'google', 'ai', 'artificial intelligence', 'startup', 'teknologi', 'meta', 'nvidia'] },
  { id: 'crypto', label: 'Crypto', keywords: ['bitcoin', 'crypto', 'ethereum', 'blockchain', 'btc', 'eth', 'kripto'] },
  { id: 'commodities', label: 'Commodities', keywords: ['oil', 'crude', 'gold', 'coal', 'gas', 'commodity', 'emas', 'minyak', 'batu bara'] }
];

const I18N = {
  en: {
    tagline: 'Markets · Business · Economy', markAllRead: 'Mark all read', watchPh: 'Add watchlist keyword…',
    refresh: 'Refresh', all: 'All', unreadOnly: 'Unread only', loading: 'Fetching latest stories…',
    noArticles: 'No articles match your filters.', liveLabel: 'Live', cacheLabel: 'Cached', staleLabel: 'Offline · cached',
    errorLabel: 'Could not load feeds.', updated: 'Updated', watch: 'Watch',
    footer: 'FINWIRE — client-side market news aggregator.', justNow: 'just now', minAgo: n => `${n}m ago`,
    hourAgo: n => `${n}h ago`, dayAgo: n => `${n}d ago`, stories: n => `${n} stories`, added: 'Added',
    navNews: 'News', navMarkets: 'Markets', mktTitle: 'Market Data', searchPh: 'Search ticker…', searchBtn: 'Search',
    stockLoading: 'Fetching market data…', stockSearch: 'Searching…', stockNoRes: 'No results found.', stockErr: 'Search failed.'
  },
  id: {
    tagline: 'Pasar · Bisnis · Ekonomi', markAllRead: 'Tandai semua dibaca', watchPh: 'Tambah kata kunci pantauan…',
    refresh: 'Muat ulang', all: 'Semua', unreadOnly: 'Belum dibaca', loading: 'Mengambil berita terbaru…',
    noArticles: 'Tidak ada berita yang cocok.', liveLabel: 'Langsung', cacheLabel: 'Cache', staleLabel: 'Offline · cache',
    errorLabel: 'Gagal memuat feed.', updated: 'Diperbarui', watch: 'Pantau',
    footer: 'FINWIRE — agregator berita pasar berbasis klien.', justNow: 'baru saja', minAgo: n => `${n}m lalu`,
    hourAgo: n => `${n}j lalu`, dayAgo: n => `${n} hari lalu`, stories: n => `${n} berita`, added: 'Ditambahkan',
    navNews: 'Berita', navMarkets: 'Pasar', mktTitle: 'Data Pasar', searchPh: 'Cari ticker…', searchBtn: 'Cari',
    stockLoading: 'Memuat data pasar…', stockSearch: 'Mencari…', stockNoRes: 'Tidak ada hasil.', stockErr: 'Pencarian gagal.'
  }
};

const state = { articles: [], ticker: [], filter: 'all', categoryFilter: 'all', unreadOnly: false, lang: 'en', read: new Set(), watch: [], lastTs: 0, loading: false };

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.prototype.slice.call(root.querySelectorAll(sel));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function loadJSON(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; } }
function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
function timeAgo(ts, lang) {
  const t = I18N[lang] || I18N.en; const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 60) return t.justNow; const mins = Math.floor(secs / 60);
  if (mins < 60) return t.minAgo(mins); const hours = Math.floor(mins / 60);
  if (hours < 24) return t.hourAgo(hours); return t.dayAgo(Math.floor(hours / 24));
}
function stripHtml(html) { if (!html) return ''; const doc = new DOMParser().parseFromString(String(html), 'text/html'); doc.querySelectorAll('script, style, noscript').forEach(n => n.remove()); return (doc.body.textContent || '').replace(/\s+/g, ' ').trim(); }

function categorizeArticle(article) {
  const text = (article.title + ' ' + article.summary).toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.id === 'all') continue;
    if (cat.keywords.some(kw => text.includes(kw))) {
      return cat.id;
    }
  }
  return 'markets';
}

/* CORS PROXY LAYER */
const PROXIES = [
  (u) => `https://finwire-smart-proxy.derrylnnn.workers.dev/?url=${encodeURIComponent(u)}`
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
  if (rawDescription) { const m = rawDescription.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i); if (m && m[1]) return m[1]; }
  return '';
}
function cleanTitle(title, node) { let t = (title || '').trim(); const srcEl = firstTag(node, ['source']); if (srcEl) { const p = (srcEl.textContent || '').trim(); if (p && t.endsWith(' - ' + p)) t = t.slice(0, t.length - (p.length + 3)).trim(); } return t; }

function parseFeed(rawText, source) {
  if (source.useJsonApi) {
    try {
      const data = JSON.parse(rawText); 
      if (data.status !== 'ok' || !data.items) throw new Error('JSON API error');
      return data.items.map(item => {
        let imgUrl = item.thumbnail || (item.enclosure && item.enclosure.link) || '';
        if (!imgUrl && item.description) { const m = item.description.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i); if (m && m[1]) imgUrl = m[1]; }
        
        const art = { id: item.link, title: item.title, link: item.link, summary: stripHtml(item.description), image: imgUrl, ts: Date.parse(item.pubDate) || Date.now(), sourceId: source.id, sourceLabel: source.label, color: source.color };
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
    const dateStr = textOf(node, ['pubDate', 'published', 'updated', 'dc:date', 'date']); let ts = Date.parse(dateStr); if (!isFinite(ts)) ts = Date.now();
    
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

async function fetchAllNews() {
  let newArticlesFound = false;
  await Promise.allSettled(SOURCES.map(async (source) => {
    try {
      let fetchUrl = source.url, items = [];
      if (source.useJsonApi) {
        fetchUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}`;
        const res = await fetch(fetchUrl); if (!res.ok) throw new Error('HTTP ' + res.status);
        items = parseFeed(await res.text(), source);
      } else {
        fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + `_t=${Date.now()}`;
        const xml = await fetchViaProxy(fetchUrl, { timeout: 6000 }); items = parseFeed(xml, source);
      }
      if (items.length > 0) {
        state.articles = dedupe([...items, ...state.articles]).sort((a, b) => b.ts - a.ts);
        newArticlesFound = true; render(); enrichImages(items);
      }
    } catch (err) { console.warn('[FINWIRE] feed failed:', source.id, err.message); }
  }));
  if (!newArticlesFound && state.articles.length === 0) throw new Error('No feeds returned data');
}

/* IMAGE SCRAPING */
const ogCache = loadJSON(LS.ogimg, {});
function isJunkImage(url) { return /google\.com|gstatic|googleusercontent|ggpht\.com|doubleclick|feedburner|gravatar|placeholder/i.test(url) || /^data:/i.test(url); }
async function scrapeOgImage(articleUrl) {
  if (Object.prototype.hasOwnProperty.call(ogCache, articleUrl)) return ogCache[articleUrl];
  let found = '';
  try {
    const html = await fetchViaProxy(articleUrl, { timeout: 6000 });
    const patterns = [ /<meta[^>]+(?:property|name)\s*=\s*["']og:image(?::url|:secure_url)?["'][^>]*content\s*=\s*["']([^"']+)["']/i, /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*(?:property|name)\s*=\s*["']og:image(?::url|:secure_url)?["']/i, /<meta[^>]+(?:property|name)\s*=\s*["']twitter:image(?::src)?["'][^>]*content\s*=\s*["']([^"']+)["']/i ];
    for (let i = 0; i < patterns.length; i++) { const m = html.match(patterns[i]); if (m && m[1]) { found = m[1]; break; } }
    if (found) { try { found = new URL(found, articleUrl).href; } catch (e) { found = ''; } if (found && isJunkImage(found)) found = ''; }
  } catch (e) { found = ''; }
  ogCache[articleUrl] = found; return found;
}
async function enrichImages(articles) {
  const candidates = articles.filter(a => !a.image).slice(0, OG_MAX_SCRAPES); if (!candidates.length) return;
  for (let article of candidates) {
    const img = await scrapeOgImage(article.link);
    if (img) {
      article.image = img; const cached = loadJSON(LS.news, null);
      if (cached && cached.articles) { const ca = cached.articles.find(a => a.link === article.link); if (ca) ca.image = img; saveJSON(LS.news, cached); }
      const card = document.querySelector(`.card[data-url="${article.link}"]`);
      if (card) { const thumb = card.querySelector('.thumb'); if (thumb && !thumb.querySelector('img')) { const imgEl = document.createElement('img'); imgEl.src = img; imgEl.loading = 'lazy'; imgEl.referrerPolicy = 'no-referrer'; imgEl.onerror = function() { this.remove(); }; thumb.appendChild(imgEl); } }
    }
  }
}

/* TICKER & NEWS RENDERING */
async function fetchTicker() {
  const settled = await Promise.allSettled(TICKERS.map(async (t) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t.symbol)}?interval=1d&range=5d`;
    const raw = await fetchViaProxy(url, { timeout: 6000 }); const data = JSON.parse(raw);
    const meta = data?.chart?.result?.[0]?.meta; if (!meta || typeof meta.regularMarketPrice !== 'number') throw new Error('No price');
    const price = meta.regularMarketPrice; const prev = meta.chartPreviousClose || meta.previousClose || price;
    return { label: t.label, symbol: t.symbol, price: price, change: prev ? ((price - prev) / prev) * 100 : 0 };
  }));
  const cached = loadJSON(LS.ticker, null); const cachedMap = {};
  if (cached?.items) cached.items.forEach(it => { cachedMap[it.symbol] = it; });
  return settled.map((res, i) => res.status === 'fulfilled' ? res.value : (cachedMap[TICKERS[i].symbol] || { label: TICKERS[i].label, symbol: TICKERS[i].symbol, price: null, change: null }));
}

function renderTicker(items) {
  const track = $('#tickerTrack'); if (!track || !items || !items.length) return;
  const locale = state.lang === 'id' ? 'id-ID' : 'en-US';
  const unit = items.map(t => {
    let priceTxt = typeof t.price === 'number' ? t.price.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: t.price >= 1000 ? 2 : 4 }) : '—';
    let changeTxt = '—', dir = 'flat';
    if (typeof t.change === 'number' && isFinite(t.change)) {
      dir = t.change > 0 ? 'up' : (t.change < 0 ? 'down' : 'flat');
      changeTxt = (dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : '') + Math.abs(t.change).toFixed(2) + '%';
    }
    return `<span class="tk"><span class="tk-sym">${esc(t.label)}</span><span class="tk-price">${esc(priceTxt)}</span><span class="tk-chg ${dir}">${esc(changeTxt)}</span></span>`;
  }).join('');
  track.style.animation = 'none'; track.innerHTML = unit;
  const singleWidth = track.scrollWidth || 1, viewport = window.innerWidth || 1280; let reps = 1;
  while (singleWidth * reps < viewport * 1.6 && reps < 24) reps++;
  track.innerHTML = unit.repeat(reps) + unit.repeat(reps);
  track.style.animationDuration = Math.max(35, reps * items.length * 5) + 's';
  void track.offsetWidth; track.style.animation = '';
}

function matchWatch(article) {
  if (!state.watch.length) return false;
  const haystack = (article.title + ' ' + article.summary).toLowerCase();
  return state.watch.some(kw => kw && haystack.indexOf(kw.toLowerCase()) !== -1);
}

function cardHTML(article, variant) {
  const t = I18N[state.lang]; const isRead = state.read.has(article.link); const isHit = matchWatch(article);
  const classes = ['card', variant || 'grid', isRead ? 'read' : 'unread', isHit ? 'hit' : ''].filter(Boolean).join(' ');
  const thumbInner = article.image ? `<img src="${esc(article.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  const thumb = `<span class="thumb" style="--cat:${esc(article.color)}"><span class="thumb-fb">${esc(article.sourceLabel)}</span>${thumbInner}</span>`;
  const summary = (variant !== 'side' && article.summary) ? `<p class="summary">${esc(article.summary)}</p>` : '';
  const watchBadge = isHit ? `<span class="badge-watch">${esc(t.watch)}</span>` : '';
  const dot = isRead ? '' : '<span class="unread-dot" aria-hidden="true"></span>';
  
  const hash = article.link.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0); 

  return `<div class="${classes}" data-url="${esc(article.link)}">
    ${thumb}
    <div class="card-body">
      <div class="meta"><span class="src">${esc(article.sourceLabel)}</span><span class="sep">•</span><time class="ago" data-ts="${article.ts}">${esc(timeAgo(article.ts, state.lang))}</time>${watchBadge}</div>
      <h2 class="headline"><a href="${esc(article.link)}" target="_blank" rel="noopener noreferrer">${esc(article.title)}</a></h2>
      ${summary}
      
      <button class="ai-btn" data-text="${esc(article.title + '. ' + article.summary)}" data-target="ai-${hash}">
        ✨ AI Summary
      </button>
      <div class="ai-summary-box" id="ai-${hash}"></div>
    </div>
    ${dot}</div>`;
}

function currentArticles() {
  let list = state.articles.slice();
  if (state.filter !== 'all') list = list.filter(a => a.sourceId === state.filter);
  if (state.categoryFilter !== 'all') list = list.filter(a => a.category === state.categoryFilter);
  if (state.unreadOnly) list = list.filter(a => !state.read.has(a.link));
  return list;
}

function render() {
  const heroEl = $('#hero'), gridEl = $('#grid'), t = I18N[state.lang]; const list = currentArticles();
  if (!list.length) { if (heroEl) heroEl.innerHTML = ''; if (gridEl) gridEl.innerHTML = `<div class="empty">${esc(t.noArticles)}</div>`; return; }
  
  let heroIndex = 0; 
  
  const hero = list[heroIndex]; const rest = list.slice(0, heroIndex).concat(list.slice(heroIndex + 1));
  const side = rest.slice(0, 4), grid = rest.slice(4);
  if (heroEl) heroEl.innerHTML = `<div class="hero-main">${cardHTML(hero, 'hero')}</div><div class="hero-side">${side.map(a => cardHTML(a, 'side')).join('')}</div>`;
  if (gridEl) gridEl.innerHTML = grid.map(a => cardHTML(a, 'grid')).join('');
}

function refreshTimes() {
  $$('.ago[data-ts]').forEach(el => { const ts = parseInt(el.getAttribute('data-ts'), 10); if (!isNaN(ts)) el.textContent = timeAgo(ts, state.lang); });
  if (state.lastTs) updateStatusLabel(state.lastKind || 'live', state.lastTs);
}

function updateStatusLabel(kind, ts) {
  const el = $('#status'); if (!el) return; const t = I18N[state.lang];
  if (kind === 'loading') { el.className = 'status loading'; el.textContent = t.loading; return; }
  if (kind === 'error') { el.className = 'status stale'; el.innerHTML = `<span class="dot stale"></span>${esc(t.errorLabel)}`; return; }
  const label = kind === 'live' ? t.liveLabel : (kind === 'cached' ? t.cacheLabel : t.staleLabel);
  el.className = `status ${kind}`;
  el.innerHTML = `<span class="dot ${kind}"></span>${esc(label)} · ${esc(t.updated)} ${esc(timeAgo(ts, state.lang))} · ${esc(t.stories(state.articles.length))}`;
}

function renderFilters() {
  const bar = $('#filters'); if (!bar) return; const t = I18N[state.lang];
  const sourceChips = SOURCES.map(s => `<button type="button" class="chip${state.filter === s.id ? ' active' : ''}" data-filter="${esc(s.id)}">${esc(s.label)}</button>`).join('');
  const catChips = CATEGORIES.map(c => `<button type="button" class="chip cat-chip${state.categoryFilter === c.id ? ' active' : ''}" data-cat-filter="${esc(c.id)}">${esc(c.label)}</button>`).join('');

  bar.innerHTML = `
    <div class="filters-inner" style="border-bottom: none; padding-bottom: 0;">
      <button type="button" class="chip${state.filter === 'all' ? ' active' : ''}" data-filter="all">${esc(t.all)}</button>
      ${sourceChips}<span class="spacer"></span>
      <label class="switch"><input type="checkbox" id="unreadToggle"${state.unreadOnly ? ' checked' : ''}><span>${esc(t.unreadOnly)}</span></label>
    </div>
    <div class="filters-inner" style="min-height: 40px; padding-top: 4px; padding-bottom: 8px;">
      ${catChips}
    </div>
  `;
}

function renderWatchChips() {
  const el = $('#watchChips'); if (!el) return;
  el.innerHTML = state.watch.map((kw, i) => `<span class="chip-watch">${esc(kw)}<button type="button" data-remove-watch="${i}" aria-label="Remove ${esc(kw)}">×</button></span>`).join('');
}

function applyLang() {
  const t = I18N[state.lang]; document.documentElement.lang = state.lang;
  $$('[data-i18n]').forEach(el => { const key = el.getAttribute('data-i18n'); if (t[key]) el.textContent = t[key]; });
  $$('[data-i18n-ph]').forEach(el => { const key = el.getAttribute('data-i18n-ph'); if (t[key]) el.setAttribute('placeholder', t[key]); });
  $$('.lang-toggle button').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-lang') === state.lang));
  renderFilters(); renderTicker(state.ticker); render(); refreshTimes();
}

/* MARKET DASHBOARD LOGIC */
function switchView(view) {
  if (view === 'news') {
    $('#newsView').style.display = 'block'; $('#stocksView').style.display = 'none'; $('#filters').style.display = 'block';
    $('#navNews').classList.add('active'); $('#navStocks').classList.remove('active');
  } else {
    $('#newsView').style.display = 'none'; $('#stocksView').style.display = 'block'; $('#filters').style.display = 'none';
    $('#navNews').classList.remove('active'); $('#navStocks').classList.add('active');
    loadMarketDashboard();
  }
}

async function fetchStockDetails(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const raw = await fetchViaProxy(url, { timeout: 8000 });
    const data = JSON.parse(raw);
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== 'number') throw new Error('No price data');
    return { 
      symbol: meta.symbol, name: meta.shortName || meta.symbol, price: meta.regularMarketPrice, 
      prevClose: meta.chartPreviousClose || meta.previousClose || meta.regularMarketPrice, 
      volume: meta.regularMarketVolume, dayHigh: meta.regularMarketDayHigh, dayLow: meta.regularMarketDayLow, 
      week52High: meta.fiftyTwoWeekHigh, week52Low: meta.fiftyTwoWeekLow 
    };
  } catch (e) { 
    return { symbol: symbol, name: symbol, price: null, prevClose: null, volume: null, dayHigh: null, dayLow: null, week52High: null, week52Low: null };
  }
}

async function fetchHistory(symbol, range = '6mo') {
  try {
    let interval = '1d';
    if (range === '1d') interval = '5m';
    else if (range === '5d') interval = '15m';
    
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const raw = await fetchViaProxy(url);
    const data = JSON.parse(raw);
    const result = data?.chart?.result?.[0];
    if (!result) return [];
    const timestamps = result.timestamp || [];
    const quotes = result.indicators.quote[0].close || [];
    return timestamps.map((ts, i) => ({ x: new Date(ts * 1000).getTime(), y: quotes[i] })).filter(p => p.y !== null);
  } catch (e) { return []; }
}

function generateMoversTable(title, stocks, headerClass) {
  if (!stocks.length) return '';
  const rows = stocks.map(s => `
    <tr>
      <td style="font-weight:800; color:var(--ink);">${esc(s.symbol.replace('.JK', ''))}</td>
      <td style="color:var(--muted); font-size:11px;">${esc(s.name)}</td>
      <td style="text-align:right; font-weight:600;">${s.price.toLocaleString('en-US')}</td>
      <td style="text-align:right; font-weight:700; color:${s.pct >= 0 ? 'var(--green)' : 'var(--red)'}">${s.pct > 0 ? '+' : ''}${s.pct.toFixed(2)}%</td>
    </tr>
  `).join('');

  return `
    <div class="movers-panel" style="margin-bottom: 16px;">
      <div class="movers-panel-header ${headerClass}">${title}</div>
      <table class="movers-table">
        <thead><tr><th>Symbol</th><th>Name</th><th style="text-align:right;">Price</th><th style="text-align:right;">Change</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

let ihsgChart, sp500Chart; 

async function loadMarketDashboard() {
  const dash = $('#stockDashboard'); const t = I18N[state.lang];
  dash.innerHTML = `<div class="stock-loading">${t.stockLoading}</div>`;

  const allSymbols = [...new Set([...INDICES.map(x=>x.symbol), '^GSPC', ...MACRO.map(x=>x.symbol), ...ECON_INDICATORS.map(x=>x.symbol), ...IDX_POOL.map(x=>x.symbol), ...US_POOL.map(x=>x.symbol), ...ETFS.map(x=>x.symbol)])];
  const allData = {};
  let failedCount = 0;

  for (const sym of allSymbols) {
    const details = await fetchStockDetails(sym);
    if (details && details.price) {
      details.pct = ((details.price - details.prevClose) / details.prevClose) * 100;
      allData[sym] = details;
    } else {
      failedCount++;
    }
    await new Promise(r => setTimeout(r, 50)); 
  }

  const cacheKey = 'fw.market_data_cache';
  if (failedCount > 10) {
    console.warn("Yahoo rate limit hit. Loading cached market data.");
    const cached = loadJSON(cacheKey, {});
    if (Object.keys(cached).length > 0) Object.assign(allData, cached);
  } else if (Object.keys(allData).length > 0) {
    saveJSON(cacheKey, allData);
  }
  
  if (Object.keys(allData).length === 0) {
    dash.innerHTML = `<div class="stock-loading">Market data temporarily unavailable. Please try again in a few minutes.</div>`;
    return;
  }

  const idxData = IDX_POOL.map(s => allData[s.symbol]).filter(Boolean);
  const idxSortedByPct = [...idxData].sort((a, b) => b.pct - a.pct);
  const idxGainers = idxSortedByPct.slice(0, 5);
  const idxLosers = idxSortedByPct.slice(-5).reverse();
  const idxMostActive = [...idxData].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 5);

  const usData = US_POOL.map(s => allData[s.symbol]).filter(Boolean);
  const usSortedByPct = [...usData].sort((a, b) => b.pct - a.pct);
  const usGainers = usSortedByPct.slice(0, 5);
  const usLosers = usSortedByPct.slice(-5).reverse();
  const usMostActive = [...usData].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, 5);

  const sumSymbols = [...INDICES.map(x => ({...x, type: 'index'})), ...MACRO.map(x => ({...x, type: 'macro'}))];
  const summaryData = await Promise.all(sumSymbols.map(async x => {
    const hist = await fetchHistory(x.symbol, '1mo');
    return { ...x, data: allData[x.symbol], spark: hist };
  }));

  const sparkHtml = summaryData.map(d => {
    if (!d.data) return '';
    const isUp = d.data.pct >= 0;
    return `
      <div class="spark-card">
        <div class="spark-header">
          <span class="spark-name">${d.name}</span>
          <span class="spark-chg ${isUp ? 'up' : 'down'}">${isUp ? '▲' : '▼'} ${Math.abs(d.data.pct).toFixed(2)}%</span>
        </div>
        <div class="spark-val">${d.data.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
        <div id="spark-${d.symbol.replace('^', '').replace('=', '')}"></div>
      </div>
    `;
  }).join('');

  const mainChartData = await fetchHistory('^JKSE', '6mo');
  const sp500ChartData = await fetchHistory('^GSPC', '6mo');

  const buildCards = (list) => list.map(s => {
    if (!s) return '';
    const isUp = s.pct >= 0;
    return `<a href="https://finance.yahoo.com/quote/${esc(s.symbol)}" target="_blank" class="stock-card">
      <div class="sc-header">
        <div>
          <div class="sc-sym">${esc(s.symbol.replace('.JK', ''))}</div>
          <div class="sc-name">${esc(s.name)}</div>
        </div>
        <div class="sc-chg ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${s.pct.toFixed(2)}%</div>
      </div>
      <div class="sc-price">${s.price.toLocaleString('en-US')}</div>
    </a>`;
  }).join('');

  const vixData = allData['^VIX'];
  const tnxData = allData['^TNX'];
  
  const macroPanelHtml = `
    <div class="modern-card" style="margin-top: 24px;">
      <div class="card-title">Macro & Economic Indicators</div>
      <div style="display: flex; flex-direction: column; gap: 16px;">
        ${vixData ? `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--rule-2); padding-bottom:12px;">
          <div><div style="font-weight:700;">US VIX Volatility Index</div><div style="font-size:11px; color:var(--muted);">CBOE Volatility Index</div></div>
          <div style="text-align:right;"><div style="font-weight:700;">${vixData.price.toLocaleString('en-US')}</div><div style="font-size:12px; font-weight:700; color:${vixData.pct >= 0 ? 'var(--green)' : 'var(--red)'}">${vixData.pct > 0 ? '+' : ''}${vixData.pct.toFixed(2)}%</div></div>
        </div>
        ` : ''}
        ${tnxData ? `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--rule-2); padding-bottom:12px;">
          <div><div style="font-weight:700;">US 10Y Treasury Yield</div><div style="font-size:11px; color:var(--muted);">10-Year Bond Yield</div></div>
          <div style="text-align:right;"><div style="font-weight:700;">${tnxData.price.toFixed(3)}%</div><div style="font-size:12px; font-weight:700; color:${tnxData.pct >= 0 ? 'var(--green)' : 'var(--red)'}">${tnxData.pct > 0 ? '+' : ''}${tnxData.pct.toFixed(2)}%</div></div>
        </div>
        ` : ''}
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div><div style="font-weight:700;">Bank Indonesia (BI) Rate</div><div style="font-size:11px; color:var(--muted);">7-Day Reverse Repo</div></div>
          <div style="text-align:right;"><div style="font-weight:700;">6.25%</div><div style="font-size:12px; font-weight:700; color:var(--muted);">Static</div></div>
        </div>
      </div>
    </div>
  `;

  const chartControlsHtml = (symbol, targetId) => `
    <div class="chart-controls" data-symbol="${symbol}" data-target="${targetId}">
      <button class="chart-btn" data-range="1d">1D</button>
      <button class="chart-btn" data-range="5d">5D</button>
      <button class="chart-btn" data-range="1mo">1M</button>
      <button class="chart-btn" data-range="3mo">3M</button>
      <button class="chart-btn active" data-range="6mo">6M</button>
      <button class="chart-btn" data-range="1y">1Y</button>
      <button class="chart-btn" data-range="5y">5Y</button>
    </div>
  `;

  dash.innerHTML = `
    <div class="sparkline-grid">${sparkHtml}</div>
    
    <div class="dash-grid" style="align-items: start;">
      <div>
        <div class="modern-card">
          <div class="card-title">
            <span>IHSG Market Performance</span>
            ${chartControlsHtml('^JKSE', 'ihsgChart')}
          </div>
          <div id="mainChart"></div>
        </div>
        
        <div class="modern-card" style="margin-top: 24px;">
          <div class="card-title">
            <span>S&P 500 Market Performance</span>
            ${chartControlsHtml('^GSPC', 'sp500Chart')}
          </div>
          <div id="sp500Chart"></div>
        </div>
      </div>

      <div class="modern-card">
        <div class="card-title">Market Movers</div>
        <div class="scrollable-movers">
          ${generateMoversTable('Top IDX Gainers', idxGainers, 'gainers')}
          ${generateMoversTable('Top IDX Losers', idxLosers, 'losers')}
          ${generateMoversTable('Top US Gainers', usGainers, 'gainers')}
          ${generateMoversTable('Top US Losers', usLosers, 'losers')}
        </div>
      </div>
    </div>

    <div style="margin-top: 32px;">
      <h2 class="page-title" style="font-size: 24px; margin-bottom: 16px;">Most Active</h2>
      <div class="movers-grid-4">
        ${generateMoversTable('Most Active IDX', idxMostActive, 'active')}
        ${generateMoversTable('Most Active US', usMostActive, 'active')}
      </div>
    </div>

    <div style="margin-top: 32px;">
      <h2 class="page-title" style="font-size: 24px; margin-bottom: 16px;">IDX Bluechips</h2>
      <div class="stock-card-grid">${buildCards(idxData)}</div>
    </div>

    <div style="margin-top: 32px;">
      <h2 class="page-title" style="font-size: 24px; margin-bottom: 16px;">US Tech Giants</h2>
      <div class="stock-card-grid">${buildCards(usData)}</div>
    </div>

    <div style="margin-top: 32px;">
      <h2 class="page-title" style="font-size: 24px; margin-bottom: 16px;">Popular ETFs</h2>
      <div class="stock-card-grid">${buildCards(ETFS.map(e => allData[e.symbol]).filter(Boolean))}</div>
    </div>
    
    ${macroPanelHtml}
  `;

  if (typeof ApexCharts !== 'undefined') {
    summaryData.forEach(d => {
      if (!d.data) return;
      new ApexCharts(document.querySelector(`#spark-${d.symbol.replace('^', '').replace('=', '')}`), {
        series: [{ data: d.spark.map(p => p.y) }], chart: { type: 'area', height: 50, sparkline: { enabled: true } },
        stroke: { curve: 'smooth', width: 2 }, colors: [d.data.pct >= 0 ? '#0a8f4a' : '#d10a11'],
        fill: { type: 'gradient', gradient: { opacityFrom: 0.4, opacityTo: 0 } }, tooltip: { enabled: false }
      }).render();
    });

    ihsgChart = new ApexCharts(document.querySelector("#mainChart"), {
      series: [{ name: 'IHSG', data: mainChartData }], chart: { type: 'area', height: 320, toolbar: { show: false }, fontFamily: 'Inter' },
      colors: ['#d10a11'], fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0 } },
      dataLabels: { enabled: false }, stroke: { curve: 'smooth', width: 3 },
      xaxis: { type: 'datetime' }, yaxis: { labels: { formatter: v => v.toFixed(0) } }, grid: { borderColor: '#f1f3f5', strokeDashArray: 4 }
    });
    ihsgChart.render();

    sp500Chart = new ApexCharts(document.querySelector("#sp500Chart"), {
      series: [{ name: 'S&P 500', data: sp500ChartData }], chart: { type: 'area', height: 320, toolbar: { show: false }, fontFamily: 'Inter' },
      colors: ['#3b82f6'], fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0 } },
      dataLabels: { enabled: false }, stroke: { curve: 'smooth', width: 3 },
      xaxis: { type: 'datetime' }, yaxis: { labels: { formatter: v => v.toFixed(0) } }, grid: { borderColor: '#f1f3f5', strokeDashArray: 4 }
    });
    sp500Chart.render();

    document.querySelectorAll('.chart-controls').forEach(control => {
      control.addEventListener('click', async (e) => {
        const btn = e.target.closest('.chart-btn');
        if (!btn) return;
        
        control.querySelectorAll('.chart-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const range = btn.getAttribute('data-range');
        const symbol = control.getAttribute('data-symbol');
        const target = control.getAttribute('data-target');
        
        const btnText = btn.textContent;
        btn.textContent = '...';
        
        const newData = await fetchHistory(symbol, range);
        
        if (target === 'ihsgChart' && ihsgChart) ihsgChart.updateSeries([{ name: 'IHSG', data: newData }]);
        if (target === 'sp500Chart' && sp500Chart) sp500Chart.updateSeries([{ name: 'S&P 500', data: newData }]);
        
        btn.textContent = btnText;
      });
    });
  }
}

async function searchStocks(query) {
  if (!query) { loadMarketDashboard(); return; }
  const dash = $('#stockDashboard'); const t = I18N[state.lang];
  dash.innerHTML = `<div class="stock-loading">${t.stockSearch}</div>`;

  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}`;
    const raw = await fetchViaProxy(url, { timeout: 8000 }); 
    const data = JSON.parse(raw);
    
    const quotes = data.quotes || []; 
    const symbols = quotes.filter(q => q.isYahooFinance && q.quoteType !== 'NONE').map(q => q.symbol);
    
    if (symbols.length === 0) { 
      dash.innerHTML = `<div class="stock-loading">No results found for "${esc(query)}". Try a valid ticker (e.g., AAPL, BBCA.JK).</div>`; 
      return; 
    }
    
    const results = [];
    for (const s of symbols.slice(0, 10)) {
      results.push(await fetchStockDetails(s));
      await new Promise(r => setTimeout(r, 100));
    }
    const valid = results.filter(r => r !== null && r.price);

    dash.innerHTML = `<div class="category-section">
      <h2 class="category-title">Search Results for "${esc(query)}"</h2>
      <div class="stock-card-grid">
        ${valid.map(s => {
          const isUp = s.pct >= 0;
          return `<a href="https://finance.yahoo.com/quote/${esc(s.symbol)}" target="_blank" class="stock-card">
            <div class="sc-header"><div><div class="sc-sym">${esc(s.symbol.replace('.JK', ''))}</div><div class="sc-name">${esc(s.name)}</div></div><div class="sc-chg ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${s.pct.toFixed(2)}%</div></div>
            <div class="sc-price">${s.price.toLocaleString('en-US')}</div>
          </a>`;
        }).join('')}
      </div>
    </div>`;
  } catch (e) { 
    dash.innerHTML = `<div class="stock-loading">Search failed. Please check your connection and try a valid ticker.</div>`; 
  }
}

/* DATA LOADING & BINDING */
async function loadNews(force) {
  const cached = loadJSON(LS.news, null);
  if (cached && cached.articles && cached.articles.length > 0) {
    state.articles = cached.articles; state.lastTs = cached.ts; state.lastKind = 'cached';
    render(); updateStatusLabel('cached', cached.ts);
    if (!force && (Date.now() - cached.ts) < CACHE_TTL) return;
  } else { updateStatusLabel('loading'); }
  try {
    await fetchAllNews(); state.lastTs = Date.now(); state.lastKind = 'live';
    saveJSON(LS.news, { ts: Date.now(), articles: state.articles }); updateStatusLabel('live', state.lastTs);
  } catch (err) { if (!cached || !cached.articles) updateStatusLabel('error'); }
}

async function loadTicker(force) {
  const cached = loadJSON(LS.ticker, null);
  if (!force && cached && cached.items && (Date.now() - cached.ts) < CACHE_TTL) { state.ticker = cached.items; renderTicker(state.ticker); return; }
  try {
    const items = await fetchTicker(); state.ticker = items; saveJSON(LS.ticker, { ts: Date.now(), items }); renderTicker(items);
  } catch (err) { if (cached && cached.items) { state.ticker = cached.items; renderTicker(state.ticker); } }
}

async function loadAll(force) {
  if (state.loading) return; state.loading = true;
  try { await Promise.all([loadNews(force), loadTicker(force)]); } finally { state.loading = false; }
}

async function getFullArticleText(url) {
  try {
    // 1. Add a cache buster so Cloudflare doesn't return an old blocked page
    const fetchUrl = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    
    // 2. Increase timeout to 10 seconds
    const html = await fetchViaProxy(fetchUrl, { timeout: 10000 });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    
    // 3. Remove all the junk
    doc.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript, .ads, .related').forEach(el => el.remove());
    
    // 4. Try to find the main article container
    let contentEl = doc.querySelector('article') || 
                    doc.querySelector('main') || 
                    doc.querySelector('.detail-text') || 
                    doc.querySelector('.article-content') || 
                    doc.querySelector('.post-content') ||
                    doc.body;
                    
    let text = contentEl.textContent || '';
    
    // 5. Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // 6. If the text is super short, the proxy hit a block page
    if (text.length < 300) {
        console.warn("Scraper returned too little text. Falling back to subtitle.");
        return ''; 
    }
    
    // 7. Limit to 5000 characters so we don't waste tokens
    return text.substring(0, 5000);
  } catch (e) {
    console.warn("Scrape failed:", e.message);
    return '';
  }
}

function bindUI() {
  if ($('#navNews')) $('#navNews').addEventListener('click', () => switchView('news'));
  if ($('#navStocks')) $('#navStocks').addEventListener('click', () => switchView('stocks'));
  
  const searchInput = $('#stockSearchInput');
  if ($('#stockSearchBtn')) $('#stockSearchBtn').addEventListener('click', () => searchStocks(searchInput.value.trim()));
  if (searchInput) searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchStocks(searchInput.value.trim()); } });

  $('#filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-filter]'); 
    if (chip) {
      state.filter = chip.getAttribute('data-filter');
      $$('#filters .chip[data-filter]').forEach(c => c.classList.toggle('active', c === chip)); 
      render();
      return;
    }
    
    const catChip = e.target.closest('.cat-chip[data-cat-filter]');
    if (catChip) {
      state.categoryFilter = catChip.getAttribute('data-cat-filter');
      $$('.cat-chip').forEach(c => c.classList.toggle('active', c === catChip)); 
      render();
    }
  });

  $('#filters').addEventListener('change', (e) => { if (e.target && e.target.id === 'unreadToggle') { state.unreadOnly = e.target.checked; render(); } });

  $$('.lang-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.getAttribute('data-lang') === state.lang) return;
      state.lang = btn.getAttribute('data-lang'); localStorage.setItem(LS.lang, state.lang);
      applyLang(); if ($('#stocksView').style.display !== 'none') loadMarketDashboard();
      if (state.lastTs) updateStatusLabel(state.lastKind || 'live', state.lastTs);
    });
  });

  $('#markAllRead').addEventListener('click', () => { currentArticles().forEach(a => state.read.add(a.link)); saveJSON(LS.read, Array.from(state.read).slice(-1000)); render(); refreshTimes(); });
  $('#refreshBtn').addEventListener('click', () => loadAll(true));

  const input = $('#watchInput');
  const addKeyword = () => {
    const raw = (input.value || '').trim(); if (!raw) return;
    if (!state.watch.some(k => k.toLowerCase() === raw.toLowerCase())) { state.watch.push(raw); saveJSON(LS.watch, state.watch); renderWatchChips(); render(); }
    input.value = '';
  };
  $('#watchAdd').addEventListener('click', addKeyword);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } });

  $('#watchChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-watch]'); if (!btn) return;
    const idx = parseInt(btn.getAttribute('data-remove-watch'), 10);
    if (!isNaN(idx)) { state.watch.splice(idx, 1); saveJSON(LS.watch, state.watch); renderWatchChips(); render(); }
  });

  // AI SUMMARIZE LOGIC (Gemini)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.ai-btn');
    if (!btn) return;
    
    e.preventDefault();
    e.stopPropagation(); 
    
    const targetId = btn.getAttribute('data-target');
    const targetEl = document.getElementById(targetId);
    
    if (targetEl.style.display === 'block') {
      targetEl.style.display = 'none';
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '✨ Scraping...';
    
    try {
      // 1. Get the article URL from the parent card
      const card = btn.closest('.card');
      const articleUrl = card ? card.getAttribute('data-url') : null;
      
      // 2. Try to scrape the full text
      let textToSummarize = '';
      if (articleUrl) {
          textToSummarize = await getFullArticleText(articleUrl);
      }
      
      // 3. Fallback to title + summary if scraping fails (e.g. paywall)
      if (!textToSummarize || textToSummarize.length < 100) {
          textToSummarize = btn.getAttribute('data-text');
      }

      btn.innerHTML = '✨ Thinking...';
      
      // 4. Send to Gemini
      const res = await fetch('https://finwire-smart-proxy.derrylnnn.workers.dev/ai-summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSummarize, lang: state.lang })
      });
      
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Worker Error ${res.status}: ${errText}`);
      }
      
      const data = await res.json();
      
      if (data && data.summary) {
        targetEl.innerHTML = `<strong>AI Summary:</strong> ${esc(data.summary)}`;
        targetEl.style.display = 'block';
      } else if (data.error) {
        targetEl.innerHTML = `<em>Error: ${esc(data.error)}</em>`;
        targetEl.style.display = 'block';
      } else {
        targetEl.innerHTML = `<em>AI is busy. Try again.</em>`;
        targetEl.style.display = 'block';
      }
    } catch (err) {
      targetEl.innerHTML = `<em>Failed: ${esc(err.message)}</em>`;
      targetEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.innerHTML = '✨ AI Summary';
    }
  });

  // ==========================================
  // NEW: AI DAILY BRIEFING LOGIC
  // ==========================================
  const briefingBtn = $('#generateBriefingBtn');
  if (briefingBtn) {
    briefingBtn.addEventListener('click', async () => {
      const contentEl = $('#briefingContent');
      
      // Get the top 15 recent articles to summarize
      const articles = currentArticles().slice(0, 15);
      if (articles.length === 0) return;

      // Combine titles and summaries
      const combinedText = articles.map((a, i) => `${i+1}. ${a.title} - ${a.summary}`).join('\n\n');

      briefingBtn.disabled = true;
      briefingBtn.innerHTML = '✨ Analyzing 15 articles...';
      contentEl.style.display = 'none';

      try {
        const res = await fetch('https://finwire-smart-proxy.derrylnnn.workers.dev/ai-summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: combinedText, isBriefing: true, lang: state.lang }) // <-- ADD lang HERE
        });
        
        const data = await res.json();
        
        if (data && data.summary) {
          // Convert markdown bullets (*) to HTML list items if Gemini uses them
          let formattedText = data.summary
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold text
            .replace(/^\* (.*$)/gim, '<li>$1</li>'); // Bullet points
          
          if (formattedText.includes('<li>')) {
            formattedText = `<ul>${formattedText}</ul>`;
          }

          contentEl.innerHTML = `<strong>Market Briefing:</strong><br>${formattedText}`;
          contentEl.style.display = 'block';
        } else {
          contentEl.innerHTML = `<em>Failed to generate briefing. Try again.</em>`;
          contentEl.style.display = 'block';
        }
      } catch (err) {
        contentEl.innerHTML = `<em>Failed to connect to AI.</em>`;
        contentEl.style.display = 'block';
      } finally {
        briefingBtn.disabled = false;
        briefingBtn.innerHTML = '✨ Generate Today\'s Market Briefing';
      }
    });
  }
  // ==========================================

  let resizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => renderTicker(state.ticker), 350); });
  setInterval(refreshTimes, 60 * 1000);
}

function init() {
  const savedLang = localStorage.getItem(LS.lang); state.lang = (savedLang === 'id' || savedLang === 'en') ? savedLang : 'en';
  const savedRead = loadJSON(LS.read, []); state.read = new Set(Array.isArray(savedRead) ? savedRead : []);
  const savedWatch = loadJSON(LS.watch, null); state.watch = Array.isArray(savedWatch) ? savedWatch : [];

  bindUI(); renderFilters(); renderWatchChips(); applyLang(); loadAll(false);
  setInterval(() => loadAll(true), AUTO_REFRESH_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const cached = loadJSON(LS.news, null);
      if (!cached || (Date.now() - cached.ts) >= CACHE_TTL) loadAll(false); else refreshTimes();
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();