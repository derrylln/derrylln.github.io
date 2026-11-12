/* ============================================================
   FINWIRE — client-side financial news aggregator
   ============================================================ */
'use strict';

const CACHE_TTL       = 15 * 60 * 1000;
const AUTO_REFRESH_MS = 15 * 60 * 1000;
const MAX_ARTICLES    = 3000;
const NEWS_MAX_AGE_MS = 48 * 60 * 60 * 1000; // news page never shows older stories

const LS = {
  news: 'finwire.news.v4', ticker: 'finwire.ticker.v3', read: 'finwire.read.v2',
  watch: 'finwire.watch.v2', lang: 'finwire.lang.v2', ogimg: 'finwire.ogimg.v3',
  theme: 'finwire.theme.v1' // NEW
};

const SOURCES = [
  { id: 'bloomberg', label: 'Bloomberg', color: '#111827', url: 'https://feeds.bloomberg.com/markets/news.rss', region: 'global' },
  { id: 'reuters', label: 'Reuters', color: '#7c2d12', url: 'https://news.google.com/rss/search?q=when:24h+site:reuters.com/business&hl=en-US&gl=US&ceid=US:en', region: 'global' },
  { id: 'marketwatch', label: 'MarketWatch', color: '#059669', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', region: 'global' },
  { id: 'cnbc', label: 'CNBC Indonesia', color: '#e11d48', url: 'https://www.cnbcindonesia.com/market/rss', region: 'id' },
  { id: 'kontan', label: 'Kontan', color: '#14532d', url: 'https://investasi.kontan.co.id/rss', region: 'id' },
  // The Google News search for this site returns opaque redirect links with no
  // image at all; the publisher's own feed carries a photo enclosure per story.
  { id: 'idn', label: 'IDN Financials', color: '#4c1d95', url: 'https://www.idnfinancials.com/feed', region: 'id' },
  { id: 'antara', label: 'Antara Ekonomi', color: '#b91c1c', url: 'https://www.antaranews.com/rss/ekonomi', region: 'id' },
  { id: 'cnn_id', label: 'CNN Ekonomi', color: '#dc2626', url: 'https://www.cnnindonesia.com/ekonomi/rss', region: 'id' },
  // National and political desks. A resignation, a court ruling or an impeachment
  // never reaches a business-only feed, which left the page blind to the biggest
  // story of the day.
  { id: 'cnn_nasional', label: 'CNN Nasional', color: '#b91c1c', url: 'https://www.cnnindonesia.com/nasional/rss', region: 'id' },
  { id: 'cnbc_news', label: 'CNBC News', color: '#9f1239', url: 'https://www.cnbcindonesia.com/news/rss', region: 'id' },
  { id: 'antara_terkini', label: 'Antara Terkini', color: '#7f1d1d', url: 'https://www.antaranews.com/rss/terkini', region: 'id' },
  { id: 'tempo_nasional', label: 'Tempo Nasional', color: '#9a3412', url: 'https://rss.tempo.co/nasional', zone: '+07:00', region: 'id' },
  { id: 'tempo', label: 'Tempo Bisnis', color: '#ea580c', url: 'https://rss.tempo.co/bisnis', zone: '+07:00', region: 'id' },
  // Global and US desks: world news, US markets and business, kept separate from
  // the Indonesian desks by the region filter.
  { id: 'cnbc_us', label: 'CNBC US', color: '#1e3a8a', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', region: 'global' },
  { id: 'nyt_world', label: 'NYT World', color: '#0f172a', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', region: 'global' },
  { id: 'nyt_business', label: 'NYT Business', color: '#1f2937', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', region: 'global' },
  { id: 'guardian_world', label: 'Guardian World', color: '#0c4a6e', url: 'https://www.theguardian.com/world/rss', region: 'global' },
  { id: 'wsj_us', label: 'WSJ US Business', color: '#052e16', url: 'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml', region: 'global' }
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
  { id: 'politics', label: 'Politics', keywords: ['politik', 'presiden', 'wapres', 'wakil presiden', 'prabowo', 'gibran', 'dpr', 'mpr', 'menteri', 'pemerintah', 'pemilu', 'pemakzulan', 'impeachment', 'partai', 'kpk', 'mahkamah'] },
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
    regions: { all: 'All', id: 'Indonesia', global: 'Global & US' },
    regionFilter: 'Region', topicFilter: 'Topic', sourceFilter: 'Source', allSources: 'All sources',
    navNews: 'News', navMarkets: 'Markets', mktTitle: 'Market Data', searchPh: 'Search ticker…', searchBtn: 'Search',
    stockLoading: 'Fetching market data…', stockSearch: 'Searching…', stockNoRes: 'No results found.', stockErr: 'Search failed.',
    cats: { all: 'All Topics', markets: 'Markets', macro: 'Macro', politics: 'Politics', tech: 'Tech', crypto: 'Crypto', commodities: 'Commodities' },
    portfolio: {
      title: 'Portfolio Tracker', subtitle: 'Your positions, tracked in this browser',
      symPh: 'Ticker (AAPL, BBCA.JK)', sharesPh: 'Shares', costPh: 'Avg cost / share', add: 'Add',
      empty: 'No holdings yet. Add a ticker, your share count and the average cost to start tracking.',
      marketValue: 'Market Value', costBasis: 'Cost Basis', totalPl: 'Total P/L',
      colSym: 'Symbol', colShares: 'Shares', colCost: 'Avg Cost', colLast: 'Last', colValue: 'Value', colPl: 'P/L',
      remove: 'Remove', note: 'Prices from Yahoo Finance and may be delayed. Holdings are saved in this browser only.',
      invalidSym: 'Enter a valid ticker, e.g. AAPL or BBCA.JK.', invalidQty: 'Shares must be greater than zero.',
      invalidCost: 'Average cost cannot be negative.',
      curLabel: 'Show in', curAuto: 'Auto', costIn: 'Cost in',
      notFound: 'No price found for {sym}. Check the ticker — IDX stocks need .JK, e.g. CUAN.JK.',
      unresolved: 'No price found',
      fxNote: 'Converted at 1 USD = {rate}',
      today: 'Today', details: 'Details', aiRead: 'AI fundamental read', whyMoved: 'Why it moved',
      loadingFund: 'Loading fundamentals…', newsTitle: 'News on your holdings',
      whyNoNews: 'No news about {sym} today. Check the company filings for the reason.',
      whyFailed: 'No analysis came back. Try again.'
    },
    fund: {
      title: 'Fundamentals', mktCap: 'Market cap', pe: 'P/E', rev: 'Revenue', revGrowth: 'Revenue growth',
      yoy: 'Revenue YoY', netIncome: 'Net income', netMargin: 'Net margin', eps: 'EPS', roe: 'ROE',
      fcf: 'Free cash flow', fy: 'FY', period: 'Reporting period', note: 'Yahoo Finance',
      converted: r => `Statement in USD, converted at Rp ${r}/USD`, reportedIn: c => `Statement reported in ${c}`,
      noData: 'No figures reported for this period.'
    },
    fundAi: {
      btn: 'AI', title: 'AI fundamental read', loading: 'Reading the numbers…',
      failed: 'No analysis came back. Try again.',
      unavailable: 'The AI analysis endpoint is not deployed on the worker yet.',
      note: 'Based only on the figures above · Yahoo Finance · not investment advice'
    },
    mkt: {
      asOf: 'Prices as of', delayed: 'Yahoo Finance · delayed', pulse: 'Market pulse',
      breadth: 'Breadth', adv: 'advancers', dec: 'decliners', topGainer: 'Top IDX gainer',
      topYield: 'Top dividend yield', dividends: 'Dividend Leaders · IDX',
      divSub: 'Ranked by trailing 12-month yield', divLoading: 'Ranking IDX dividends…',
      divEmpty: 'No dividend data for the tracked IDX names.',
      colRank: '#', colSym: 'Symbol', colName: 'Company', colPrice: 'Price',
      colDps: 'DPS 12m', colYield: 'Yield', colPays: 'Payouts', colEx: 'Last ex-date',
      divNote: 'Trailing 12-month dividends ÷ last price · Yahoo Finance · not investment advice',
      divFilter: 'Min yield', divAll: 'All', divNoMatch: 'No name clears that yield hurdle.'
    }
  },
  id: {
    tagline: 'Pasar · Bisnis · Ekonomi', markAllRead: 'Tandai semua dibaca', watchPh: 'Tambah kata kunci pantauan…',
    refresh: 'Muat ulang', all: 'Semua', unreadOnly: 'Belum dibaca', loading: 'Mengambil berita terbaru…',
    noArticles: 'Tidak ada berita yang cocok.', liveLabel: 'Langsung', cacheLabel: 'Cache', staleLabel: 'Offline · cache',
    errorLabel: 'Gagal memuat feed.', updated: 'Diperbarui', watch: 'Pantau',
    footer: 'FINWIRE — agregator berita pasar berbasis klien.', justNow: 'baru saja', minAgo: n => `${n}m lalu`,
    hourAgo: n => `${n}j lalu`, dayAgo: n => `${n} hari lalu`, stories: n => `${n} berita`, added: 'Ditambahkan',
    regions: { all: 'Semua', id: 'Indonesia', global: 'Global & AS' },
    regionFilter: 'Wilayah', topicFilter: 'Topik', sourceFilter: 'Sumber', allSources: 'Semua sumber',
    navNews: 'Berita', navMarkets: 'Pasar', mktTitle: 'Data Pasar', searchPh: 'Cari ticker…', searchBtn: 'Cari',
    stockLoading: 'Memuat data pasar…', stockSearch: 'Mencari…', stockNoRes: 'Tidak ada hasil.', stockErr: 'Pencarian gagal.',
    cats: { all: 'Semua Topik', markets: 'Pasar', macro: 'Makro', politics: 'Politik', tech: 'Teknologi', crypto: 'Kripto', commodities: 'Komoditas' },
    portfolio: {
      title: 'Pelacak Portofolio', subtitle: 'Posisi Anda, tersimpan di peramban ini',
      symPh: 'Ticker (AAPL, BBCA.JK)', sharesPh: 'Lembar', costPh: 'Harga rata-rata / lembar', add: 'Tambah',
      empty: 'Belum ada posisi. Tambahkan ticker, jumlah lembar, dan harga rata-rata untuk mulai melacak.',
      marketValue: 'Nilai Pasar', costBasis: 'Modal', totalPl: 'Laba/Rugi',
      colSym: 'Simbol', colShares: 'Lembar', colCost: 'Harga Rata²', colLast: 'Terakhir', colValue: 'Nilai', colPl: 'L/R',
      remove: 'Hapus', note: 'Harga dari Yahoo Finance dan dapat tertunda. Posisi hanya tersimpan di peramban ini.',
      invalidSym: 'Masukkan ticker yang valid, mis. AAPL atau BBCA.JK.', invalidQty: 'Jumlah lembar harus lebih dari nol.',
      invalidCost: 'Harga rata-rata tidak boleh negatif.',
      curLabel: 'Tampilkan dalam', curAuto: 'Otomatis', costIn: 'Harga dalam',
      notFound: 'Harga {sym} tidak ditemukan. Periksa ticker — saham IDX perlu .JK, mis. CUAN.JK.',
      unresolved: 'Harga tidak ditemukan',
      fxNote: 'Dikonversi pada 1 USD = {rate}',
      today: 'Hari ini', details: 'Rincian', aiRead: 'Analisis fundamental AI', whyMoved: 'Kenapa berubah',
      loadingFund: 'Memuat fundamental…', newsTitle: 'Berita emiten Anda',
      whyNoNews: 'Belum ada berita {sym} hari ini. Periksa laporan perusahaan untuk penyebabnya.',
      whyFailed: 'Analisis tidak tersedia. Coba lagi.'
    },
    fund: {
      title: 'Fundamental', mktCap: 'Kap. pasar', pe: 'P/E', rev: 'Pendapatan', revGrowth: 'Pertumbuhan pendapatan',
      yoy: 'Pendapatan YoY', netIncome: 'Laba bersih', netMargin: 'Margin bersih', eps: 'EPS', roe: 'ROE',
      fcf: 'Arus kas bebas', fy: 'TA', period: 'Periode laporan', note: 'Yahoo Finance',
      converted: r => `Laporan dalam USD, dikonversi Rp ${r}/USD`, reportedIn: c => `Laporan dalam ${c}`,
      noData: 'Tidak ada angka untuk periode ini.'
    },
    fundAi: {
      btn: 'AI', title: 'Analisis fundamental AI', loading: 'Membaca angka…',
      failed: 'Analisis tidak tersedia. Coba lagi.',
      unavailable: 'Endpoint analisis AI belum di-deploy di worker.',
      note: 'Hanya berdasarkan angka di atas · Yahoo Finance · bukan saran investasi'
    },
    mkt: {
      asOf: 'Harga per', delayed: 'Yahoo Finance · tertunda', pulse: 'Denyut pasar',
      breadth: 'Breadth', adv: 'naik', dec: 'turun', topGainer: 'Gainer IDX teratas',
      topYield: 'Yield tertinggi', dividends: 'Pemimpin Dividen · IDX',
      divSub: 'Diurutkan dari yield 12 bulan terakhir', divLoading: 'Menghitung dividen IDX…',
      divEmpty: 'Belum ada data dividen untuk emiten IDX yang dipantau.',
      colRank: '#', colSym: 'Simbol', colName: 'Emiten', colPrice: 'Harga',
      colDps: 'DPS 12 bln', colYield: 'Yield', colPays: 'Bayar', colEx: 'Ex-date terakhir',
      divNote: 'Dividen 12 bulan terakhir ÷ harga terakhir · Yahoo Finance · bukan saran investasi',
      divFilter: 'Yield min', divAll: 'Semua', divNoMatch: 'Tidak ada emiten yang melewati batas yield itu.'
    }
  }
};

const SOURCE_BY_ID = {};
SOURCES.forEach(function (source) { SOURCE_BY_ID[source.id] = source; });

const state = { articles: [], ticker: [], filter: 'all', categoryFilter: 'all', region: 'all', unreadOnly: false, lang: 'en', read: new Set(), watch: [], lastTs: 0, lastKind: '', loading: false };

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
async function fetchTicker() {
  const settled = await Promise.allSettled(TICKERS.map(async (t) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t.symbol)}?interval=1d&range=5d`;
    const raw = await fetchViaProxy(url, { timeout: 6000 }); const data = JSON.parse(raw);
    const result = data?.chart?.result?.[0];
    const meta = result?.meta; if (!meta) throw new Error('No price');
    
    let price = meta.regularMarketPrice;
    let prev = meta.chartPreviousClose;
    const quotes = result.indicators?.quote?.[0]?.close || [];
    const validQuotes = quotes.filter(q => q !== null && q !== undefined);
    if (validQuotes.length >= 2) prev = validQuotes[validQuotes.length - 2];
    
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
  // The news page only ever shows the last 48 hours, however much is cached.
  const cutoff = Date.now() - NEWS_MAX_AGE_MS;
  let list = state.articles.filter(a => a.ts >= cutoff);
  if (state.filter !== 'all') list = list.filter(a => a.sourceId === state.filter);
  if (state.region !== 'all') {
    list = list.filter(function (a) {
      const source = SOURCE_BY_ID[a.sourceId];
      return source && source.region === state.region;
    });
  }
  if (state.categoryFilter !== 'all') list = list.filter(a => a.category === state.categoryFilter);
  if (state.unreadOnly) list = list.filter(a => !state.read.has(a.link));
  return list;
}

function render() {
  renderHoldingsNews();
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
  const bar = $('#filters'); if (!bar) return;
  const t = I18N[state.lang];
  const regionButtons = ['all', 'id', 'global'].map(r =>
    `<button type="button" class="seg-btn${state.region === r ? ' active' : ''}" data-region="${esc(r)}">${esc(t.regions[r])}</button>`).join('');
  const listedSources = SOURCES.filter(s => state.region === 'all' || s.region === state.region);
  const topicOptions = CATEGORIES.map(c =>
    `<option value="${esc(c.id)}"${state.categoryFilter === c.id ? ' selected' : ''}>${esc((t.cats && t.cats[c.id]) || c.label)}</option>`).join('');
  const sourceOptions = listedSources.map(s =>
    `<option value="${esc(s.id)}"${state.filter === s.id ? ' selected' : ''}>${esc(s.label)}</option>`).join('');

  bar.innerHTML = `
    <div class="filter-row">
      <div class="seg" role="group" aria-label="${esc(t.regionFilter)}">${regionButtons}</div>
      <select id="topicSelect" class="filter-select" aria-label="${esc(t.topicFilter)}">${topicOptions}</select>
      <select id="sourceSelect" class="filter-select" aria-label="${esc(t.sourceFilter)}">
        <option value="all"${state.filter === 'all' ? ' selected' : ''}>${esc(t.allSources)}</option>
        ${sourceOptions}
      </select>
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
  $$('[data-i18n-title]').forEach(el => { const key = el.getAttribute('data-i18n-title'); if (t[key]) el.setAttribute('title', t[key]); });
  $$('.lang-toggle button').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-lang') === state.lang));
  renderFilters(); renderTicker(state.ticker); renderPortfolio(); render(); refreshTimes();
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
    refreshPortfolio();
  }
}

async function fetchStockDetails(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const raw = await fetchViaProxy(url, { timeout: 8000 });
    const data = JSON.parse(raw);
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) throw new Error('No price data');

    let price = meta.regularMarketPrice;
    let prevClose = meta.chartPreviousClose;
    const quotes = result.indicators?.quote?.[0]?.close || [];
    const validQuotes = quotes.filter(q => q !== null && q !== undefined);
    if (validQuotes.length >= 2) prevClose = validQuotes[validQuotes.length - 2];
    if (!price && validQuotes.length > 0) price = validQuotes[validQuotes.length - 1];

    const pct = (price && prevClose) ? ((price - prevClose) / prevClose) * 100 : 0;

    return { 
      symbol: meta.symbol, name: meta.shortName || meta.symbol, price: price, prevClose: prevClose, pct: pct, currency: meta.currency || null,
      volume: meta.regularMarketVolume, dayHigh: meta.regularMarketDayHigh, dayLow: meta.regularMarketDayLow, 
      week52High: meta.fiftyTwoWeekHigh, week52Low: meta.fiftyTwoWeekLow 
    };
  } catch (e) { 
    return { symbol: symbol, name: symbol, price: null, prevClose: null, pct: 0, currency: null, volume: null, dayHigh: null, dayLow: null, week52High: null, week52Low: null };
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
      <td style="font-weight:800; color:var(--ink);">
        ${esc(s.symbol.replace('.JK', ''))}
        <button class="ai-btn explain-btn" data-sym="${esc(s.symbol)}" data-pct="${s.pct.toFixed(2)}" data-up="${s.pct >= 0}" style="padding: 2px 6px; font-size: 9px; margin-left: 4px; border-radius: 4px;">✨</button>
      </td>
      <td style="color:var(--muted); font-size:11px;">${esc(s.name)}</td>
      <td style="text-align:right; font-weight:600;">${s.price.toLocaleString('en-US')}</td>
      <td style="text-align:right; font-weight:700; color:${s.pct >= 0 ? 'var(--green)' : 'var(--red)'}">${s.pct > 0 ? '+' : ''}${s.pct.toFixed(2)}%</td>
    </tr>
    <tr id="explain-row-${esc(s.symbol)}" style="display:none;">
      <td colspan="4" style="padding: 0; border-bottom: none;">
         <div id="explain-text-${esc(s.symbol)}" class="ai-summary-box" style="margin: 8px 16px; border-left-color: var(--ink);"></div>
      </td>
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
const chartInstances = [];

function destroyCharts() {
  chartInstances.forEach(c => { try { c.destroy(); } catch (e) {} });
  chartInstances.length = 0;
  ihsgChart = null; sp500Chart = null;
}

function applyChartTheme(theme) {
  const isDark = theme === 'dark';
  chartInstances.forEach(c => {
    try {
      c.updateOptions({ theme: { mode: isDark ? 'dark' : 'light' }, grid: { borderColor: isDark ? '#334155' : '#f1f3f5' } });
    } catch (e) {}
  });
}

/* FUNDAMENTALS
   Yahoo's quoteSummary endpoint now demands a crumb cookie, but the public
   fundamentals-timeseries feed does not — and it covers IDX listings too.
   Annual and quarterly periods come back in the same call, so the reader can
   switch between FY2025 and the latest quarters without another request. */
const fundCache = new Map();
const FUND_TYPES = ['trailingMarketCap', 'trailingPeRatio',
  'annualTotalRevenue', 'annualNetIncome', 'annualDilutedEPS', 'annualFreeCashFlow', 'annualStockholdersEquity',
  'quarterlyTotalRevenue', 'quarterlyNetIncome', 'quarterlyDilutedEPS', 'quarterlyFreeCashFlow', 'quarterlyStockholdersEquity'];

async function fetchFundamentals(symbol) {
  if (fundCache.has(symbol)) return fundCache.get(symbol);
  const now = Math.floor(Date.now() / 1000);
  const url = `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}` +
    `?symbol=${encodeURIComponent(symbol)}&type=${FUND_TYPES.join(',')}&period1=1500000000&period2=${now}`;
  const data = JSON.parse(await fetchViaProxy(url, { timeout: 8000 }));
  const results = (data.timeseries && data.timeseries.result) || [];
  const raw = {};
  results.forEach(r => {
    const type = r && r.meta && r.meta.type && r.meta.type[0];
    if (!type) return;
    const points = (r[type] || []).filter(v => v && v.reportedValue && isFinite(v.reportedValue.raw))
      .map(v => ({ raw: v.reportedValue.raw, date: v.asOfDate, currency: v.currencyCode || null }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (points.length) raw[type] = points;
  });

  // Some IDX listings (petrochemicals, coal) publish statements in US dollars
  // while the shares trade in rupiah. Showing a dollar revenue beside a rupiah
  // market cap reads as a company worth more than the whole US tech sector, so
  // statement figures are converted at spot and the note says so.
  const isIdx = /\.JK$/i.test(symbol);
  const stmtTypes = ['annualTotalRevenue', 'annualNetIncome', 'annualDilutedEPS', 'annualFreeCashFlow', 'annualStockholdersEquity'];
  const stmtCurrency = stmtTypes.map(t => { const s = raw[t]; return s && s.length ? s[s.length - 1].currency : null; }).filter(Boolean)[0] || null;
  let fx = 1;
  let converted = null;
  if (isIdx && stmtCurrency && stmtCurrency !== 'IDR' && stmtCurrency === 'USD') {
    const rate = await refreshFxRate().catch(() => null);
    if (isFinite(rate) && rate > 0) { fx = rate; converted = { from: 'USD', rate: rate }; }
  }

  const series = {};
  Object.keys(raw).forEach(type => {
    const trailing = type.indexOf('trailing') === 0;
    series[type] = raw[type].map(point => ({
      raw: point.raw * (trailing ? 1 : fx),
      date: point.date,
      currency: trailing ? point.currency : (isIdx ? (fx !== 1 ? 'IDR' : (stmtCurrency || point.currency)) : point.currency)
    }));
  });

  const last = k => (series[k] ? series[k][series[k].length - 1] : null);
  const annual = buildPeriods(series, 'annual');
  const fund = {
    mktCap: last('trailingMarketCap'),
    pe: last('trailingPeRatio'),
    annual: annual,
    periods: buildPeriods(series, 'quarterly').concat(annual),
    roe: annual.length ? annual[0].roe : null,
    converted: converted,
    stmtCurrency: stmtCurrency
  };
  fund.currency = (fund.mktCap && fund.mktCap.currency) || fundCurrencySymbol(symbol);
  fundCache.set(symbol, fund);
  return fund;
}

/* One entry per reported period, newest first. Growth compares with the same
   period a year earlier, so a quarter is never measured against the previous
   quarter's seasonality. */
function buildPeriods(series, kind) {
  const prefix = kind === 'annual' ? 'annual' : 'quarterly';
  const dates = {};
  ['TotalRevenue', 'NetIncome', 'DilutedEPS', 'FreeCashFlow', 'StockholdersEquity'].forEach(field => {
    (series[prefix + field] || []).forEach(point => { dates[point.date] = true; });
  });
  const at = (field, date) => (series[prefix + field] || []).filter(point => point.date === date)[0] || null;
  const list = Object.keys(dates).sort().reverse().map(date => ({
    kind: kind === 'annual' ? 'FY' : 'Q',
    end: date,
    revenue: at('TotalRevenue', date),
    netIncome: at('NetIncome', date),
    equity: at('StockholdersEquity', date),
    eps: at('DilutedEPS', date),
    fcf: at('FreeCashFlow', date)
  }));
  list.forEach(period => {
    const month = period.end.slice(5, 7);
    const priorYear = String(Number(period.end.slice(0, 4)) - 1);
    const prior = list.filter(other => other.end.slice(5, 7) === month && other.end.slice(0, 4) === priorYear)[0] || null;
    period.growth = (period.revenue && prior && prior.revenue && prior.revenue.raw)
      ? (period.revenue.raw / prior.revenue.raw - 1) * 100 : null;
    period.margin = (period.netIncome && period.revenue && period.revenue.raw)
      ? (period.netIncome.raw / period.revenue.raw) * 100 : null;
    period.roe = (kind === 'annual' && period.netIncome && period.equity && period.equity.raw)
      ? (period.netIncome.raw / period.equity.raw) * 100 : null;
  });
  return list;
}

function fundCurrencySymbol(symbol) { return /\.JK$/i.test(symbol) ? 'IDR' : null; }

function compactNum(raw, currency) {
  if (!isFinite(raw)) return '—';
  const prefix = currency === 'IDR' ? 'Rp ' : currency === 'USD' ? '$' : (currency ? currency + ' ' : '');
  const abs = Math.abs(raw);
  if (abs >= 1e12) return prefix + (raw / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return prefix + (raw / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return prefix + (raw / 1e6).toFixed(1) + 'M';
  return prefix + raw.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function periodLabel(period, t) {
  const year = period.end.slice(0, 4);
  if (period.kind === 'FY') return t.fy + ' ' + year;
  return 'Q' + (Math.floor((Number(period.end.slice(5, 7)) - 1) / 3) + 1) + ' ' + year;
}

function efNote(fund, t) {
  const parts = [];
  if (fund.converted) parts.push(t.converted(Math.round(fund.converted.rate).toLocaleString('en-US')));
  else if (fund.stmtCurrency && fund.stmtCurrency !== (fund.mktCap && fund.mktCap.currency)) parts.push(t.reportedIn(fund.stmtCurrency));
  parts.push(t.note);
  return parts.join(' · ');
}

function efGrid(fund, period, t) {
  const rows = [];
  const val = point => compactNum(point.raw, point.currency);
  if (fund.mktCap) rows.push([t.mktCap, compactNum(fund.mktCap.raw, fund.mktCap.currency || fund.currency)]);
  if (fund.pe) rows.push([t.pe, fund.pe.raw.toFixed(1)]);
  if (period.revenue) rows.push([t.rev, val(period.revenue)]);
  if (period.growth !== null) rows.push([period.kind === 'Q' ? t.yoy : t.revGrowth, (period.growth >= 0 ? '+' : '') + period.growth.toFixed(1) + '%']);
  if (period.netIncome) rows.push([t.netIncome, val(period.netIncome)]);
  if (period.margin !== null) rows.push([t.netMargin, period.margin.toFixed(1) + '%']);
  if (period.eps) rows.push([t.eps, val(period.eps)]);
  if (period.roe !== null) rows.push([t.roe, period.roe.toFixed(1) + '%']);
  if (period.fcf) rows.push([t.fcf, val(period.fcf)]);
  if (!rows.length) return `<div class="ef-empty">${esc(t.noData)}</div>`;
  return rows.map(([label, value]) =>
    `<div class="ef-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join('');
}

function fundamentalsHTML(fund, lang, symbol) {
  if (!fund || !fund.periods.length) return '';
  const t = I18N[lang].fund;
  const options = fund.periods.map((period, i) =>
    `<option value="${i}">${esc(periodLabel(period, t))}</option>`).join('');
  return `<div class="explain-fundamentals" data-ef="${esc(symbol)}">
    <div class="ef-head">
      <span>${esc(t.title)}</span>
      <select class="ef-period" aria-label="${esc(t.period)}">${options}</select>
    </div>
    <div class="ef-grid">${efGrid(fund, fund.periods[0], t)}</div>
    <div class="ef-note">${esc(efNote(fund, t))}</div>
  </div>`;
}

/* AI READ OF THE FIGURES
   The model gets exactly the lines the panel can show — recent quarters plus
   the last two fiscal years — so its verdict can only rest on reported numbers. */
function fundFigureLines(fund, lang) {
  const t = I18N[lang].fund;
  const lines = [];
  if (fund.mktCap) lines.push(`${t.mktCap}: ${compactNum(fund.mktCap.raw, fund.mktCap.currency || fund.currency)}`);
  if (fund.pe) lines.push(`${t.pe}: ${fund.pe.raw.toFixed(1)}`);
  const periods = fund.periods.filter(p => p.kind === 'Q').slice(0, 3)
    .concat(fund.periods.filter(p => p.kind === 'FY').slice(0, 2));
  periods.forEach(period => {
    const tag = `[${periodLabel(period, t)}] `;
    if (period.revenue) lines.push(tag + t.rev + ': ' + compactNum(period.revenue.raw, period.revenue.currency));
    if (period.growth !== null) lines.push(tag + (period.kind === 'Q' ? t.yoy : t.revGrowth) + ': ' + (period.growth >= 0 ? '+' : '') + period.growth.toFixed(1) + '%');
    if (period.netIncome) lines.push(tag + t.netIncome + ': ' + compactNum(period.netIncome.raw, period.netIncome.currency));
    if (period.margin !== null) lines.push(tag + t.netMargin + ': ' + period.margin.toFixed(1) + '%');
    if (period.eps) lines.push(tag + t.eps + ': ' + compactNum(period.eps.raw, period.eps.currency));
    if (period.roe !== null) lines.push(tag + t.roe + ': ' + period.roe.toFixed(1) + '%');
    if (period.fcf) lines.push(tag + t.fcf + ': ' + compactNum(period.fcf.raw, period.fcf.currency));
  });
  if (fund.converted) lines.push(t.converted(Math.round(fund.converted.rate).toLocaleString('en-US')));
  return lines;
}

let fundAiModal = null;

function ensureFundAiModal() {
  if (fundAiModal) return fundAiModal;
  const wrap = document.createElement('div');
  wrap.className = 'ai-modal';
  wrap.innerHTML = `<div class="ai-modal-card" role="dialog" aria-modal="true" aria-labelledby="aiModalTitle">
    <div class="ai-modal-head">
      <span id="aiModalTitle"></span>
      <button type="button" class="ai-modal-close" aria-label="Close">×</button>
    </div>
    <div class="ai-modal-body"></div>
    <div class="ai-modal-note"></div>
  </div>`;
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || (e.target.closest && e.target.closest('.ai-modal-close'))) closeFundAi();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFundAi(); });
  document.body.appendChild(wrap);
  fundAiModal = wrap;
  return wrap;
}

function closeFundAi() {
  if (!fundAiModal) return;
  fundAiModal.classList.remove('open');
  const stop = fundAiModal.__stopClock;
  if (stop) { stop(); fundAiModal.__stopClock = null; }
}

async function openFundAi(symbol, name) {
  const modal = ensureFundAiModal();
  const t = I18N[state.lang].fundAi;
  const title = $('#aiModalTitle', modal);
  const body = $('.ai-modal-body', modal);
  const note = $('.ai-modal-note', modal);

  if (modal.__stopClock) { modal.__stopClock(); modal.__stopClock = null; }
  title.textContent = `${t.title} · ${name || symbol.replace(/\.JK$/i, '')}`;
  note.textContent = '';
  body.textContent = '';
  modal.classList.add('open');
  modal.__stopClock = startClock(body, t.loading);

  try {
    const fund = await fetchFundamentals(symbol);
    const lines = fundFigureLines(fund, state.lang);
    if (!lines.length) throw new Error(I18N[state.lang].fund.noData);
    const data = await aiRequest('/ai-fundamentals', {
      symbol: symbol.replace(/\.JK$/i, ''),
      name: name || '',
      lang: state.lang,
      figures: lines.join('\n')
    });
    if (modal.__stopClock) { modal.__stopClock(); modal.__stopClock = null; }
    body.textContent = (data && data.summary) ? data.summary.trim() : t.failed;
    note.textContent = t.note;
  } catch (err) {
    if (modal.__stopClock) { modal.__stopClock(); modal.__stopClock = null; }
    const message = aiErrorText(err);
    // A worker that predates this route answers 404/405 instead of an analysis.
    body.textContent = /\b(404|405)\b/.test(message) ? t.unavailable : message;
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest ? e.target.closest('.sc-ai') : null;
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const card = btn.closest('.stock-card');
  const name = card ? ($('.sc-name', card) || {}).textContent : '';
  openFundAi(btn.getAttribute('data-ai'), name);
});

// Switching period re-renders from the cached response — no second request.
document.addEventListener('change', (e) => {
  const select = e.target && e.target.closest ? e.target.closest('.ef-period') : null;
  if (!select) return;
  const panel = select.closest('.explain-fundamentals');
  const fund = panel && fundCache.get(panel.getAttribute('data-ef'));
  if (!fund) return;
  const period = fund.periods[parseInt(select.value, 10)];
  const grid = $('.ef-grid', panel);
  const note = $('.ef-note', panel);
  const t = I18N[state.lang].fund;
  if (period && grid) grid.innerHTML = efGrid(fund, period, t);
  if (note) note.textContent = efNote(fund, t);
});

/* Market Data shows dozens of cards, so each one asks for its own figures only
   when it scrolls into view — three requests at a time, cached for the session. */
const fundQueue = [];
let fundActive = 0;
let fundObserver = null;

function hydrateCardFundamentals(root) {
  const nodes = $$('[data-fund]', root);
  if (!nodes.length) return;
  if (!('IntersectionObserver' in window)) { nodes.forEach(queueCardFundamentals); return; }
  if (!fundObserver) {
    fundObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        fundObserver.unobserve(entry.target);
        queueCardFundamentals(entry.target);
      });
    }, { rootMargin: '200px' });
  }
  nodes.forEach(node => fundObserver.observe(node));
}

function queueCardFundamentals(node) {
  fundQueue.push(node);
  drainFundQueue();
}

function drainFundQueue() {
  while (fundActive < 3 && fundQueue.length) {
    const node = fundQueue.shift();
    fundActive++;
    fetchFundamentals(node.getAttribute('data-fund'))
      .then(fund => renderCardFundamentals(node, fund))
      .catch(() => { node.innerHTML = ''; })
      .finally(() => { fundActive--; drainFundQueue(); });
  }
}

function renderCardFundamentals(node, fund) {
  if (!node.isConnected) return;
  const t = I18N[state.lang].fund;
  const bits = [];
  if (fund.pe) bits.push(t.pe + ' ' + fund.pe.raw.toFixed(1));
  if (fund.mktCap) bits.push(compactNum(fund.mktCap.raw, fund.currency));
  if (isFinite(fund.roe)) bits.push(t.roe + ' ' + fund.roe.toFixed(0) + '%');
  if (!bits.length) { node.innerHTML = ''; return; }
  node.innerHTML = bits.map(b => '<span>' + esc(b) + '</span>').join('');
}

/* MARKET PULSE + DIVIDEND LEADERS
   The dashboard used to open with charts and a wall of cards, which read as a
   static report. These two pieces make it answer "what is happening right now?"
   before the reader scrolls: a pulse strip (index level, breadth, best mover,
   best yield) and an IDX dividend table ranked by trailing 12-month yield.

   Yahoo's quote endpoints need a crumb, but the chart endpoint exposes dividend
   events, so the yield is computed from the same public API the rest of the page
   already uses: sum of the last 12 months of dividends divided by the last price.
   Dividend history changes rarely, so rows are cached for half a day. */
const DIVIDEND_POOL = [
  ['BBCA', 'Bank Central Asia'], ['BBRI', 'Bank Rakyat Indonesia'], ['BMRI', 'Bank Mandiri'],
  ['BBNI', 'Bank Negara Indonesia'], ['BBTN', 'Bank Tabungan Negara'], ['BJTM', 'Bank Jatim'],
  ['TLKM', 'Telkom Indonesia'], ['ISAT', 'Indosat'], ['EXCL', 'XL Axiata'], ['TOWR', 'Sarana Menara'],
  ['INDF', 'Indofood Sukses'], ['ICBP', 'Indofood CBP'], ['UNVR', 'Unilever Indonesia'],
  ['KLBF', 'Kalbe Farma'], ['AMRT', 'Sumber Alfaria'], ['HMSP', 'HM Sampoerna'],
  ['GGRM', 'Gudang Garam'], ['SIDO', 'Sido Muncul'], ['ACES', 'Ace Hardware'],
  ['ADRO', 'Alamtri Resources'], ['PTBA', 'Bukit Asam'], ['ITMG', 'Indo Tambangraya'],
  ['UNTR', 'United Tractors'], ['ANTM', 'Aneka Tambang'], ['MDKA', 'Merdeka Copper'],
  ['INCO', 'Vale Indonesia'], ['TINS', 'Timah'], ['PGAS', 'Perusahaan Gas Negara'],
  ['ASII', 'Astra International'], ['SMGR', 'Semen Indonesia'], ['INTP', 'Indocement'],
  ['JPFA', 'Japfa Comfeed'], ['CPIN', 'Charoen Pokphand'], ['CTRA', 'Ciputra Development'],
  ['PWON', 'Pakuwon Jati'], ['BSDE', 'Bumi Serpong Damai'], ['MIKA', 'Mitra Keluarga']
].map(function (pair) { return { symbol: pair[0] + '.JK', name: pair[1] }; });

const DIV_CACHE_KEY = 'fw.dividends.v1';
const DIV_CACHE_TTL = 12 * 60 * 60 * 1000;
let divCache = loadJSON(DIV_CACHE_KEY, null);
if (!divCache || typeof divCache !== 'object' || !divCache.rows) divCache = { ts: 0, rows: {} };

function dividendRowFromChart(symbol, data) {
  const result = data && data.chart && data.chart.result && data.chart.result[0];
  if (!result || !result.meta) return null;
  const price = result.meta.regularMarketPrice;
  const events = (result.events && result.events.dividends) || {};
  const list = Object.keys(events).map(function (key) {
    return { ts: events[key].date * 1000, amount: events[key].amount };
  }).filter(function (d) { return isFinite(d.amount) && d.amount > 0; }).sort(function (a, b) { return a.ts - b.ts; });
  if (!price || !list.length) return null;

  const yearAgo = Date.now() - 365 * 864e5;
  const ttm = list.filter(function (d) { return d.ts >= yearAgo; });
  const previous = list.filter(function (d) { return d.ts < yearAgo && d.ts >= Date.now() - 2 * 365 * 864e5; });
  const dps = ttm.reduce(function (sum, d) { return sum + d.amount; }, 0);
  const prevDps = previous.reduce(function (sum, d) { return sum + d.amount; }, 0);
  if (!dps) return null;
  const last = ttm.length ? ttm[ttm.length - 1] : list[list.length - 1];
  return {
    symbol: symbol,
    price: price,
    dps: dps,
    yieldPct: (dps / price) * 100,
    payouts: ttm.length,
    lastDate: last ? last.ts : null,
    growth: prevDps > 0 ? (dps / prevDps - 1) * 100 : null
  };
}

async function fetchDividendInfo(symbol) {
  const cached = divCache.rows[symbol];
  if (cached && (Date.now() - divCache.ts) < DIV_CACHE_TTL) return cached;
  try {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(symbol) +
      '?range=2y&interval=1d&events=div';
    const row = dividendRowFromChart(symbol, JSON.parse(await fetchViaProxy(url, { timeout: 8000 })));
    if (row) divCache.rows[symbol] = row;
    return row;
  } catch (e) { return null; }
}

/* Four at a time so the dividend scan never competes with the quote load. */
function loadDividendLeaders() {
  const rows = [];
  let index = 0, active = 0;
  return new Promise(function (resolve) {
    function next() {
      if (index >= DIVIDEND_POOL.length && active === 0) return resolve(rows);
      while (active < 4 && index < DIVIDEND_POOL.length) {
        const item = DIVIDEND_POOL[index++];
        active++;
        fetchDividendInfo(item.symbol).then(function (row) {
          if (row) { row.name = item.name; rows.push(row); }
        }).catch(function () {}).finally(function () { active--; next(); });
      }
    }
    next();
  }).then(function (list) {
    divCache.ts = Date.now();
    saveJSON(DIV_CACHE_KEY, divCache);
    return list.sort(function (a, b) { return b.yieldPct - a.yieldPct; });
  });
}

function breadthCounts(list) {
  let up = 0, down = 0, flat = 0;
  list.forEach(function (s) {
    if (!s || !isFinite(s.pct)) return;
    if (s.pct > 0.0001) up++; else if (s.pct < -0.0001) down++; else flat++;
  });
  return { up: up, down: down, flat: flat, total: up + down + flat };
}

function breadthBarHTML(counts) {
  if (!counts.total) return '';
  const up = (counts.up / counts.total) * 100;
  const flat = (counts.flat / counts.total) * 100;
  return '<span class="breadth-bar" aria-hidden="true">' +
    '<i class="b-up" style="width:' + up.toFixed(1) + '%"></i>' +
    '<i class="b-flat" style="width:' + flat.toFixed(1) + '%"></i>' +
    '<i class="b-down" style="width:' + (100 - up - flat).toFixed(1) + '%"></i>' +
    '</span>';
}

function pulseHTML(allData, idxData, usData) {
  const t = I18N[state.lang].mkt;
  const locale = state.lang === 'id' ? 'id-ID' : 'en-US';
  const ihsg = allData['^JKSE'];
  const idx = breadthCounts(idxData);
  const us = breadthCounts(usData);
  const best = idxData.slice().sort(function (a, b) { return b.pct - a.pct; })[0];
  const tiles = [];

  tiles.push('<div class="pulse-tile">' +
    '<span class="pulse-label">IHSG</span>' +
    '<strong class="pulse-value">' + (ihsg ? ihsg.price.toLocaleString(locale, { maximumFractionDigits: 2 }) : '—') + '</strong>' +
    '<span class="pulse-sub ' + (ihsg && ihsg.pct >= 0 ? 'up' : 'down') + '">' +
    (ihsg ? (ihsg.pct >= 0 ? '▲ ' : '▼ ') + Math.abs(ihsg.pct).toFixed(2) + '%' : '—') + '</span></div>');

  tiles.push('<div class="pulse-tile">' +
    '<span class="pulse-label">' + esc(t.breadth) + ' · IDX</span>' +
    '<strong class="pulse-value">' + (idx.total ? idx.up + ' / ' + idx.down : '—') + '</strong>' +
    '<span class="pulse-sub muted">' + esc(t.adv) + ' · ' + esc(t.dec) + '</span>' +
    breadthBarHTML(idx) + '</div>');

  tiles.push('<div class="pulse-tile">' +
    '<span class="pulse-label">' + esc(t.breadth) + ' · US</span>' +
    '<strong class="pulse-value">' + (us.total ? us.up + ' / ' + us.down : '—') + '</strong>' +
    '<span class="pulse-sub muted">' + esc(t.adv) + ' · ' + esc(t.dec) + '</span>' +
    breadthBarHTML(us) + '</div>');

  tiles.push('<div class="pulse-tile">' +
    '<span class="pulse-label">' + esc(t.topGainer) + '</span>' +
    '<strong class="pulse-value">' + (best ? esc(best.symbol.replace('.JK', '')) : '—') + '</strong>' +
    '<span class="pulse-sub ' + (best && best.pct >= 0 ? 'up' : 'down') + '">' +
    (best ? (best.pct >= 0 ? '+' : '') + best.pct.toFixed(2) + '%' : '—') + '</span></div>');

  tiles.push('<div class="pulse-tile" id="pulseTopYield">' +
    '<span class="pulse-label">' + esc(t.topYield) + '</span>' +
    '<strong class="pulse-value">…</strong>' +
    '<span class="pulse-sub muted">' + esc(t.divLoading) + '</span></div>');

  return '<div class="pulse-grid">' + tiles.join('') + '</div>';
}

function updatePulseTopYield(rows) {
  const el = document.getElementById('pulseTopYield');
  if (!el) return;
  const t = I18N[state.lang].mkt;
  const top = rows && rows[0];
  el.innerHTML = '<span class="pulse-label">' + esc(t.topYield) + '</span>' +
    '<strong class="pulse-value">' + (top ? esc(top.symbol.replace('.JK', '')) : '—') + '</strong>' +
    '<span class="pulse-sub ' + (top ? 'up' : 'muted') + '">' +
    (top ? top.yieldPct.toFixed(2) + '%' : esc(t.divEmpty)) + '</span>';
}

const divView = { sort: 'yieldPct', dir: 'desc', minYield: 0 };
let divAllRows = [];

function dividendPanelHTML(rows) {
  const t = I18N[state.lang].mkt;
  if (!rows.length) {
    return '<div class="modern-card"><div class="card-title">' + esc(t.dividends) + '</div>' +
      '<div class="ef-empty">' + esc(t.divEmpty) + '</div></div>';
  }
  const locale = state.lang === 'id' ? 'id-ID' : 'en-US';
  const sorter = {
    symbol: function (r) { return r.symbol; },
    name: function (r) { return (r.name || '').toLowerCase(); },
    price: function (r) { return r.price; },
    dps: function (r) { return r.dps; },
    yieldPct: function (r) { return r.yieldPct; },
    payouts: function (r) { return r.payouts; },
    lastDate: function (r) { return r.lastDate || 0; }
  }[divView.sort] || function (r) { return r.yieldPct; };

  // filter() gives us a fresh array, so sorting never reorders the cached rows
  const list = rows.filter(function (r) { return r.yieldPct >= divView.minYield; })
    .sort(function (a, b) {
      const av = sorter(a), bv = sorter(b);
      const cmp = (typeof av === 'string') ? av.localeCompare(bv) : (av - bv);
      return divView.dir === 'asc' ? cmp : -cmp;
    })
    .slice(0, 20);

  const head = function (key, label, align) {
    const active = divView.sort === key;
    const mark = active ? (divView.dir === 'asc' ? '▲' : '▼') : '↕';
    return '<th class="div-sort' + (active ? ' active' : '') + '" data-sort="' + key +
      '" style="text-align:' + align + ';" aria-sort="' +
      (active ? (divView.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '">' +
      esc(label) + ' <span class="div-arrow' + (active ? '' : ' ghost') + '">' + mark + '</span></th>';
  };

  const body = list.map(function (row, i) {
    const ex = row.lastDate ? new Date(row.lastDate).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
    const hot = i === 0 ? ' class="div-top"' : '';
    return '<tr' + hot + '>' +
      '<td class="div-rank">' + (i + 1) + '</td>' +
      '<td style="font-weight:800;">' + esc(row.symbol.replace('.JK', '')) + '</td>' +
      '<td class="div-name">' + esc(row.name || '') + '</td>' +
      '<td style="text-align:right;">' + row.price.toLocaleString(locale, { maximumFractionDigits: 0 }) + '</td>' +
      '<td style="text-align:right;">' + row.dps.toLocaleString(locale, { maximumFractionDigits: 2 }) + '</td>' +
      '<td style="text-align:right; font-weight:800; color:var(--green);">' + row.yieldPct.toFixed(2) + '%</td>' +
      '<td style="text-align:right; color:var(--muted);">' + row.payouts + '×</td>' +
      '<td style="text-align:right; color:var(--muted); white-space:nowrap;">' + ex + '</td>' +
      '</tr>';
  }).join('');

  const chips = [0, 4, 6, 8, 10].map(function (v) {
    return '<button type="button" class="div-chip' + (divView.minYield === v ? ' active' : '') +
      '" data-minyield="' + v + '">' + esc(v === 0 ? t.divAll : '≥' + v + '%') + '</button>';
  }).join('');

  const table = list.length
    ? '<div class="div-scroll"><table class="movers-table div-table">' +
      '<thead><tr><th>' + esc(t.colRank) + '</th>' + head('symbol', t.colSym, 'left') +
      head('name', t.colName, 'left') + head('price', t.colPrice, 'right') +
      head('dps', t.colDps, 'right') + head('yieldPct', t.colYield, 'right') +
      head('payouts', t.colPays, 'right') + head('lastDate', t.colEx, 'right') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>'
    : '<div class="ef-empty">' + esc(t.divNoMatch) + '</div>';

  return '<div class="modern-card">' +
    '<div class="card-title"><span>' + esc(t.dividends) + '</span>' +
    '<span class="div-sub">' + esc(t.divSub) + '</span></div>' +
    '<div class="div-tools"><span class="div-tools-label">' + esc(t.divFilter) + '</span>' +
    '<div class="div-chips">' + chips + '</div>' +
    '<span class="div-count">' + list.length + ' / ' + rows.length + '</span></div>' +
    table +
    '<div class="ef-note">' + esc(t.divNote) + '</div></div>';
}

function paintDividends() {
  const el = document.getElementById('dividendPanel');
  if (!el) return;
  el.innerHTML = dividendPanelHTML(divAllRows);
}

function renderDividendPanel(rows) {
  divAllRows = rows || [];
  paintDividends();
}

/* One delegated listener survives every re-paint of the panel. */
document.addEventListener('click', function (e) {
  if (!e.target || !e.target.closest) return;
  const head = e.target.closest('#dividendPanel [data-sort]');
  if (head) {
    const key = head.getAttribute('data-sort');
    if (divView.sort === key) {
      divView.dir = divView.dir === 'asc' ? 'desc' : 'asc';
    } else {
      divView.sort = key;
      divView.dir = (key === 'symbol' || key === 'name') ? 'asc' : 'desc';
    }
    paintDividends();
    return;
  }
  const chip = e.target.closest('#dividendPanel [data-minyield]');
  if (chip) {
    divView.minYield = parseFloat(chip.getAttribute('data-minyield')) || 0;
    paintDividends();
  }
});

async function loadMarketDashboard() {
  const dash = $('#stockDashboard'); const t = I18N[state.lang];
  destroyCharts();
  
  // Inject the loading bar UI
  dash.innerHTML = `
    <div class="loading-container">
      <div class="loading-text">Fetching Market Data...</div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" id="marketProgressFill"></div>
      </div>
      <div class="progress-text" id="marketProgressText">0 / 0 loaded</div>
    </div>
  `;

  const allSymbols = [...new Set([...INDICES.map(x=>x.symbol), '^GSPC', ...MACRO.map(x=>x.symbol), ...ECON_INDICATORS.map(x=>x.symbol), ...IDX_POOL.map(x=>x.symbol), ...US_POOL.map(x=>x.symbol), ...ETFS.map(x=>x.symbol)])];
  const allData = {};
  let failedCount = 0;
  
  // Progress tracking variables
  const totalCount = allSymbols.length;
  let processedCount = 0;
  const progressFill = document.getElementById('marketProgressFill');
  const progressText = document.getElementById('marketProgressText');

  for (const sym of allSymbols) {
    const details = await fetchStockDetails(sym);
    if (details && details.price) {
      details.pct = ((details.price - details.prevClose) / details.prevClose) * 100;
      allData[sym] = details;
    } else {
      failedCount++;
    }
    
    // Update progress bar
    processedCount++;
    if (progressFill) progressFill.style.width = `${(processedCount / totalCount) * 100}%`;
    if (progressText) progressText.textContent = `${processedCount} / ${totalCount} loaded`;

    await new Promise(r => setTimeout(r, 50)); 
  }

  // ... (rest of the caching and rendering logic remains the same) ...
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
  
  // ... (continue with idxData, usData, etc.)

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
    // Where the price sits inside its 52-week range — a cheap "is this high or low" cue.
    const lo = s.week52Low, hi = s.week52High;
    const inRange = isFinite(lo) && isFinite(hi) && hi > lo && isFinite(s.price);
    const rangePos = inRange ? Math.max(0, Math.min(100, ((s.price - lo) / (hi - lo)) * 100)) : null;
    const rangeHtml = rangePos === null ? '' :
      '<div class="sc-range"><span class="sc-range-bar"><i style="left:' + rangePos.toFixed(1) + '%"></i></span>' +
      '<span class="sc-range-cap">52W ' + lo.toLocaleString('en-US', { maximumFractionDigits: 0 }) + '–' +
      hi.toLocaleString('en-US', { maximumFractionDigits: 0 }) + '</span></div>';
    // The AI button is a sibling of the link, not inside it: a button nested in
    // an anchor is invalid markup and swallows the link's own navigation.
    return `<div class="stock-card">
      <a class="sc-body" href="https://finance.yahoo.com/quote/${esc(s.symbol)}" target="_blank">
        <div class="sc-header">
          <div>
            <div class="sc-sym">${esc(s.symbol.replace('.JK', ''))}</div>
            <div class="sc-name">${esc(s.name)}</div>
          </div>
          <div class="sc-chg ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${s.pct.toFixed(2)}%</div>
        </div>
        <div class="sc-price">${s.price.toLocaleString('en-US')}</div>
        ${rangeHtml}
      </a>
      <div class="sc-foot">
        <div class="sc-fund" data-fund="${esc(s.symbol)}"></div>
        <button type="button" class="sc-ai" data-ai="${esc(s.symbol)}" title="${esc(I18N[state.lang].fundAi.title)}">✨ ${esc(I18N[state.lang].fundAi.btn)}</button>
      </div>
    </div>`;
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

  const mktT = t.mkt;
  const locale = state.lang === 'id' ? 'id-ID' : 'en-US';
  const asOf = new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  dash.innerHTML = `
    <div class="mkt-asof">${esc(mktT.asOf)} ${esc(asOf)} · ${esc(mktT.delayed)}</div>
    ${pulseHTML(allData, idxData, usData)}
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

    <div id="dividendPanel" style="margin-top: 32px;"></div>

    ${macroPanelHtml}
  `;
  hydrateCardFundamentals(dash);

  const divSlot = document.getElementById('dividendPanel');
  if (divSlot) divSlot.innerHTML = '<div class="modern-card"><div class="card-title">' +
    esc(mktT.dividends) + '</div><div class="ef-empty">' + esc(mktT.divLoading) + '</div></div>';
  loadDividendLeaders().then(function (rows) {
    renderDividendPanel(rows);
    updatePulseTopYield(rows);
  }).catch(function () { renderDividendPanel([]); });

  if (typeof ApexCharts !== 'undefined') {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const chartTheme = { mode: isDark ? 'dark' : 'light' };

    summaryData.forEach(d => {
      if (!d.data) return;
      const sparkChart = new ApexCharts(document.querySelector(`#spark-${d.symbol.replace('^', '').replace('=', '')}`), {
        series: [{ data: d.spark.map(p => p.y) }], chart: { type: 'area', height: 50, sparkline: { enabled: true } },
        theme: chartTheme,
        stroke: { curve: 'smooth', width: 2 }, colors: [d.data.pct >= 0 ? '#22c55e' : '#ef4444'],
        fill: { type: 'gradient', gradient: { opacityFrom: 0.4, opacityTo: 0 } }, tooltip: { enabled: false }
      });
      sparkChart.render();
      chartInstances.push(sparkChart);
    });

    ihsgChart = new ApexCharts(document.querySelector("#mainChart"), {
      series: [{ name: 'IHSG', data: mainChartData }], chart: { type: 'area', height: 320, toolbar: { show: false }, fontFamily: 'Inter' },
      theme: chartTheme,
      colors: ['#ef4444'], fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0 } },
      dataLabels: { enabled: false }, stroke: { curve: 'smooth', width: 3 },
      xaxis: { type: 'datetime' }, yaxis: { labels: { formatter: v => v.toFixed(0) } }, grid: { borderColor: isDark ? '#334155' : '#f1f3f5', strokeDashArray: 4 }
    });
    ihsgChart.render();
    chartInstances.push(ihsgChart);

    sp500Chart = new ApexCharts(document.querySelector("#sp500Chart"), {
      series: [{ name: 'S&P 500', data: sp500ChartData }], chart: { type: 'area', height: 320, toolbar: { show: false }, fontFamily: 'Inter' },
      theme: chartTheme,
      colors: ['#3b82f6'], fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0 } },
      dataLabels: { enabled: false }, stroke: { curve: 'smooth', width: 3 },
      xaxis: { type: 'datetime' }, yaxis: { labels: { formatter: v => v.toFixed(0) } }, grid: { borderColor: isDark ? '#334155' : '#f1f3f5', strokeDashArray: 4 }
    });
    sp500Chart.render();
    chartInstances.push(sp500Chart);

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
  destroyCharts();
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

/* PORTFOLIO TRACKER */
const PF = { store: 'finwire.portfolio.v1', quotes: 'finwire.portfolio.quotes.v1', cur: 'finwire.portfolio.currency.v1', fx: 'finwire.portfolio.fx.v1', incur: 'finwire.portfolio.costcur.v1', maxAge: 5 * 60 * 1000, fxSymbol: 'IDR=X' };
const pfQuotes = loadJSON(PF.quotes, {}) || {};
const pfSavedCur = loadJSON(PF.cur, 'auto');
let pfCurMode = (pfSavedCur === 'USD' || pfSavedCur === 'IDR') ? pfSavedCur : 'auto';
const pfSavedInCur = loadJSON(PF.incur, 'auto');
/* First visit follows the display currency: someone reading rupiah usually
   quotes a rupiah cost too. */
let pfInCur = (pfSavedInCur === 'USD' || pfSavedInCur === 'IDR') ? pfSavedInCur : (pfCurMode === 'auto' ? 'auto' : pfCurMode);
let pfFx = loadJSON(PF.fx, null);
let pfMessage = '';

const portfolio = (function () {
  const saved = loadJSON(PF.store, []);
  if (!Array.isArray(saved)) return [];
  return saved.map(function (h) {
    return {
      symbol: String((h && h.symbol) || '').toUpperCase().trim(), shares: Number(h && h.shares), avgCost: Number(h && h.avgCost),
      avgCur: (h && (h.avgCur === 'IDR' || h.avgCur === 'USD')) ? h.avgCur : null
    };
  }).filter(function (h) {
    return h.symbol && isFinite(h.shares) && h.shares > 0 && isFinite(h.avgCost) && h.avgCost >= 0;
  }).map(function (h) { h.avgCur = h.avgCur || pfCurrency(h.symbol); return h; });
})();

function savePortfolio() { saveJSON(PF.store, portfolio); }
function pfCurrency(symbol) { return /\.JK$/i.test(symbol) ? 'IDR' : 'USD'; }
function pfMoney(value, currency) {
  if (value == null || !isFinite(value)) return '—';
  if (currency === 'IDR') return 'Rp ' + Math.round(value).toLocaleString('id-ID');
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pfSignedMoney(value, currency) { return (value < 0 ? '-' : '+') + pfMoney(Math.abs(value), currency); }
/* Per-share prices need extra decimals once a cheap IDR stock is shown in USD. */
function pfPrice(value, currency) {
  if (value == null || !isFinite(value)) return '—';
  if (currency !== 'IDR' && Math.abs(value) < 1 && value !== 0) {
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  }
  return pfMoney(value, currency);
}
function pfPctText(value) { return (value == null || !isFinite(value)) ? '' : (value > 0 ? '+' : '') + value.toFixed(2) + '%'; }

/* Which holdings are expanded, and the panels already built for them. The
   table is re-rendered on every quote refresh, so answer text and the
   fundamentals block are kept as HTML rather than thrown away each time. */
const pfOpen = new Set();
const pfDetail = {};
function pfDetailOf(symbol) {
  if (!pfDetail[symbol]) pfDetail[symbol] = { fund: '', why: '' };
  return pfDetail[symbol];
}

function pfDetailRowHtml(symbol) {
  const p = (I18N[state.lang] || I18N.en).portfolio;
  const d = pfDetailOf(symbol);
  const open = pfOpen.has(symbol);
  return `
    <tr class="pf-detail" data-pf-detail="${esc(symbol)}"${open ? '' : ' hidden'}>
      <td colspan="7">
        <div class="pf-detail-inner">
          <div class="pf-detail-actions">
            <button type="button" class="pf-act" data-pf-read="${esc(symbol)}">✨ ${esc(p.aiRead)}</button>
            <button type="button" class="pf-act" data-pf-why="${esc(symbol)}">✨ ${esc(p.whyMoved)}</button>
          </div>
          <div class="pf-why-out" data-pf-why-out="${esc(symbol)}"${d.why ? '' : ' hidden'}>${d.why}</div>
          <div class="pf-fund-out" data-pf-fund-out="${esc(symbol)}">${d.fund}</div>
        </div>
      </td>
    </tr>`;
}

function pfToggleDetail(symbol) {
  const row = document.querySelector('[data-pf-detail="' + symbol + '"]');
  const btn = document.querySelector('[data-pf-open="' + symbol + '"]');
  if (!row) return;
  const open = !pfOpen.has(symbol);
  if (open) pfOpen.add(symbol); else pfOpen.delete(symbol);
  row.hidden = !open;
  if (btn) { btn.classList.toggle('open', open); btn.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  if (open) pfLoadFund(symbol);
}

/* Fundamentals for a holding are fetched only when its row is opened — the
   same feed that powers a Market Data card, in the same panel. */
function pfLoadFund(symbol) {
  const d = pfDetailOf(symbol);
  if (d.fund) return;
  const p = (I18N[state.lang] || I18N.en).portfolio;
  const out = document.querySelector('[data-pf-fund-out="' + symbol + '"]');
  if (out) out.innerHTML = `<div class="pf-fund-loading">${esc(p.loadingFund)}</div>`;
  fetchFundamentals(symbol)
    .then(function (fund) {
      const html = fundamentalsHTML(fund, state.lang, symbol);
      d.fund = html || `<div class="pf-fund-loading">${esc(I18N[state.lang].fund.noData)}</div>`;
      const node = document.querySelector('[data-pf-fund-out="' + symbol + '"]');
      if (node) node.innerHTML = d.fund;
    })
    .catch(function () {
      d.fund = '';
      const node = document.querySelector('[data-pf-fund-out="' + symbol + '"]');
      if (node) node.innerHTML = '';
    });
}

/* Headlines that name a company you actually own, so the Markets view also
   answers "is anything happening at my companies" without leaving the page. */
function pfHoldingTerms() {
  const terms = [];
  portfolio.forEach(function (h) {
    const code = h.symbol.replace(/\.JK$/i, '').toLowerCase();
    if (code.length > 1) terms.push({ symbol: h.symbol, term: code });
    const q = pfQuotes[h.symbol];
    const name = (q && q.name) ? String(q.name).toLowerCase().trim() : '';
    if (name.length > 3) terms.push({ symbol: h.symbol, term: name });
  });
  return terms;
}

function renderHoldingsNews() {
  const host = $('#pfNewsPanel'); if (!host) return;
  const p = (I18N[state.lang] || I18N.en).portfolio;
  if (!portfolio.length) { host.innerHTML = ''; return; }
  const terms = pfHoldingTerms();
  const seen = new Set(); const items = [];
  state.articles.forEach(function (a) {
    const text = ((a.title || '') + ' ' + (a.summary || '')).toLowerCase();
    const hit = terms.filter(function (t) { return text.indexOf(t.term) !== -1; })[0];
    if (!hit) return;
    const key = (a.title || '').toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push({ a: a, symbol: hit.symbol });
  });
  if (!items.length) { host.innerHTML = ''; return; }
  items.sort(function (x, y) { return (y.a.ts || 0) - (x.a.ts || 0); });
  host.innerHTML = `<div class="modern-card pf-news-card">
    <div class="card-title"><span>${esc(p.newsTitle)}</span></div>
    <ul class="pf-news-list">${items.slice(0, 5).map(function (it) {
      const a = it.a;
      const meta = [a.sourceLabel || 'FINWIRE', a.ts ? timeAgo(a.ts, state.lang) : ''].filter(Boolean).join(' · ');
      return `<li><a href="${esc(a.link || '#')}" target="_blank" rel="noopener noreferrer">
        <span class="pf-news-sym">${esc(it.symbol.replace(/\.JK$/i, ''))}</span>${esc(a.title || '')}</a>
        <span class="pf-news-meta">${esc(meta)}</span></li>`;
    }).join('')}</ul>
  </div>`;
}

function pfRate() { return (pfFx && isFinite(pfFx.rate) && pfFx.rate > 0) ? pfFx.rate : null; }

function pfConvert(amount, from, to) {
  if (amount == null || !isFinite(amount)) return null;
  if (!from || !to || from === to) return amount;
  const rate = pfRate(); if (!rate) return null;
  if (from === 'USD' && to === 'IDR') return amount * rate;
  if (from === 'IDR' && to === 'USD') return amount / rate;
  return null;
}

function pfQuoteCurrency(quote, symbol) {
  const c = quote && quote.currency;
  return (c === 'IDR' || c === 'USD') ? c : pfCurrency(symbol);
}

/* One holding's numbers, converted into whatever currency is on display.
   The cost keeps the currency it was entered in; the quote has its own. */
function pfHoldingView(h) {
  const q = pfQuotes[h.symbol] || null;
  const src = pfQuoteCurrency(q, h.symbol);
  const costCur = h.avgCur || pfCurrency(h.symbol);
  const target = pfCurMode === 'auto' ? src : pfCurMode;
  const price = (q && isFinite(q.price)) ? q.price : null;
  const costPending = costCur !== target && !pfRate();
  const pricePending = src !== target && !pfRate();
  const cost = costPending ? null : pfConvert(h.avgCost * h.shares, costCur, target);
  const value = (price == null || pricePending) ? null : pfConvert(price * h.shares, src, target);
  const pl = (value == null || cost == null) ? null : value - cost;
  return {
    q: q, src: src, target: target, pending: costPending || pricePending, failed: !!(q && q.failed),
    price: (price == null || pricePending) ? null : pfConvert(price, src, target),
    avg: costPending ? null : pfConvert(h.avgCost, costCur, target),
    cost: cost, value: value, pl: pl,
    plPct: (pl != null && cost > 0) ? (pl / cost) * 100 : null
  };
}

/* Yahoo only knows IDX listings under their .JK suffix, so a bare "CUAN" 404s.
   Try what was typed, then retry with the Jakarta suffix before giving up. */
async function pfLookup(symbol) {
  const direct = await fetchStockDetails(symbol);
  if (direct && isFinite(direct.price) && direct.price > 0) {
    return { symbol: String(direct.symbol || symbol).toUpperCase(), quote: direct };
  }
  if (!/\./.test(symbol)) {
    const alt = symbol + '.JK';
    const jk = await fetchStockDetails(alt);
    if (jk && isFinite(jk.price) && jk.price > 0) return { symbol: alt, quote: jk };
  }
  return null;
}

/* A rupiah price almost always means an IDX listing, so try the Jakarta
   suffix first — bare BBCA is a US ETF, BBCA.JK is Bank Central Asia. */
async function pfLookupIdr(symbol) {
  if (!/\./.test(symbol)) {
    const jk = await fetchStockDetails(symbol + '.JK');
    if (jk && isFinite(jk.price) && jk.price > 0) return { symbol: symbol + '.JK', quote: jk };
  }
  return pfLookup(symbol);
}

/* Save a quote and adopt the exchange-qualified symbol Yahoo reported. */
function pfApplyQuote(symbol, hit) {
  const resolved = hit.symbol;
  if (resolved !== symbol) {
    const target = portfolio.filter(function (h) { return h.symbol === resolved; })[0];
    const source = portfolio.filter(function (h) { return h.symbol === symbol; })[0];
    if (target && source && target !== source) {
      const total = target.shares + source.shares;
      const targetCur = target.avgCur || pfCurrency(target.symbol);
      const sourceCur = source.avgCur || pfCurrency(source.symbol);
      const conv = sourceCur === targetCur ? source.avgCost : pfConvert(source.avgCost, sourceCur, targetCur);
      target.avgCost = ((target.avgCost * target.shares) + ((conv == null ? source.avgCost : conv) * source.shares)) / total;
      target.shares = total;
      portfolio.splice(portfolio.indexOf(source), 1);
    } else if (source) { source.symbol = resolved; }
    delete pfQuotes[symbol];
    savePortfolio();
  }
  pfQuotes[resolved] = {
    price: hit.quote.price, pct: isFinite(hit.quote.pct) ? hit.quote.pct : null, name: hit.quote.name,
    currency: pfQuoteCurrency(hit.quote, resolved), ts: Date.now()
  };
  return resolved;
}

function pfMarkFailed(symbol) { pfQuotes[symbol] = { price: null, failed: true, name: '', ts: Date.now() }; }

function pfSyncCurSwitch() {
  $$('#pfCurSwitch button').forEach(function (b) {
    const on = b.getAttribute('data-pf-cur') === pfCurMode;
    b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

/* Which currency the typed average cost is read in. "Auto" follows the
   ticker, so a .JK listing is taken as rupiah without any extra step. */
function pfInputCurrency() {
  if (pfInCur === 'USD' || pfInCur === 'IDR') return pfInCur;
  const typed = (($('#pfSymbol') || {}).value || '').toUpperCase().replace(/\s+/g, '');
  if (!typed) return null;
  const q = pfQuotes[typed];
  if (q && (q.currency === 'IDR' || q.currency === 'USD')) return q.currency;
  if (/\.JK$/.test(typed)) return 'IDR';
  return null;
}

function pfSyncInputCur() {
  $$('#pfCostCur button').forEach(function (b) {
    const on = b.getAttribute('data-pf-in') === pfInCur;
    b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const el = $('#pfCost'); if (!el) return;
  const p = (I18N[state.lang] || I18N.en).portfolio;
  const cur = pfInputCurrency();
  const text = cur ? p.costPh + ' (' + cur + ')' : p.costPh;
  el.setAttribute('placeholder', text); el.setAttribute('aria-label', text);
}

function setPfInputCurrency(mode) {
  if (mode !== 'auto' && mode !== 'USD' && mode !== 'IDR') return;
  pfInCur = mode;
  saveJSON(PF.incur, pfInCur);
  pfSyncInputCur();
}

async function refreshFxRate(force) {
  if (!force && pfFx && isFinite(pfFx.rate) && pfFx.rate > 0 && (Date.now() - pfFx.ts) < PF.maxAge) return pfFx.rate;
  const d = await fetchStockDetails(PF.fxSymbol);
  if (d && isFinite(d.price) && d.price > 0) { pfFx = { rate: d.price, ts: Date.now() }; saveJSON(PF.fx, pfFx); }
  return pfRate();
}

function setPfCurrencyMode(mode) {
  if (mode !== 'auto' && mode !== 'USD' && mode !== 'IDR') return;
  if (mode === pfCurMode) return;
  pfCurMode = mode;
  saveJSON(PF.cur, pfCurMode);
  renderPortfolio();
  if (pfCurMode !== 'auto' && !pfRate()) refreshFxRate().then(renderPortfolio);
}

function renderPortfolio() {
  const host = $('#portfolioPanel'); if (!host) return;
  const p = (I18N[state.lang] || I18N.en).portfolio;

  if (host.dataset.lang !== state.lang) { host.dataset.lang = state.lang; host.dataset.ready = ''; }

  if (host.dataset.ready !== '1') {
    host.innerHTML = `
      <div class="modern-card portfolio-card">
        <div class="card-title">
          <span>${esc(p.title)}</span>
          <span class="pf-subtitle">${esc(p.subtitle)}</span>
        </div>
        <div class="pf-toolbar">
          <span class="pf-toolbar-label">${esc(p.curLabel)}</span>
          <div class="pf-cur-switch" id="pfCurSwitch" role="group" aria-label="${esc(p.curLabel)}">
            <button type="button" data-pf-cur="auto">${esc(p.curAuto)}</button>
            <button type="button" data-pf-cur="USD">USD</button>
            <button type="button" data-pf-cur="IDR">IDR</button>
          </div>
        </div>
        <form class="pf-form" id="pfForm" autocomplete="off">
          <input id="pfSymbol" type="text" spellcheck="false" placeholder="${esc(p.symPh)}" aria-label="${esc(p.symPh)}" />
          <input id="pfShares" type="number" min="0" step="any" inputmode="decimal" placeholder="${esc(p.sharesPh)}" aria-label="${esc(p.sharesPh)}" />
          <div class="pf-cost">
            <input id="pfCost" type="number" min="0" step="any" inputmode="decimal" placeholder="${esc(p.costPh)}" aria-label="${esc(p.costPh)}" />
            <div class="pf-cost-cur" id="pfCostCur" role="group" aria-label="${esc(p.costIn)}" title="${esc(p.costIn)}">
              <button type="button" data-pf-in="auto">${esc(p.curAuto)}</button>
              <button type="button" data-pf-in="USD">USD</button>
              <button type="button" data-pf-in="IDR">IDR</button>
            </div>
          </div>
          <button type="submit">${esc(p.add)}</button>
        </form>
        <div id="pfMsg" class="pf-msg"></div>
        <div id="portfolioBody"></div>
        <p class="pf-note">${esc(p.note)}</p>
      </div>
      <div id="pfNewsPanel"></div>`;
    host.dataset.ready = '1';
  }

  pfSyncCurSwitch(); pfSyncInputCur();
  const msgEl = $('#pfMsg'); if (msgEl) msgEl.textContent = pfMessage || '';
  const body = $('#portfolioBody'); if (!body) return;

  const sorted = portfolio.slice().sort(function (a, b) { return a.symbol.localeCompare(b.symbol); });
  if (!sorted.length) { body.innerHTML = `<div class="pf-empty">${esc(p.empty)}</div>`; return; }

  const views = sorted.map(function (h) { return { h: h, v: pfHoldingView(h) }; });
  const groups = [];
  views.forEach(function (row) { if (groups.indexOf(row.v.target) === -1) groups.push(row.v.target); });

  const summaryHtml = groups.map(function (cur) {
    const rows = views.filter(function (row) { return row.v.target === cur; });
    let value = 0, cost = 0, priced = 0, pending = false;
    let day = 0, dayBase = 0, dayCount = 0;
    rows.forEach(function (row) {
      if (row.v.pending) pending = true;
      if (row.v.cost != null) cost += row.v.cost;
      if (row.v.value != null) { value += row.v.value; priced++; }
      // Today's move in money: back out yesterday's close from the day %.
      const pct = (row.v.q && isFinite(row.v.q.pct)) ? row.v.q.pct : null;
      if (row.v.value != null && pct != null && (1 + pct / 100) > 0) {
        const prev = row.v.value / (1 + pct / 100);
        day += row.v.value - prev; dayBase += prev; dayCount++;
      }
    });
    const pl = (priced && !pending) ? value - cost : null;
    const plPct = (pl != null && cost > 0) ? (pl / cost) * 100 : null;
    const plClass = pl == null ? '' : (pl >= 0 ? 'up' : 'down');
    const dayPct = (dayCount && dayBase > 0) ? (day / dayBase) * 100 : null;
    const dayClass = dayCount ? (day >= 0 ? 'up' : 'down') : '';
    const dayText = dayCount ? pfSignedMoney(day, cur) + ' (' + pfPctText(dayPct) + ')' : (pending ? '…' : '—');
    const valueText = pending ? '…' : (priced ? pfMoney(value, cur) : '—');
    const tag = (groups.length > 1 || pfCurMode !== 'auto') ? `<div class="pf-cur-tag">${cur}</div>` : '';
    return `
      <div class="pf-group">
        ${tag}
        <div class="pf-summary">
          <div class="pf-stat"><span>${esc(p.marketValue)}</span><strong>${valueText}</strong></div>
          <div class="pf-stat"><span>${esc(p.costBasis)}</span><strong>${pending ? '…' : pfMoney(cost, cur)}</strong></div>
          <div class="pf-stat"><span>${esc(p.totalPl)}</span><strong class="${plClass}">${pl == null ? (pending ? '…' : '—') : pfSignedMoney(pl, cur) + ' (' + pfPctText(plPct) + ')'}</strong></div>
          <div class="pf-stat"><span>${esc(p.today)}</span><strong class="${dayClass}">${dayText}</strong></div>
        </div>
      </div>`;
  }).join('') + (pfRate() && pfNeedsFx() ? `<p class="pf-fx">${esc((p.fxNote || '').replace('{rate}', pfMoney(pfRate(), 'IDR')))}</p>` : '');

  const rowsHtml = views.map(function (row) {
    const h = row.h, v = row.v, cur = v.target;
    const cls = v.pl == null ? '' : (v.pl >= 0 ? 'pf-up' : 'pf-down');
    const dayPct = (v.q && isFinite(v.q.pct)) ? `<div class="pf-day ${v.q.pct >= 0 ? 'pf-up' : 'pf-down'}">${pfPctText(v.q.pct)}</div>` : '';
    const lastCell = v.price != null ? pfPrice(v.price, cur) + dayPct : (v.failed ? `<span class="pf-warn">${esc(p.unresolved)}</span>` : '…');
    const avgText = v.avg == null ? (v.pending ? '…' : '—') : pfPrice(v.avg, cur);
    const valueCell = v.value != null ? pfMoney(v.value, cur) : (v.pending || !v.failed ? '…' : '—');
    const plCell = v.pl != null ? pfSignedMoney(v.pl, cur) + `<div class="pf-pct">${pfPctText(v.plPct)}</div>` : (v.pending || !v.failed ? '…' : '—');
    return `
      <tr>
        <td><div class="pf-sym">${esc(h.symbol)}</div><div class="pf-name">${esc((v.q && v.q.name) || '')}</div></td>
        <td class="num">${h.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
        <td class="num">${avgText}</td>
        <td class="num">${lastCell}</td>
        <td class="num">${valueCell}</td>
        <td class="num ${cls}">${plCell}</td>
        <td class="num"><div class="pf-row-actions">
          <button type="button" class="pf-open${pfOpen.has(h.symbol) ? ' open' : ''}" data-pf-open="${esc(h.symbol)}" aria-expanded="${pfOpen.has(h.symbol) ? 'true' : 'false'}" aria-label="${esc(p.details)}" title="${esc(p.details)}">⌄</button>
          <button type="button" class="pf-remove" data-pf-remove="${esc(h.symbol)}" aria-label="${esc(p.remove)}" title="${esc(p.remove)}">×</button>
        </div></td>
      </tr>${pfDetailRowHtml(h.symbol)}`;
  }).join('');

  body.innerHTML = `${summaryHtml}
    <div class="pf-table-wrap">
      <table class="pf-table">
        <thead><tr>
          <th>${esc(p.colSym)}</th><th class="num">${esc(p.colShares)}</th><th class="num">${esc(p.colCost)}</th>
          <th class="num">${esc(p.colLast)}</th><th class="num">${esc(p.colValue)}</th><th class="num">${esc(p.colPl)}</th><th></th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;

  pfOpen.forEach(pfLoadFund);
  renderHoldingsNews();
}

function pfNeedsQuote(symbol, force) {
  const q = pfQuotes[symbol];
  if (force || !q) return true;
  if (Date.now() - q.ts > PF.maxAge) return true;
  return !isFinite(q.price) && !q.failed;
}

async function refreshPortfolioQuotes(symbols, force) {
  const list = (symbols || portfolio.map(function (h) { return h.symbol; })).filter(function (s) { return pfNeedsQuote(s, force); });
  if (!list.length) return;
  for (let i = 0; i < list.length; i++) {
    const sym = list[i];
    const hit = await pfLookup(sym);
    if (hit) pfApplyQuote(sym, hit); else pfMarkFailed(sym);
    if (i < list.length - 1) await new Promise(function (r) { setTimeout(r, 60); });
  }
  saveJSON(PF.quotes, pfQuotes);
}

/* A rate is needed whenever something has to cross currencies: a fixed display
   currency, or a cost entered in a different currency than the quote. */
function pfNeedsFx() {
  if (pfCurMode !== 'auto') return true;
  return portfolio.some(function (h) {
    const q = pfQuotes[h.symbol] || null;
    return (h.avgCur || pfCurrency(h.symbol)) !== pfQuoteCurrency(q, h.symbol);
  });
}

async function refreshPortfolio() {
  renderPortfolio();
  await Promise.all([refreshPortfolioQuotes(), pfNeedsFx() ? refreshFxRate() : Promise.resolve()]);
  renderPortfolio();
}

async function addHolding(rawSymbol, rawShares, rawCost, rawCur) {
  const p = (I18N[state.lang] || I18N.en).portfolio;
  const symbol = String(rawSymbol == null ? '' : rawSymbol).toUpperCase().replace(/\s+/g, '');
  const shares = Number(String(rawShares == null ? '' : rawShares).replace(/,/g, ''));
  const avgCost = Number(String(rawCost == null ? '' : rawCost).replace(/,/g, ''));
  const fixedCur = (rawCur === 'USD' || rawCur === 'IDR') ? rawCur : null;

  if (!/^[A-Z0-9.^=-]{1,15}$/.test(symbol)) { pfMessage = p.invalidSym; renderPortfolio(); return; }
  if (!isFinite(shares) || shares <= 0) { pfMessage = p.invalidQty; renderPortfolio(); return; }
  if (!isFinite(avgCost) || avgCost < 0) { pfMessage = p.invalidCost; renderPortfolio(); return; }

  pfMessage = '';
  /* With "Auto" the ticker is resolved first, so a bare IDX symbol such as
     CUAN is read in rupiah instead of being taken for dollars. */
  let hit = null, resolved = symbol, costCur = fixedCur;
  const lookup = function () { return fixedCur === 'IDR' ? pfLookupIdr(symbol) : pfLookup(symbol); };
  if (!costCur) {
    hit = await lookup();
    if (hit) { resolved = hit.symbol; costCur = pfQuoteCurrency(hit.quote, hit.symbol); }
    else costCur = pfCurrency(symbol);
  }

  const existing = portfolio.filter(function (h) { return h.symbol === resolved; })[0]
    || portfolio.filter(function (h) { return h.symbol === symbol; })[0];
  if (existing) {
    const totalShares = existing.shares + shares;
    const prevCur = existing.avgCur || pfCurrency(existing.symbol);
    const conv = prevCur === costCur ? existing.avgCost : pfConvert(existing.avgCost, prevCur, costCur);
    const prevCost = conv == null ? existing.avgCost : conv;
    existing.avgCost = ((prevCost * existing.shares) + (avgCost * shares)) / totalShares;
    existing.shares = totalShares;
    existing.avgCur = costCur;
  } else {
    portfolio.push({ symbol: resolved, shares: shares, avgCost: avgCost, avgCur: costCur });
  }

  savePortfolio();
  ['#pfSymbol', '#pfShares', '#pfCost'].forEach(function (sel) { const el = $(sel); if (el) el.value = ''; });
  renderPortfolio();

  if (!hit) hit = await lookup();
  if (hit) pfApplyQuote(resolved, hit);
  else { pfMarkFailed(resolved); pfMessage = (p.notFound || '').replace('{sym}', symbol); }
  saveJSON(PF.quotes, pfQuotes);
  if (pfNeedsFx() && !pfRate()) await refreshFxRate();
  renderPortfolio();
}

function removeHolding(symbol) {
  const idx = portfolio.findIndex(function (h) { return h.symbol === symbol; });
  if (idx === -1) return;
  portfolio.splice(idx, 1);
  savePortfolio();
  renderPortfolio();
}

/* DATA LOADING & BINDING */
async function loadNews(force) {
  const cached = loadJSON(LS.news, null);
  if (cached && cached.articles && cached.articles.length > 0) {
    const cutoff = Date.now() - NEWS_MAX_AGE_MS;
    state.articles = cached.articles.filter(a => a.ts >= cutoff);
    state.lastTs = cached.ts; state.lastKind = 'cached';
    render(); updateStatusLabel('cached', cached.ts); backfillAllImages();
    if (!force && (Date.now() - cached.ts) < CACHE_TTL) return;
  } else { updateStatusLabel('loading'); }
  try {
    await fetchAllNews(); state.lastTs = Date.now(); state.lastKind = 'live';
    saveJSON(LS.news, { ts: Date.now(), articles: state.articles.slice(0, MAX_ARTICLES) }); updateStatusLabel('live', state.lastTs);
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
    const fetchUrl = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    const html = await fetchViaProxy(fetchUrl, { timeout: 10000 });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript, .ads, .related').forEach(el => el.remove());
    let contentEl = doc.querySelector('article') || doc.querySelector('main') || doc.querySelector('.detail-text') || doc.querySelector('.article-content') || doc.querySelector('.post-content') || doc.body;
    let text = contentEl.textContent || '';
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length < 300) return ''; 
    return text.substring(0, 5000);
  } catch (e) {
    return '';
  }
}

/* AI calls go through the worker. A cold Gemini start can take 20s, so keep a
   hard limit and narrate the wait — a silent button reads as "it's broken". */
async function aiRequest(path, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(WORKER_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.error) || ('Server error ' + res.status));
    if (!data) throw new Error('Empty response from AI');
    return data;
  } finally { clearTimeout(timer); }
}

function aiErrorText(err) {
  if (err && err.name === 'AbortError') return 'AI took longer than 30 seconds. Please try again.';
  return (err && err.message) ? err.message : 'Could not reach the AI service.';
}

/* Rewrites the label every second so a slow answer still looks alive. */
function startClock(el, label) {
  const t0 = Date.now();
  const tick = () => { el.textContent = `${label} ${Math.round((Date.now() - t0) / 1000)}s`; };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

function bindUI() {
  if ($('#navNews')) $('#navNews').addEventListener('click', () => switchView('news'));
  if ($('#navStocks')) $('#navStocks').addEventListener('click', () => switchView('stocks'));

  // --- NEW: THEME TOGGLE LOGIC GOES HERE ---
  const themeToggleBtn = $('#themeToggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem(LS.theme, newTheme);
      
      // Update Icon
      themeToggleBtn.innerHTML = newTheme === 'dark' ? '<span aria-hidden="true">☀️</span>' : '<span aria-hidden="true">🌙</span>';
      
      // Re-theme existing charts if on Market page (do not refetch data)
      if ($('#stocksView').style.display !== 'none') {
        applyChartTheme(newTheme);
      }
    });
  }
  // -----------------------------------------

  /* Why a holding moved — the same news-grounded answer Market Movers gives,
     built from the ticker's own headlines rather than the macro feed. */
  async function pfWhyMoved(symbol) {
    const p = (I18N[state.lang] || I18N.en).portfolio;
    const out = document.querySelector('[data-pf-why-out="' + symbol + '"]');
    if (!out) return;
    out.hidden = false;
    const q = pfQuotes[symbol] || {};
    const pct = isFinite(q.pct) ? q.pct : 0;
    const stop = startClock(out, '✨ ' + p.whyMoved + '…');
    try {
      const items = await fetchTickerNews(symbol);
      const terms = [symbol.replace(/\.JK$/i, '').toLowerCase(), String(q.name || '').toLowerCase()].filter(t => t.length > 1);
      const related = state.articles.filter(a => {
        const text = ((a.title || '') + ' ' + (a.summary || '')).toLowerCase();
        return terms.some(term => text.includes(term));
      }).slice(0, 4);
      const seen = new Set(); const lines = []; const sources = [];
      items.forEach(n => {
        const key = n.title.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key); sources.push(n); lines.push(headlineLine(n));
      });
      related.forEach(a => {
        const key = (a.title || '').toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        sources.push({ publisher: a.sourceLabel || 'FINWIRE', link: a.link || '' });
        lines.push('- [' + (a.sourceLabel || 'FINWIRE') + '] ' + a.title);
      });
      if (!lines.length) { out.textContent = p.whyNoNews.replace('{sym}', symbol.replace(/\.JK$/i, '')); return; }
      const data = await aiRequest('/ai-explain-move', {
        symbol: symbol.replace(/\.JK$/i, ''), pct: pct, isUp: pct >= 0, lang: state.lang, newsText: lines.join('\n')
      });
      if (!data || !data.summary) { out.textContent = p.whyFailed; return; }
      const summary = data.summary.trim().replace(/^no specific news found,?\s*(but\s+)?(likely\s+)?(due\s+)?to\s*/i, '');
      const links = sources.slice(0, 3).map(n => n.link
        ? '<a href="' + esc(n.link) + '" target="_blank" rel="noopener noreferrer">' + esc(n.publisher) + '</a>'
        : esc(n.publisher)).join(' · ');
      out.innerHTML = '<strong>' + esc(p.whyMoved) + ':</strong> ' + esc(summary) +
        (links ? '<div class="explain-sources">Sources: ' + links + '</div>' : '');
      pfDetailOf(symbol).why = out.innerHTML;
    } catch (err) {
      out.textContent = aiErrorText(err);
    } finally { stop(); }
  }

  const pfHost = $('#portfolioPanel');
  if (pfHost) {
    pfHost.addEventListener('submit', (e) => {
      if (!e.target || e.target.id !== 'pfForm') return;
      e.preventDefault();
      addHolding($('#pfSymbol').value, $('#pfShares').value, $('#pfCost').value, pfInCur);
    });
    pfHost.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'pfSymbol') pfSyncInputCur();
    });
    pfHost.addEventListener('click', (e) => {
      const curBtn = e.target.closest('[data-pf-cur]');
      if (curBtn) { setPfCurrencyMode(curBtn.getAttribute('data-pf-cur')); return; }
      const inBtn = e.target.closest('[data-pf-in]');
      if (inBtn) { setPfInputCurrency(inBtn.getAttribute('data-pf-in')); return; }
      const openBtn = e.target.closest('[data-pf-open]');
      if (openBtn) { pfToggleDetail(openBtn.getAttribute('data-pf-open')); return; }
      const readBtn = e.target.closest('[data-pf-read]');
      if (readBtn) {
        const sym = readBtn.getAttribute('data-pf-read');
        const q = pfQuotes[sym] || {};
        openFundAi(sym, q.name || sym.replace(/\.JK$/i, ''));
        return;
      }
      const whyBtn = e.target.closest('[data-pf-why]');
      if (whyBtn) { pfWhyMoved(whyBtn.getAttribute('data-pf-why')); return; }
      const removeBtn = e.target.closest('[data-pf-remove]');
      if (!removeBtn) return;
      removeHolding(removeBtn.getAttribute('data-pf-remove'));
    });
  }

  const searchInput = $('#stockSearchInput');
  if ($('#stockSearchBtn')) $('#stockSearchBtn').addEventListener('click', () => searchStocks(searchInput.value.trim()));
  if (searchInput) searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchStocks(searchInput.value.trim()); } });

  $('#filters').addEventListener('click', (e) => {
    const regionBtn = e.target.closest('.seg-btn[data-region]');
    if (!regionBtn) return;
    state.region = regionBtn.getAttribute('data-region');
    // A source from the other region would filter to nothing.
    const allowed = SOURCES.filter(s => state.region === 'all' || s.region === state.region).map(s => s.id);
    if (state.filter !== 'all' && allowed.indexOf(state.filter) === -1) state.filter = 'all';
    renderFilters(); render();
  });

  $('#filters').addEventListener('change', (e) => {
    if (!e.target) return;
    if (e.target.id === 'unreadToggle') { state.unreadOnly = e.target.checked; render(); }
    else if (e.target.id === 'topicSelect') { state.categoryFilter = e.target.value; render(); }
    else if (e.target.id === 'sourceSelect') { state.filter = e.target.value; render(); }
  });

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
    if (!targetEl) return;
    
    if (targetEl.style.display === 'block') {
      targetEl.style.display = 'none';
      return;
    }

    btn.disabled = true;
    let stopClock = startClock(btn, '✨ Reading article...');
    
    try {
      const card = btn.closest('.card');
      const articleUrl = card ? card.getAttribute('data-url') : null;
      
      let textToSummarize = '';
      if (articleUrl) {
          textToSummarize = await getFullArticleText(articleUrl);
      }
      
      if (!textToSummarize || textToSummarize.length < 100) {
          textToSummarize = btn.getAttribute('data-text');
      }

      stopClock();
      stopClock = startClock(btn, '✨ Thinking...');
      
      const data = await aiRequest('/ai-summarize', { text: textToSummarize, lang: state.lang });
      
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
      targetEl.innerHTML = `<em>Failed: ${esc(aiErrorText(err))}</em>`;
      targetEl.style.display = 'block';
    } finally {
      stopClock();
      btn.disabled = false;
      btn.innerHTML = '✨ AI Summary';
    }
  });

  // Headlines published about one ticker — far more relevant to a single-stock
  // move than our own RSS feeds, which are mostly Indonesian macro/business news.
  // Yahoo covers US listings; for IDX it returns nothing at all, so the ticker is
  // instead searched in Bing's Indonesian news feed (Google News' equivalent
  // throttles us with 503s), falling back to Google when Bing comes up empty.
  function bingArticleLink(link) {
    const m = /[?&]url=([^&]+)/.exec(link || '');
    if (!m) return link || '';
    try { return decodeURIComponent(m[1]); } catch (e) { return link; }
  }

  function parseNewsFeed(xml, symbol, isBing) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const nodes = Array.prototype.slice.call(doc.getElementsByTagName('item'));
    const out = [];
    nodes.forEach(node => {
      let title = textOf(node, ['title']);
      const rawLink = linkOf(node);
      let publisher = textOf(node, ['source', 'News:Source']);
      if (!publisher) {
        const src = node.getElementsByTagNameNS ? node.getElementsByTagNameNS('*', 'Source')[0] : null;
        publisher = src ? (src.textContent || '').trim() : '';
      }
      const ts = Date.parse(textOf(node, ['pubDate'])) || 0;
      if (!title || !rawLink) return;
      // These feeds are relevance-ranked, so they drag in loose matches; keep only
      // headlines that actually name the ticker.
      if (title.toLowerCase().indexOf(symbol.toLowerCase()) === -1) return;
      if (publisher && title.endsWith(' - ' + publisher)) title = title.slice(0, title.length - 3 - publisher.length);
      out.push({
        title: title.trim(),
        publisher: publisher || (isBing ? 'Bing News' : 'Google News'),
        link: isBing ? bingArticleLink(rawLink) : rawLink,
        ts, tickers: [symbol]
      });
    });
    return out;
  }

  // A click on several tickers in a row should not re-hit the news feeds.
  const tickerNewsCache = new Map();
  const TICKER_NEWS_TTL = 5 * 60 * 1000;

  async function fetchIdxNews(symbol) {
    const cached = tickerNewsCache.get(symbol);
    if (cached && Date.now() - cached.at < TICKER_NEWS_TTL) return cached.items;
    const feeds = [
      { url: `https://www.bing.com/news/search?q=${encodeURIComponent(symbol + ' saham')}&format=RSS&setlang=id`, bing: true },
      { url: `https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' saham')}&hl=id&gl=ID&ceid=ID:id`, bing: false }
    ];
    for (let i = 0; i < feeds.length; i++) {
      try {
        const items = parseNewsFeed(await fetchViaProxy(feeds[i].url, { timeout: 7000 }), symbol, feeds[i].bing);
        if (items.length) { tickerNewsCache.set(symbol, { at: Date.now(), items }); return items; }
      } catch (err) { /* try the next feed */ }
    }
    return [];
  }

  async function fetchTickerNews(symbol) {
    const clean = symbol.replace(/\.JK$/i, '').toUpperCase();
    let items = [];
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=12&quotesCount=0&enableFuzzyQuery=false`;
      const data = JSON.parse(await fetchViaProxy(url, { timeout: 7000 }));
      items = (data.news || []).filter(n => n && n.title).map(n => ({
        title: n.title.trim(),
        publisher: n.publisher || 'Yahoo Finance',
        link: n.link || '',
        ts: (n.providerPublishTime || 0) * 1000,
        tickers: n.relatedTickers || []
      }));
      const tagged = items.filter(n => n.tickers.indexOf(clean) !== -1);
      items = tagged.length ? tagged : items;
    } catch (err) { items = []; }

    if (/\.JK$/i.test(symbol)) {
      try { items = items.concat(await fetchIdxNews(clean)); }
      catch (err) { /* Indonesian press unreachable — fall back to whatever we have */ }
    }

    const seen = new Set();
    return items
      .filter(n => {
        const key = n.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key); return true;
      })
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 8);
  }

  function headlineLine(n) {
    const age = n.ts ? new Date(n.ts).toISOString().slice(0, 10) : '';
    return `- [${n.publisher}] ${n.title}${age ? ` (${age})` : ''}`;
  }

  // AI EXPLAIN MOVE LOGIC
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.explain-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    const sym = btn.getAttribute('data-sym');
    const pct = btn.getAttribute('data-pct');
    const isUp = btn.getAttribute('data-up') === 'true';
    
    const row = document.getElementById(`explain-row-${sym}`);
    const textEl = document.getElementById(`explain-text-${sym}`);
    
    if (row.style.display === 'table-row') {
      row.style.display = 'none';
      return;
    }

    row.style.display = 'table-row';
    textEl.innerHTML = '✨ Analyzing news for this move...';
    textEl.style.display = 'block';

    // Only articles that actually mention the ticker or the company. Feeding the
    // model unrelated headlines is what made it answer with invented "macro"
    // reasons instead of the real story.
    const searchTerms = [sym.replace('.JK', '').toLowerCase(), btn.closest('tr').querySelector('td:nth-child(2)').textContent.toLowerCase()];
    const relatedArticles = state.articles.filter(a => {
      const text = (a.title + ' ' + a.summary).toLowerCase();
      return searchTerms.some(term => term.length > 1 && text.includes(term));
    }).slice(0, 5);
    
    const stopClock = startClock(textEl, '✨ Analyzing news...');
    let sources = [];
    try {
      // News explains the move; fundamentals show what the company is actually
      // worth, so both are fetched together and rendered in one box.
      const [newsRes, fundRes] = await Promise.allSettled([fetchTickerNews(sym), fetchFundamentals(sym)]);
      const tickerNews = newsRes.status === 'fulfilled' ? newsRes.value : [];
      const fundHTML = fundRes.status === 'fulfilled'
        ? fundamentalsHTML(fundRes.value, state.lang, sym) : '';

      // Ticker-specific headlines first: they are what actually explain a single move.
      const seen = new Set();
      const lines = [];
      tickerNews.forEach(n => {
        const key = n.title.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key); sources.push(n);
        lines.push(headlineLine(n));
      });
      relatedArticles.forEach(a => {
        const key = (a.title || '').toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        const label = a.sourceLabel || 'FINWIRE';
        sources.push({ publisher: label, link: a.link || '' });
        lines.push(`- [${label}] ${a.title}`);
      });

      if (lines.length === 0) {
        textEl.innerHTML = `<strong>Why it moved:</strong> No news about ${esc(sym.replace('.JK', ''))} found today. Check the company's filings for the reason.${fundHTML}`;
        return;
      }

      // Send the exchange-agnostic code so the answer never reads "TLKM.JK".
      const data = await aiRequest('/ai-explain-move', {
        symbol: sym.replace(/\.JK$/i, ''), pct, isUp, lang: state.lang,
        newsText: lines.join('\n')
      });
      
      if (data && data.summary) {
        // The older worker prompt forced a "No specific news found, but likely due to…"
        // prefix even when real company headlines were supplied. Drop it in that case
        // so the reader is not told the opposite of what the answer is based on.
        let summary = data.summary.trim();
        if (sources.length) {
          const stripped = summary.replace(/^no specific news found,?\s*(but\s+)?(likely\s+)?(due\s+)?to\s*/i, '');
          if (stripped && stripped !== summary) {
            summary = stripped.charAt(0).toUpperCase() + stripped.slice(1);
          }
        }
        const links = sources.slice(0, 3).map(n => n.link
          ? `<a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.publisher)}</a>`
          : esc(n.publisher)).join(' · ');
        const srcLine = links ? `<div class="explain-sources">Sources: ${links}</div>` : '';
        textEl.innerHTML = `<strong>Why it moved:</strong> ${esc(summary)}${srcLine}${fundHTML}`;
      } else {
        textEl.innerHTML = `<em>Could not analyze the move.</em>`;
      }
    } catch (err) {
      textEl.innerHTML = `<em>${esc(aiErrorText(err))}</em>`;
    } finally {
      stopClock();
    }
  });

  // Daily Briefing Logic
  const briefingBtn = $('#generateBriefingBtn');
  if (briefingBtn) {
    briefingBtn.addEventListener('click', async () => {
      const contentEl = $('#briefingContent');
      const articles = currentArticles().slice(0, 15);
      if (articles.length === 0) return;

      const combinedText = articles.map((a, i) => `${i+1}. ${a.title} - ${a.summary}`).join('\n\n');

      briefingBtn.disabled = true;
      briefingBtn.innerHTML = '✨ Analyzing 15 articles...';
      contentEl.style.display = 'block';
      const stopClock = startClock(contentEl, '✨ Reading the latest headlines...');

      try {
        const data = await aiRequest('/ai-summarize', { text: combinedText, isBriefing: true, lang: state.lang });
        
        if (data && data.summary) {
          let formattedText = data.summary
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/^\* (.*$)/gim, '<li>$1</li>');
          
          if (formattedText.includes('<li>')) formattedText = `<ul>${formattedText}</ul>`;

          contentEl.innerHTML = `<strong>Market Briefing:</strong><br>${formattedText}`;
          contentEl.style.display = 'block';
        } else {
          contentEl.innerHTML = `<em>Failed to generate briefing. Try again.</em>`;
          contentEl.style.display = 'block';
        }
      } catch (err) {
        stopClock();
        contentEl.innerHTML = `<em>${esc(aiErrorText(err))}</em>`;
        contentEl.style.display = 'block';
      } finally {
        stopClock();
        briefingBtn.disabled = false;
        briefingBtn.innerHTML = '✨ Generate Today\'s Market Briefing';
      }
    });
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => renderTicker(state.ticker), 350); });
  setInterval(refreshTimes, 60 * 1000);
}

function init() {
  // --- LOAD SAVED THEME ---
  const savedTheme = localStorage.getItem(LS.theme) || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const themeToggleBtn = $('#themeToggle');
  if (themeToggleBtn) {
    themeToggleBtn.innerHTML = savedTheme === 'dark' ? '<span aria-hidden="true">☀️</span>' : '<span aria-hidden="true">🌙</span>';
  }
  // ------------------------

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