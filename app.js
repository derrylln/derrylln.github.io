/* ============================================================
   FINWIRE — CLIENT-SIDE DASHBOARD & NEWS
   ============================================================ */
'use strict';

const CACHE_TTL = 15 * 60 * 1000;
const AUTO_REFRESH_MS = 15 * 60 * 1000;
const OG_MAX_SCRAPES = 3;

const LS = { news: 'fw.news', ticker: 'fw.ticker', read: 'fw.read', watch: 'fw.watch', lang: 'fw.lang' };

const SOURCES = [
  { id: 'bloomberg', label: 'Bloomberg', color: '#111827', url: 'https://news.google.com/rss/search?q=when:24h+site:bloomberg.com+markets&hl=en-US&gl=US&ceid=US:en', useJsonApi: true },
  { id: 'reuters', label: 'Reuters', color: '#7c2d12', url: 'https://news.google.com/rss/search?q=when:24h+site:reuters.com+business&hl=en-US&gl=US&ceid=US:en', useJsonApi: true },
  { id: 'cnbc', label: 'CNBC Indonesia', color: '#1e3a8a', url: 'https://www.cnbcindonesia.com/market/rss' },
  { id: 'kontan', label: 'Kontan', color: '#14532d', url: 'https://investasi.kontan.co.id/rss' },
  { id: 'idn', label: 'IDN Financials', color: '#4c1d95', url: 'https://news.google.com/rss/search?q=site:idnfinancials.com&hl=id&gl=ID&ceid=ID:id', useJsonApi: true }
];

const TICKERS = [
  { symbol: '^JKSE', label: 'IHSG' }, { symbol: 'BBCA.JK', label: 'BBCA' },
  { symbol: 'BBRI.JK', label: 'BBRI' }, { symbol: 'TLKM.JK', label: 'TLKM' },
  { symbol: 'IDR=X', label: 'USD/IDR' }, { symbol: 'CL=F', label: 'CRUDE OIL' }
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
    thSym: 'Symbol', thName: 'Name', thPrice: 'Price', thChange: 'Change', thVol: 'Volume', thDay: 'Day Range', th52w: '52-Week Range',
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
    thSym: 'Simbol', thName: 'Nama', thPrice: 'Harga', thChange: 'Perubahan', thVol: 'Volume', thDay: 'Rentang Harian', th52w: 'Rentang 52-Minggu',
    stockLoading: 'Memuat data pasar…', stockSearch: 'Mencari…', stockNoRes: 'Tidak ada hasil.', stockErr: 'Pencarian gagal.'
  }
};

const state = { articles: [], ticker: [], filter: 'all', unreadOnly: false, lang: 'en', read: new Set(), watch: [], lastTs: 0, loading: false };

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

/* --- PROXY --- */
const PROXIES = [(u) => `https://finwire-smart-proxy.derrylnnn.workers.dev/?url=${encodeURIComponent(u)}`];
async function fetchViaProxy(targetUrl, options) {
  const opts = options || {}; const timeout = opts.timeout || 8000;
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(PROXIES[0](targetUrl), { signal: controller.signal, method: 'GET', headers: { 'Accept': '*/*' }, redirect: 'follow', credentials: 'omit', mode: 'cors' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let text = await res.text(); if (!text || text.length < 30) throw new Error('Empty response');
    if (text.trim().charAt(0) === '{') { try { const parsed = JSON.parse(text); if (parsed && typeof parsed.contents === 'string' && parsed.contents.length) text = parsed.contents; } catch (e) {} }
    return text;
  } finally { clearTimeout(timer); }
}

/* --- NEWS LOGIC --- */
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
      const data = JSON.parse(rawText); if (data.status !== 'ok' || !data.items) throw new Error('JSON API error');
      return data.items.map(item => ({ id: item.link, title: item.title, link: item.link, summary: stripHtml(item.description), image: item.thumbnail || (item.enclosure && item.enclosure.link) || '', ts: Date.parse(item.pubDate) || Date.now(), sourceId: source.id, sourceLabel: source.label, color: source.color }));
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
    out.push({ id: link, title, link, summary, image: extractImage(node, rawDesc) || '', ts, sourceId: source.id, sourceLabel: source.label, color: source.color });
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
        const xml = await fetchViaProxy(fetchUrl, { timeout: 6000 }); items = parseFeed(xml, source);
      }
      if (items.length > 0) {
        state.articles = dedupe([...items, ...state.articles]).sort((a, b) => b.ts - a.ts);
        newArticlesFound = true; renderNews(); enrichImages(items);
      }
    } catch (err) { console.warn('[FINWIRE] feed failed:', source.id, err.message); }
  }));
  if (!newArticlesFound && state.articles.length === 0) throw new Error('No feeds returned data');
}

/* --- NEWS RENDERING --- */
const ogCache = loadJSON('fw.ogimg', {});
function isJunkImage(url) { return /google\.com|gstatic|googleusercontent|ggpht\.com|doubleclick|feedburner|gravatar|placeholder/i.test(url) || /^data:/i.test(url); }
async function scrapeOgImage(articleUrl) {
  if (Object.prototype.hasOwnProperty.call(ogCache, articleUrl)) return ogCache[articleUrl];
  let found = '';
  try {
    const html = await fetchViaProxy(articleUrl, { timeout: 6000 });
    const patterns = [ /<meta[^>]+(?:property|name)\s*=\s*["']og:image(?::url|:secure_url)?["'][^>]*content\s*=\s*["']([^"']+)["']/i, /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]*(?:property|name)\s*=\s*["']og:image(?::url|:secure_url)?["']/i ];
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
      article.image = img;
      const card = document.querySelector(`.card[data-url="${article.link}"]`);
      if (card) { const thumb = card.querySelector('.thumb'); if (thumb && !thumb.querySelector('img')) { const imgEl = document.createElement('img'); imgEl.src = img; imgEl.loading = 'lazy'; imgEl.onerror = function() { this.remove(); }; thumb.appendChild(imgEl); } }
    }
  }
}

function matchWatch(article) { if (!state.watch.length) return false; const haystack = (article.title + ' ' + article.summary).toLowerCase(); return state.watch.some(kw => kw && haystack.indexOf(kw.toLowerCase()) !== -1); }

function cardHTML(article, variant) {
  const t = I18N[state.lang]; const isRead = state.read.has(article.link); const isHit = matchWatch(article);
  const classes = ['card', variant || 'grid', isRead ? 'read' : 'unread', isHit ? 'hit' : ''].filter(Boolean).join(' ');
  const thumbInner = article.image ? `<img src="${esc(article.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  const thumb = `<span class="thumb" style="--cat:${esc(article.color)}"><span class="thumb-fb">${esc(article.sourceLabel)}</span>${thumbInner}</span>`;
  const summary = (variant !== 'side' && article.summary) ? `<p class="summary">${esc(article.summary)}</p>` : '';
  const watchBadge = isHit ? `<span class="badge-watch">${esc(t.watch)}</span>` : '';
  const dot = isRead ? '' : '<span class="unread-dot" aria-hidden="true"></span>';
  return `<a class="${classes}" href="${esc(article.link)}" target="_blank" rel="noopener noreferrer" data-url="${esc(article.link)}">
    ${thumb}
    <div class="card-body">
      <div class="meta"><span class="src">${esc(article.sourceLabel)}</span><span class="sep">•</span><time class="ago" data-ts="${article.ts}">${esc(timeAgo(article.ts, state.lang))}</time>${watchBadge}</div>
      <h2 class="headline">${esc(article.title)}</h2>${summary}
    </div>${dot}</a>`;
}

function currentArticles() {
  let list = state.articles.slice();
  if (state.filter !== 'all') list = list.filter(a => a.sourceId === state.filter);
  if (state.unreadOnly) list = list.filter(a => !state.read.has(a.link));
  return list;
}

function renderNews() {
  const heroEl = $('#hero'), gridEl = $('#grid'), t = I18N[state.lang]; const list = currentArticles();
  if (!list.length) { if (heroEl) heroEl.innerHTML = ''; if (gridEl) gridEl.innerHTML = `<div class="empty">${esc(t.noArticles)}</div>`; return; }
  let heroIndex = list.findIndex(a => !!a.image); if (heroIndex < 0) heroIndex = 0;
  const hero = list[heroIndex]; const rest = list.slice(0, heroIndex).concat(list.slice(heroIndex + 1));
  const side = rest.slice(0, 4), grid = rest.slice(4);
  if (heroEl) heroEl.innerHTML = `<div class="hero-main">${cardHTML(hero, 'hero')}</div><div class="hero-side">${side.map(a => cardHTML(a, 'side')).join('')}</div>`;
  if (gridEl) gridEl.innerHTML = grid.map(a => cardHTML(a, 'grid')).join('');
}

function renderTicker(items) {
  const track = $('#tickerTrack'); if (!track || !items || !items.length) return;
  const locale = state.lang === 'id' ? 'id-ID' : 'en-US';
  const unit = items.map(t => {
    let priceTxt = typeof t.price === 'number' ? t.price.toLocaleString(locale, { maximumFractionDigits: 2 }) : '—';
    let changeTxt = '—', dir = 'flat';
    if (typeof t.change === 'number' && isFinite(t.change)) {
      dir = t.change > 0 ? 'up' : (t.change < 0 ? 'down' : 'flat');
      changeTxt = (dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : '') + Math.abs(t.change).toFixed(2) + '%';
    }
    return `<span class="tk"><span class="tk-sym">${esc(t.label)}</span><span class="tk-price">${esc(priceTxt)}</span><span class="tk-chg ${dir}">${esc(changeTxt)}</span></span>`;
  }).join('');
  track.innerHTML = unit.repeat(4);
}

/* --- DASHBOARD & CHART LOGIC --- */
async function fetchStockDetails(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const raw = await fetchViaProxy(url);
    const data = JSON.parse(raw);
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) throw new Error('No data');
    return { symbol: meta.symbol, name: meta.shortName || meta.symbol, price: meta.regularMarketPrice, prevClose: meta.chartPreviousClose || meta.regularMarketPrice };
  } catch (e) { return null; }
}

async function fetchHistory(symbol, range = '1mo') {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`;
    const raw = await fetchViaProxy(url);
    const data = JSON.parse(raw);
    const result = data?.chart?.result?.[0];
    if (!result) return [];
    const timestamps = result.timestamp || [];
    const quotes = result.indicators.quote[0].close || [];
    return timestamps.map((ts, i) => ({ x: new Date(ts * 1000).getTime(), y: quotes[i] })).filter(p => p.y !== null);
  } catch (e) { return []; }
}

async function loadMarketDashboard() {
  const dash = $('#stockDashboard');
  dash.innerHTML = '<div style="text-align:center;padding:40px;color:#666;">Loading terminal data...</div>';

  const sumSymbols = [{ s: '^JKSE', n: 'IHSG' }, { s: '^GSPC', n: 'S&P 500' }, { s: 'IDR=X', n: 'USD/IDR' }, { s: 'GC=F', n: 'Gold' }];
  const summaryData = await Promise.all(sumSymbols.map(async x => {
    const hist = await fetchHistory(x.s, '1mo');
    const price = hist.length ? hist[hist.length - 1].y : 0;
    const prev = hist.length > 1 ? hist[hist.length - 2].y : price;
    return { name: x.n, symbol: x.s, price, change: prev ? ((price - prev) / prev) * 100 : 0, spark: hist };
  }));

  const mainChartData = await fetchHistory('^JKSE', '6mo');

  const moversRaw = await Promise.all(['BBCA.JK', 'BBRI.JK', 'GOTO.JK', 'AAPL', 'TSLA', 'NVDA'].map(fetchStockDetails));
  const movers = moversRaw.filter(Boolean).map(s => { s.pct = ((s.price - s.prevClose) / s.prevClose) * 100; return s; }).sort((a, b) => b.pct - a.pct);

  const idxSymbols = ['BMRI.JK', 'TLKM.JK', 'ASII.JK', 'AMRT.JK'];
  const idxStocks = (await Promise.all(idxSymbols.map(fetchStockDetails))).filter(Boolean).map(s => { s.pct = ((s.price - s.prevClose) / s.prevClose) * 100; return s; });

  dash.innerHTML = `
    <div class="sparkline-grid" id="sparkGrid"></div>
    <div class="dash-grid">
      <div class="modern-card">
        <div class="card-title">IHSG Market Performance <span style="color:var(--green);font-size:12px;">6 Month Trend</span></div>
        <div id="mainChart"></div>
      </div>
      <div class="modern-card">
        <div class="card-title">Market Movers</div>
        <div class="movers-list" id="moversList"></div>
      </div>
    </div>
    <div style="margin-top: 32px;">
      <h2 class="page-title" style="font-size: 24px; margin-bottom: 16px;">IDX Bluechips</h2>
      <div class="stock-card-grid" id="idxGrid"></div>
    </div>
  `;

  $('#sparkGrid').innerHTML = summaryData.map(d => `
    <div class="spark-card">
      <div class="spark-header"><span class="spark-name">${d.name}</span><span class="spark-chg ${d.change >= 0 ? 'up' : 'down'}">${d.change >= 0 ? '▲' : '▼'} ${Math.abs(d.change).toFixed(2)}%</span></div>
      <div class="spark-val">${d.price.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
      <div id="spark-${d.symbol.replace('^', '').replace('=', '')}"></div>
    </div>
  `).join('');

  if (typeof ApexCharts !== 'undefined') {
    summaryData.forEach(d => {
      new ApexCharts(document.querySelector(`#spark-${d.symbol.replace('^', '').replace('=', '')}`), {
        series: [{ data: d.spark.map(p => p.y) }], chart: { type: 'area', height: 50, sparkline: { enabled: true } },
        stroke: { curve: 'smooth', width: 2 }, colors: [d.change >= 0 ? '#0a8f4a' : '#d10a11'],
        fill: { type: 'gradient', gradient: { opacityFrom: 0.4, opacityTo: 0 } }, tooltip: { enabled: false }
      }).render();
    });

    new ApexCharts(document.querySelector("#mainChart"), {
      series: [{ name: 'IHSG', data: mainChartData }], chart: { type: 'area', height: 320, toolbar: { show: false }, fontFamily: 'Inter' },
      colors: ['#d10a11'], fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0 } },
      dataLabels: { enabled: false }, stroke: { curve: 'smooth', width: 3 },
      xaxis: { type: 'datetime' }, yaxis: { labels: { formatter: v => v.toFixed(0) } }, grid: { borderColor: '#f1f3f5', strokeDashArray: 4 }
    }).render();
  }

  $('#moversList').innerHTML = movers.slice(0, 5).map(s => `
    <div class="mover-item">
      <div><div class="mover-sym">${s.symbol.replace('.JK', '')}</div><div class="mover-name">${s.name}</div></div>
      <div style="text-align:right;"><div class="mover-price">${s.price.toLocaleString('en-US')}</div><div class="mover-pct ${s.pct >= 0 ? 'up' : 'down'}">${s.pct > 0 ? '+' : ''}${s.pct.toFixed(2)}%</div></div>
    </div>
  `).join('');

  $('#idxGrid').innerHTML = idxStocks.map(s => `
    <a href="https://finance.yahoo.com/quote/${s.symbol}" target="_blank" class="stock-card">
      <div class="sc-header"><div><div class="sc-sym">${s.symbol.replace('.JK', '')}</div><div class="sc-name">${s.name}</div></div><div class="sc-chg ${s.pct >= 0 ? 'up' : 'down'}">${s.pct > 0 ? '+' : ''}${s.pct.toFixed(2)}%</div></div>
      <div class="sc-price">${s.price.toLocaleString('en-US')}</div>
    </a>
  `).join('');
}

/* --- FILTERS & UI BINDING --- */
function renderFilters() {
  const bar = $('#filters'); if (!bar) return; const t = I18N[state.lang];
  const sourceChips = SOURCES.map(s => `<button type="button" class="chip${state.filter === s.id ? ' active' : ''}" data-filter="${esc(s.id)}">${esc(s.label)}</button>`).join('');
  bar.innerHTML = `<div class="filters-inner">
    <button type="button" class="chip${state.filter === 'all' ? ' active' : ''}" data-filter="all">${esc(t.all)}</button>
    ${sourceChips}<span class="spacer"></span>
    <label class="switch"><input type="checkbox" id="unreadToggle"${state.unreadOnly ? ' checked' : ''}><span>${esc(t.unreadOnly)}</span></label>
  </div>`;
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
  renderFilters(); renderNews();
}

function switchView(view) {
  if (view === 'news') {
    $('#newsView').style.display = 'block'; $('#stocksView').style.display = 'none'; $('#filters').style.display = 'block';
    $('#navNews').classList.add('active'); $('#navStocks').classList.remove('active');
  } else {
    $('#newsView').style.display = 'none'; $('#stocksView').style.display = 'block'; $('#filters').style.display = 'none';
    $('#navNews').classList.remove('active'); $('#navStocks').classList.add('active');
    if (!$('#stockDashboard').children.length) loadMarketDashboard();
  }
}

function bindUI() {
  $('#navNews')?.addEventListener('click', () => switchView('news'));
  $('#navStocks')?.addEventListener('click', () => switchView('stocks'));

  $('#filters').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-filter]'); if (!chip) return;
    state.filter = chip.getAttribute('data-filter');
    $$('#filters .chip').forEach(c => c.classList.toggle('active', c === chip)); renderNews();
  });

  $('#filters').addEventListener('change', (e) => { if (e.target && e.target.id === 'unreadToggle') { state.unreadOnly = e.target.checked; renderNews(); } });

  $$('.lang-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.getAttribute('data-lang') === state.lang) return;
      state.lang = btn.getAttribute('data-lang'); localStorage.setItem(LS.lang, state.lang);
      applyLang();
    });
  });

  $('#markAllRead').addEventListener('click', () => { currentArticles().forEach(a => state.read.add(a.link)); saveJSON(LS.read, Array.from(state.read).slice(-1000)); renderNews(); });
  $('#refreshBtn').addEventListener('click', () => { loadNews(true); loadMarketDashboard(); });

  const input = $('#watchInput');
  const addKeyword = () => {
    const raw = (input.value || '').trim(); if (!raw) return;
    if (!state.watch.some(k => k.toLowerCase() === raw.toLowerCase())) { state.watch.push(raw); saveJSON(LS.watch, state.watch); renderWatchChips(); renderNews(); }
    input.value = '';
  };
  $('#watchAdd')?.addEventListener('click', addKeyword);
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } });

  $('#watchChips')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-watch]'); if (!btn) return;
    const idx = parseInt(btn.getAttribute('data-remove-watch'), 10);
    if (!isNaN(idx)) { state.watch.splice(idx, 1); saveJSON(LS.watch, state.watch); renderWatchChips(); renderNews(); }
  });

  document.addEventListener('click', (e) => {
    const card = e.target.closest('a.card'); if (!card) return;
    const url = card.getAttribute('data-url'); if (!url || state.read.has(url)) return;
    state.read.add(url); saveJSON(LS.read, Array.from(state.read).slice(-1000));
    card.classList.remove('unread'); card.classList.add('read');
    const dot = card.querySelector('.unread-dot'); if (dot) dot.remove();
  });
}

async function loadNews(force) {
  const cached = loadJSON(LS.news, null);
  if (cached && cached.articles && cached.articles.length > 0) {
    state.articles = cached.articles; state.lastTs = cached.ts;
    renderNews();
    if (!force && (Date.now() - cached.ts) < CACHE_TTL) return;
  }
  try {
    await fetchAllNews(); saveJSON(LS.news, { ts: Date.now(), articles: state.articles });
  } catch (err) { }
}

function init() {
  const savedLang = localStorage.getItem(LS.lang); state.lang = (savedLang === 'id' || savedLang === 'en') ? savedLang : 'en';
  const savedRead = loadJSON(LS.read, []); state.read = new Set(Array.isArray(savedRead) ? savedRead : []);
  const savedWatch = loadJSON(LS.watch, null); state.watch = Array.isArray(savedWatch) ? savedWatch : [];

  bindUI();
  renderFilters();
  renderWatchChips();
  applyLang();
  
  loadNews(false);
  loadMarketDashboard();
}

document.addEventListener('DOMContentLoaded', init);