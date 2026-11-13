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
    navNews: 'News', navMarkets: 'Markets', mktTitle: 'Market Data', mktTabHoldings: 'My holdings', mktTabExplore: 'Explore markets', searchPh: 'Search ticker…', searchBtn: 'Search',
    stockLoading: 'Fetching market data…', stockSearch: 'Searching…', stockNoRes: 'No results found.', stockErr: 'Search failed.',
    market: {
      gauges: 'Markets at a glance',
      addTicker: 'Add ticker', addTickerPh: 'Ticker, e.g. BBCA.JK', notFound: 'No quote found', removeTicker: 'Remove ticker',
      performance: 'Performance', performanceSub: 'All indexes in US dollars, each day converted at that day\u2019s USD/IDR or USD/JPY close, then rebased over the dates every selected index shares',
      movers: 'Top movers', gainers: 'Gainers', losers: 'Losers',
      mostActive: 'Most active', watch: 'Market watch', rates: 'Rates & volatility',
      coverage: 'Coverage', coverageSub: 'Open a card for its fundamentals and the AI read',
      bluechips: 'IDX bluechips', usTech: 'US tech', etfs: 'ETFs',
      staticLabel: 'Static'
    },
    cats: { all: 'All Topics', markets: 'Markets', macro: 'Macro', politics: 'Politics', tech: 'Tech', crypto: 'Crypto', commodities: 'Commodities' },
    portfolio: {
      title: 'Portfolio Tracker', subtitle: 'Your positions, tracked in this browser',
      symPh: 'Ticker (AAPL, BBCA.JK)', sharesPh: 'Shares', costPh: 'Avg cost', add: 'Add',
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
      whyFailed: 'No analysis came back. Try again.',
      totalValue: 'Total value', invested: 'Invested capital', netPl: 'Net gain / loss',
      perfTitle: 'Portfolio performance', perfSub: 'Portfolio and benchmarks, indexed to 100 at the start of the period',
      portfolio: 'Portfolio', benchmark: 'IHSG',
      allocTitle: 'Allocation', allocSub: 'By asset class',
      classIdx: 'IDX equities', classUs: 'US equities', classEtf: 'ETFs', classCrypto: 'Crypto',
      moveTitle: 'Contributors', moveSub: 'Profit and loss by holding', gaining: 'Gaining', losing: 'Losing',
      activityTitle: 'Recent activity', activitySub: 'Adds, removals and dividends paid on your holdings', actDividend: 'Dividend',
      activityEmpty: 'Nothing logged yet. Adding or removing a holding is recorded here.',
      actAdd: 'Added', actRemove: 'Removed',
      holdingsTitle: 'Holdings', holdingsSub: 'Open a row for fundamentals and the AI read',
      filterLabel: 'Filter holdings', filterAll: 'All',
      trendEmpty: 'Add a holding to chart performance.', loadingTrend: 'Rebuilding your trend…',
      chartNote: 'Rebuilt from your holdings as they stand today — not a recorded portfolio history. Index lines are converted at each day’s rate.',
      chartNoteFx: 'Converted at 1 USD = {rate}.'
    },
    fund: {
      title: 'Fundamentals', mktCap: 'Market cap', pe: 'P/E', rev: 'Revenue', revGrowth: 'Revenue growth',
      yoy: 'Revenue YoY', netIncome: 'Net income', netMargin: 'Net margin', eps: 'EPS', roe: 'ROE',
      equity: 'Shareholders’ equity', annualised: 'annualised',
      fcf: 'Free cash flow', fy: 'FY', period: 'Reporting period', note: 'Yahoo Finance',
      converted: r => `Statement in USD, converted at Rp ${r}/USD`, reportedIn: c => `Statement reported in ${c}`,
      noData: 'No figures reported for this period.'
    },
    fin: {
      title: 'Financial report', kind: 'Period', quarterly: 'Quarterly', annual: 'Annual',
      loading: 'Loading the report…', close: 'Close', chartRevenue: 'Revenue and net income', aiRead: 'AI read',
      noData: 'No report available for this company.',
      note: 'Reported figures · Yahoo Finance · not investment advice'
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
      divFilter: 'Min yield', divAll: 'All', divNoMatch: 'No name clears that yield hurdle.',
      snapshot: 'Jakarta snapshot', ihsgSub: 'IHSG · composite', today: 'today',
      dayHigh: 'Day high', dayLow: 'Day low', prevClose: 'Prev close', volume: 'Volume', dayRange: 'Day range',
      wkRange: '52-week range', leaders: 'Breadth & leaders', topLoser: 'Top IDX loser'
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
    navNews: 'Berita', navMarkets: 'Pasar', mktTitle: 'Data Pasar', mktTabHoldings: 'Portofolio saya', mktTabExplore: 'Jelajah pasar', searchPh: 'Cari ticker…', searchBtn: 'Cari',
    stockLoading: 'Memuat data pasar…', stockSearch: 'Mencari…', stockNoRes: 'Tidak ada hasil.', stockErr: 'Pencarian gagal.',
    market: {
      gauges: 'Pasar sekilas',
      addTicker: 'Tambah ticker', addTickerPh: 'Ticker, mis. BBCA.JK', notFound: 'Harga tidak ditemukan', removeTicker: 'Hapus ticker',
      performance: 'Kinerja', performanceSub: 'Semua indeks dalam dolar AS, tiap hari dikonversi memakai kurs USD/IDR atau USD/JPY penutupan hari itu, lalu diindeks pada tanggal yang dimiliki semua indeks terpilih',
      movers: 'Penggerak teratas', gainers: 'Naik', losers: 'Turun',
      mostActive: 'Teraktif', watch: 'Pantauan pasar', rates: 'Suku bunga & volatilitas',
      coverage: 'Liputan', coverageSub: 'Buka kartu untuk fundamental dan analisis AI',
      bluechips: 'Bluechip IDX', usTech: 'Teknologi AS', etfs: 'ETF',
      staticLabel: 'Statis'
    },
    cats: { all: 'Semua Topik', markets: 'Pasar', macro: 'Makro', politics: 'Politik', tech: 'Teknologi', crypto: 'Kripto', commodities: 'Komoditas' },
    portfolio: {
      title: 'Pelacak Portofolio', subtitle: 'Posisi Anda, tersimpan di peramban ini',
      symPh: 'Ticker (AAPL, BBCA.JK)', sharesPh: 'Lembar', costPh: 'Harga rata-rata', add: 'Tambah',
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
      whyFailed: 'Analisis tidak tersedia. Coba lagi.',
      totalValue: 'Nilai total', invested: 'Modal', netPl: 'Laba / rugi bersih',
      perfTitle: 'Kinerja portofolio', perfSub: 'Portofolio dan pembanding, diindeks ke 100 di awal periode',
      portfolio: 'Portofolio', benchmark: 'IHSG',
      allocTitle: 'Alokasi', allocSub: 'Menurut kelas aset',
      classIdx: 'Saham IDX', classUs: 'Saham AS', classEtf: 'ETF', classCrypto: 'Kripto',
      moveTitle: 'Kontributor', moveSub: 'Laba dan rugi per posisi', gaining: 'Menguat', losing: 'Melemah',
      activityTitle: 'Aktivitas terbaru', activitySub: 'Penambahan, penghapusan, dan dividen pada posisi Anda', actDividend: 'Dividen',
      activityEmpty: 'Belum ada catatan. Menambah atau menghapus posisi akan tercatat di sini.',
      actAdd: 'Ditambah', actRemove: 'Dihapus',
      holdingsTitle: 'Kepemilikan', holdingsSub: 'Buka baris untuk fundamental dan analisis AI',
      filterLabel: 'Saring kepemilikan', filterAll: 'Semua',
      trendEmpty: 'Tambahkan posisi untuk melihat grafik kinerja.', loadingTrend: 'Menyusun tren Anda…',
      chartNote: 'Disusun ulang dari posisi Anda hari ini — bukan riwayat portofolio yang tercatat. Garis indeks dikonversi pada kurs harian.',
      chartNoteFx: 'Dikonversi pada 1 USD = {rate}.'
    },
    fund: {
      title: 'Fundamental', mktCap: 'Kap. pasar', pe: 'P/E', rev: 'Pendapatan', revGrowth: 'Pertumbuhan pendapatan',
      yoy: 'Pendapatan YoY', netIncome: 'Laba bersih', netMargin: 'Margin bersih', eps: 'EPS', roe: 'ROE',
      equity: 'Ekuitas pemegang saham', annualised: 'disetahunkan',
      fcf: 'Arus kas bebas', fy: 'TA', period: 'Periode laporan', note: 'Yahoo Finance',
      converted: r => `Laporan dalam USD, dikonversi Rp ${r}/USD`, reportedIn: c => `Laporan dalam ${c}`,
      noData: 'Tidak ada angka untuk periode ini.'
    },
    fin: {
      title: 'Laporan keuangan', kind: 'Periode', quarterly: 'Kuartal', annual: 'Tahunan',
      loading: 'Memuat laporan…', close: 'Tutup', chartRevenue: 'Pendapatan dan laba bersih', aiRead: 'Analisis AI',
      noData: 'Laporan tidak tersedia untuk emiten ini.',
      note: 'Angka laporan · Yahoo Finance · bukan saran investasi'
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
      divFilter: 'Yield min', divAll: 'Semua', divNoMatch: 'Tidak ada emiten yang melewati batas yield itu.',
      snapshot: 'Ringkasan Jakarta', ihsgSub: 'IHSG · gabungan', today: 'hari ini',
      dayHigh: 'Tertinggi', dayLow: 'Terendah', prevClose: 'Penutupan lalu', volume: 'Volume', dayRange: 'Rentang hari',
      wkRange: 'Rentang 52 minggu', leaders: 'Breadth & pemimpin', topLoser: 'Loser IDX teratas'
    }
  }
};

/* Tickers the reader pinned to the top strip. Only symbols are stored; the
   quote and the sparkline are fetched fresh with the rest of the board. */
const MKT_HERO_KEY = 'finwire.market.heroes.v1';
function mktHeroSymbols() {
  const saved = loadJSON(MKT_HERO_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved.filter(function (sym, i) {
    return typeof sym === 'string' && sym && saved.indexOf(sym) === i;
  });
}
function saveMktHeroes(list) { saveJSON(MKT_HERO_KEY, list); }

const SOURCE_BY_ID = {};
SOURCES.forEach(function (source) { SOURCE_BY_ID[source.id] = source; });

const state = { articles: [], ticker: [], filter: 'all', categoryFilter: 'all', region: 'all', unreadOnly: false, marketView: 'holdings', lang: 'en', read: new Set(), watch: [], lastTs: 0, lastKind: '', loading: false };

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
/* The markets page answers two different questions — what do I own, and what
   is out there — so it holds two views instead of one long scroll. The
   explore board only fetches once, when it is first opened. */
function setMarketView(view) {
  state.marketView = view === 'explore' ? 'explore' : 'holdings';
  const hold = document.getElementById('holdingsView');
  const explore = document.getElementById('exploreView');
  if (hold) hold.hidden = state.marketView !== 'holdings';
  if (explore) explore.hidden = state.marketView !== 'explore';
  const tabs = document.querySelectorAll('#mktViewTabs [data-mkt-view]');
  Array.prototype.forEach.call(tabs, function (btn) {
    const on = btn.getAttribute('data-mkt-view') === state.marketView;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (state.marketView === 'explore') {
    const dash = document.getElementById('stockDashboard');
    if (dash && !dash.dataset.loaded) loadMarketDashboard();
  } else {
    /* A chart built while its panel was hidden measures zero width, so the
       trend is drawn again the moment the holdings view is back on screen. */
    setTimeout(renderPortfolio, 0);
  }
}

function switchView(view) {
  if (view === 'news') {
    $('#newsView').style.display = 'block'; $('#stocksView').style.display = 'none'; $('#filters').style.display = 'block';
    $('#navNews').classList.add('active'); $('#navStocks').classList.remove('active');
  } else {
    $('#newsView').style.display = 'none'; $('#stocksView').style.display = 'block'; $('#filters').style.display = 'none';
    $('#navNews').classList.remove('active'); $('#navStocks').classList.add('active');
    setMarketView(state.marketView);
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

function mktFmt(v, digits) {
  return (v == null || !isFinite(v)) ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: digits == null ? 2 : digits });
}

function mktQuoteRow(label, value, pct, meta) {
  const pctHtml = (pct == null || !isFinite(pct)) ? ''
    : `<span class="mkt-list-pct ${pct >= 0 ? 'up' : 'down'}">${pct > 0 ? '+' : ''}${pct.toFixed(2)}%</span>`;
  return `<div class="mkt-list-row">
      <div class="mkt-list-main"><span class="mkt-sym">${esc(label)}</span>${meta ? `<span class="mkt-list-name">${esc(meta)}</span>` : ''}</div>
      <div class="mkt-list-right"><span class="mkt-list-val">${esc(value)}</span>${pctHtml}</div>
    </div>`;
}

/* "Most active" is a volume ranking, so the figure that earns the row is the
   traded volume rather than a price every other card already shows. */
function mktVol(v) {
  if (v == null || !isFinite(v) || v === 0) return '\u2014';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(Math.round(v));
}

function mktActiveRows(list) {
  return (list || []).map(s => `<div class="mkt-list-row">
      <div class="mkt-list-main"><span class="mm-sym">${esc(s.symbol.replace('.JK', ''))}</span><span class="mkt-list-name">${esc(s.name)}</span></div>
      <div class="mkt-list-right"><span class="mkt-list-val">${mktVol(s.volume)}</span><span class="mkt-list-pct ${s.pct >= 0 ? 'up' : 'down'}">${s.pct > 0 ? '+' : ''}${s.pct.toFixed(2)}%</span></div>
    </div>`).join('');
}

/* A mover is the ticker, its name and the move — nothing else competes with it. */
function mktMoverRow(s) {
  const up = s.pct >= 0;
  return `<div class="mm-row">
      <a class="mm-main" href="https://finance.yahoo.com/quote/${esc(s.symbol)}" target="_blank" rel="noopener noreferrer">
        <span class="mm-sym">${esc(s.symbol.replace('.JK', ''))}</span>
        <span class="mm-name">${esc(s.name)}</span>
      </a>
      <span class="mm-chg ${up ? 'up' : 'down'}">${up ? '+' : ''}${s.pct.toFixed(2)}%</span>
    </div>`;
}

function mktMoverCols(gainers, losers) {
  const m = I18N[state.lang].market;
  // Ten stacked rows is a scroll on a phone, so a narrow card shows the top four.
  const limit = window.innerWidth <= 560 ? 4 : 5;
  const col = (label, list, cls) => `<div class="mm-col">
      <div class="mkt-col-label ${cls}">${esc(label)}</div>
      ${(list || []).slice(0, limit).map(mktMoverRow).join('')}
    </div>`;
  return col(m.gainers, gainers, 'up') + col(m.losers, losers, 'down');
}

/* Two markets on one axis only compare fairly when both start at zero, so
   history is rebased to percent change from the first close in the range. */
function pctSeries(points) {
  const clean = (points || []).filter(p => p && isFinite(p.y) && p.y !== 0);
  if (clean.length < 2) return [];
  const base = clean[0].y;
  return clean.map(p => ({ x: p.x, y: ((p.y / base) - 1) * 100 }));
}

function pfBenchChipsHtml() {
  return PF_BENCH.map(function (b) {
    const on = pfBenchSel.indexOf(b.id) !== -1;
    return `<button type="button" class="pf-bench${on ? ' active' : ''}" data-pf-bench="${b.id}" aria-pressed="${on ? 'true' : 'false'}"><i style="background:${b.color}"></i>${esc(b.label)} <b>—</b></button>`;
  }).join('');
}

function pfToggleBench(id) {
  const at = pfBenchSel.indexOf(id);
  if (at === -1) pfBenchSel.push(id);
  else if (pfBenchSel.length > 1) pfBenchSel.splice(at, 1);
  saveJSON(PF_BENCH_KEY, pfBenchSel);
}

/* The explore board draws the same indexes, so it keeps its own histories and
   redraws only its chart when a chip changes — reloading the whole board for a
   toggle would cost another sixty quotes. */
let marketBenchRange = '6mo';
const mktBenchCache = Object.create(null);

/* IHSG is quoted in rupiah, the Nikkei in yen, the American indexes in
   dollars: on one axis those are different units, so every line is converted
   to dollars before it is rebased. The rate is that day's own close, the same
   way the portfolio chart does it. */
const PF_BENCH_CCY = 'USD';

function pfRateSeries(list) {
  return (list || []).filter(function (p) { return p && isFinite(p.y) && p.y > 0; })
    .map(function (p) { return { k: pfDayKey(p.x), v: p.y }; })
    .sort(function (a, b) { return a.k < b.k ? -1 : a.k > b.k ? 1 : 0; });
}

/* The last rate on or before that day: FX closes on its own holidays, so a
   missing day borrows the previous one instead of leaving a hole. */
function pfRateOn(series, day) {
  if (!series.length) return null;
  let hit = null;
  for (let i = 0; i < series.length; i++) {
    if (series[i].k <= day) hit = series[i].v; else break;
  }
  return hit == null ? series[0].v : hit;
}

function mktBenchLoad(symbol, range) {
  const cacheKey = symbol + '|' + range;
  if (mktBenchCache[cacheKey]) return Promise.resolve(mktBenchCache[cacheKey]);
  return fetchHistory(symbol, range).catch(function () { return []; }).then(function (list) {
    if (list && list.length) mktBenchCache[cacheKey] = list;
    return list || [];
  });
}

async function pfBenchHistories(range) {
  const sel = PF_BENCH.filter(function (b) { return pfBenchSel.indexOf(b.id) !== -1; });
  const needsFx = function (b) { return b.currency !== PF_BENCH_CCY; };
  await Promise.all(sel.map(function (b) { return needsFx(b) ? pfEnsureFx(b.currency) : 1; }));
  const lists = await Promise.all(sel.map(function (b) { return mktBenchLoad(b.symbol, range); }));
  const fxLists = await Promise.all(sel.map(function (b) {
    return needsFx(b) ? mktBenchLoad(b.currency + '=X', range) : Promise.resolve([]);
  }));
  const converted = sel.map(function (b, i) {
    const rates = pfRateSeries(fxLists[i]);
    return (lists[i] || []).map(function (p) {
      if (!p || !isFinite(p.y) || p.y <= 0) return { x: p && p.x, y: null };
      if (!needsFx(b)) return { x: p.x, y: p.y };
      /* Spot is only a fallback for a range too short to carry a rate. */
      const units = pfRateOn(rates, pfDayKey(p.x)) || pfUnitsPerUsd(b.currency);
      return units ? { x: p.x, y: p.y / units } : { x: p.x, y: null };
    });
  });

  /* Jakarta, New York and Tokyo close on different days, so untrimmed lines
     start and end a day apart. The span kept is the one every selected index
     traded in — the same days at both ends, rebased from that first day. */
  const span = pfSharedSpan(converted);
  return sel.map(function (b, i) {
    const list = span ? converted[i].filter(function (p) {
      if (!p || !isFinite(p.y)) return false;
      const k = pfDayKey(p.x);
      return k >= span.from && k <= span.to;
    }) : converted[i];
    return { id: b.id, label: b.label, color: b.color, currency: PF_BENCH_CCY, data: pctSeries(list) };
  });
}

function pfSharedSpan(lists) {
  if (!lists || lists.length < 2) return null;
  const sets = lists.map(function (list) {
    const set = Object.create(null);
    (list || []).forEach(function (p) { if (p && isFinite(p.y)) set[pfDayKey(p.x)] = 1; });
    return set;
  });
  const shared = Object.keys(sets[0]).filter(function (k) {
    return sets.every(function (set) { return set[k]; });
  }).sort();
  if (shared.length < 2) return null;
  return { from: shared[0], to: shared[shared.length - 1] };
}

function paintBenchChips(scope, series) {
  const root = scope || document;
  Array.prototype.forEach.call(root.querySelectorAll('.pf-bench'), function (btn) {
    const id = btn.getAttribute('data-pf-bench');
    const on = pfBenchSel.indexOf(id) !== -1;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const val = btn.querySelector('b');
    if (!val) return;
    const hit = (series || []).filter(function (x) { return x.id === id; })[0];
    const last = (hit && hit.data.length) ? hit.data[hit.data.length - 1].y : null;
    if (last == null || !isFinite(last)) { val.textContent = '—'; val.className = ''; return; }
    val.textContent = (last > 0 ? '+' : '') + last.toFixed(2) + '%';
    val.className = last >= 0 ? 'up' : 'down';
  });
}

async function renderMarketBench(range) {
  if (range) marketBenchRange = range;
  const series = await pfBenchHistories(marketBenchRange);
  paintBenchChips(document.getElementById('benchLegend'), series);
  if (!benchChart) return;
  try {
    benchChart.updateOptions({ colors: series.map(function (x) { return x.color; }) });
    benchChart.updateSeries(series.map(function (x) { return { name: x.label, data: x.data }; }));
  } catch (e) {}
}

let benchChart = null;

const chartInstances = [];

function destroyCharts() {
  chartInstances.forEach(c => { try { c.destroy(); } catch (e) {} });
  chartInstances.length = 0;
  benchChart = null;
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

/* FINANCIAL REPORT ---------------------------------------------------------
   A card is a price; the report behind it is a different question, so opening
   one shows the statements the fundamentals feed already carries — annual or
   quarterly, charted across the periods it has. */
let finModalEl = null;
let finCharts = [];
let finState = { symbol: null, name: '', kind: 'q', ai: null };
let finAiClock = null;
let finAiBusy = false;

function finT() { return I18N[state.lang].fin; }

function finModal() {
  if (finModalEl) return finModalEl;
  const t = finT();
  const wrap = document.createElement('div');
  wrap.className = 'fin-modal';
  wrap.innerHTML = '<div class="fin-card" role="dialog" aria-modal="true" aria-labelledby="finTitle">' +
    '<div class="fin-head"><div class="fin-head-main">' +
    '<div class="fin-kicker" id="finKicker"></div><h2 class="fin-title" id="finTitle"></h2></div>' +
    '<div class="fin-head-side"><div class="fin-seg" id="finSeg" role="group" aria-label="' + esc(t.kind) + '">' +
    '<button type="button" class="active" data-fin-kind="q">' + esc(t.quarterly) + '</button>' +
    '<button type="button" data-fin-kind="y">' + esc(t.annual) + '</button></div>' +
    '<button type="button" class="fin-ai" id="finAi" title="' + esc(I18N[state.lang].fundAi.title) + '">✨ ' + esc(t.aiRead) + '</button>' +
    '<button type="button" class="modal-x fin-close" aria-label="' + esc(t.close) + '">×</button></div></div>' +
    '<div class="fin-body" id="finBody"></div>' +
    '<div class="fin-note">' + esc(t.note) + '</div></div>';
  wrap.addEventListener('click', function (e) {
    if (e.target === wrap || (e.target.closest && e.target.closest('.fin-close'))) { closeFinancials(); return; }
    if (e.target.closest && e.target.closest('#finAi')) { runFinAi(); return; }
    const btn = e.target.closest ? e.target.closest('[data-fin-kind]') : null;
    if (!btn) return;
    const kind = btn.getAttribute('data-fin-kind');
    if (kind === finState.kind) return;
    finState.kind = kind;
    $$('#finSeg button', wrap).forEach(b => b.classList.toggle('active', b === btn));
    paintFinBody();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && finModalEl && finModalEl.classList.contains('open')) closeFinancials();
  });
  document.body.appendChild(wrap);
  finModalEl = wrap;
  return wrap;
}

document.addEventListener('click', function (e) {
  const target = e.target.closest ? e.target.closest('[data-fin-open]') : null;
  if (!target) return;
  /* The card body is itself a button; a real control inside the row is not. */
  const inner = e.target.closest('button');
  if (inner && inner !== target) return;
  openFinancials(target.getAttribute('data-fin-open'), target.getAttribute('data-fin-name'));
});

function openFinancials(symbol, name) {
  const wrap = finModal();
  if (finState.symbol !== symbol) { finState.ai = null; finAiStop(); }
  finState.symbol = symbol;
  finState.name = name || symbol;
  wrap.classList.add('open');
  document.getElementById('finKicker').textContent = symbol.replace('.JK', '');
  document.getElementById('finTitle').textContent = name || symbol;
  $$('#finSeg button', wrap).forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-fin-kind') === finState.kind);
  });
  paintFinBody();
}

function closeFinancials() {
  if (!finModalEl) return;
  finModalEl.classList.remove('open');
  finAiStop();
  destroyFinCharts();
}

function finAiStop() {
  if (finAiClock) { finAiClock(); finAiClock = null; }
}

/* The read follows the figures it is reading, so it renders in the report
   instead of floating over it in a second panel. */
async function runFinAi() {
  const slot = document.getElementById('finAiSlot');
  if (!slot || finAiBusy) return;
  const t = I18N[state.lang].fundAi;
  const symbol = finState.symbol, name = finState.name;
  const btn = document.getElementById('finAi');
  finAiBusy = true;
  if (btn) btn.disabled = true;
  slot.innerHTML = '<div class="fin-ai-panel"><div class="fin-ai-head">✨ ' + esc(t.title) +
    '</div><div class="fin-ai-text" id="finAiText"></div></div>';
  const text = document.getElementById('finAiText');
  finAiStop();
  if (text) finAiClock = startClock(text, t.loading);
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
    if (symbol !== finState.symbol) return;
    finState.ai = { text: (data && data.summary) ? data.summary.trim() : t.failed, err: false };
  } catch (err) {
    if (symbol !== finState.symbol) return;
    const message = aiErrorText(err);
    finState.ai = { text: /\b(404|405)\b/.test(message) ? t.unavailable : message, err: true };
  } finally {
    finAiStop();
    finAiBusy = false;
    if (btn) btn.disabled = false;
  }
  paintFinAiOut();
}

function paintFinAiOut() {
  const slot = document.getElementById('finAiSlot');
  if (!slot) return;
  slot.innerHTML = finState.ai ? fundAiHtml(finState.ai.text, finState.ai.err) : '';
}

function destroyFinCharts() {
  finCharts.forEach(function (c) { try { c.destroy(); } catch (e) {} });
  finCharts = [];
}

async function paintFinBody() {
  const body = document.getElementById('finBody');
  if (!body) return;
  const t = finT(), f = I18N[state.lang].fund;
  const symbol = finState.symbol;
  destroyFinCharts();
  body.innerHTML = '<div class="fin-loading">' + esc(t.loading) + '</div>';
  let fund = null;
  try { fund = await fetchFundamentals(symbol); } catch (e) { fund = null; }
  if (finState.symbol !== symbol) return;
  const list = fund ? (finState.kind === 'q'
    ? fund.periods.filter(p => p.kind === 'Q')
    : fund.annual.slice()).slice(0, 8) : [];
  if (!list.length) { body.innerHTML = '<div class="fin-empty">' + esc(t.noData) + '</div>'; return; }

  const val = p => (p && isFinite(p.raw)) ? compactNum(p.raw, p.currency) : '—';
  const roeText = function (p) {
    const roe = fundRoe(p);
    return roe == null ? '—' : roe.toFixed(1) + '%';
  };
  const newest = list[0];
  const per = periodLabel(newest, f);
  const tile = function (label, value, sub, growth) {
    return '<div class="fin-kpi"><span class="fin-kpi-label">' + esc(label) + '</span>' +
      '<strong class="fin-kpi-value">' + esc(value) + '</strong>' +
      '<span class="fin-kpi-sub">' + esc(sub) + '</span>' +
      (growth == null ? '' : '<span class="fin-kpi-badge ' + (growth >= 0 ? 'up' : 'down') + '">' +
        (growth >= 0 ? '+' : '') + growth.toFixed(1) + '% ' + esc(f.yoy) + '</span>') +
      '</div>';
  };
  body.innerHTML =
    '<div class="fin-kpis">' +
      tile(f.rev, val(newest.revenue), per, newest.growth) +
      tile(f.netIncome, val(newest.netIncome), newest.margin == null ? per : per + ' · ' + newest.margin.toFixed(1) + '% ' + f.netMargin, null) +
      tile(f.eps, val(newest.eps), per, null) +
      tile(f.fcf, val(newest.fcf), per, null) +
      tile(f.equity, val(newest.equity), per, null) +
      tile(f.roe, roeText(newest), newest.kind === 'Q' ? per + ' · ' + f.annualised : per, null) +
    '</div>' +
    '<div id="finAiSlot"></div>' +
    '<div class="fin-charts">' +
      '<div class="fin-chart"><h3>' + esc(t.chartRevenue) + '</h3><div class="fin-chart-meta">' +
        esc((newest.revenue && newest.revenue.currency) || fund.currency || '') + '</div><div id="finBar"></div></div>' +
      '<div class="fin-chart"><h3>' + esc(f.netMargin) + '</h3><div class="fin-chart-meta">%</div>' +
        '<div id="finLine"></div></div>' +
    '</div>' +
    '<div class="fin-table-wrap"><table class="fin-table"><thead><tr>' +
      '<th>' + esc(f.period) + '</th><th>' + esc(f.rev) + '</th><th>' + esc(f.revGrowth) + '</th>' +
      '<th>' + esc(f.netIncome) + '</th><th>' + esc(f.netMargin) + '</th><th>' + esc(f.eps) + '</th>' +
      '<th>' + esc(f.fcf) + '</th><th>' + esc(f.equity) + '</th><th>' + esc(f.roe) + '</th></tr></thead><tbody>' +
      list.map(function (p) {
        const g = p.growth;
        return '<tr><td>' + esc(periodLabel(p, f)) + '</td>' +
          '<td>' + esc(val(p.revenue)) + '</td>' +
          '<td class="' + (g == null ? '' : g >= 0 ? 'up' : 'down') + '">' +
            (g == null ? '—' : (g >= 0 ? '+' : '') + g.toFixed(1) + '%') + '</td>' +
          '<td>' + esc(val(p.netIncome)) + '</td>' +
          '<td>' + (p.margin == null ? '—' : p.margin.toFixed(1) + '%') + '</td>' +
          '<td>' + esc(val(p.eps)) + '</td>' +
          '<td>' + esc(val(p.fcf)) + '</td>' +
          '<td>' + esc(val(p.equity)) + '</td>' +
          '<td>' + esc(roeText(p)) + '</td></tr>';
      }).join('') +
    '</tbody></table></div>';
  paintFinCharts(list.slice().reverse(), f);
  paintFinAiOut();
}

function paintFinCharts(periods, f) {
  if (typeof ApexCharts === 'undefined' || !periods.length) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const theme = { mode: isDark ? 'dark' : 'light' };
  const grid = { borderColor: isDark ? '#334155' : '#f1f3f5', strokeDashArray: 4 };
  const labels = periods.map(p => periodLabel(p, f));
  const cur = (periods[0].revenue && periods[0].revenue.currency) || '';
  const barNode = document.getElementById('finBar');
  if (barNode) {
    const bar = new ApexCharts(barNode, {
      series: [{ name: f.rev, data: periods.map(p => (p.revenue ? p.revenue.raw : null)) },
               { name: f.netIncome, data: periods.map(p => (p.netIncome ? p.netIncome.raw : null)) }],
      chart: { type: 'bar', height: 216, toolbar: { show: false }, fontFamily: 'Inter', background: 'transparent' },
      theme: theme, colors: ['#2563eb', '#0f9d58'],
      plotOptions: { bar: { columnWidth: '46%', borderRadius: 2 } },
      dataLabels: { enabled: false }, grid: grid,
      xaxis: { categories: labels, labels: { style: { fontSize: '10px' } } },
      yaxis: { labels: { formatter: v => compactNum(v, '') } },
      legend: { show: true, position: 'top', horizontalAlign: 'left', fontSize: '10.5px', markers: { size: 4 } },
      tooltip: { y: { formatter: v => compactNum(v, cur) } }
    });
    bar.render(); finCharts.push(bar);
  }
  const lineNode = document.getElementById('finLine');
  if (lineNode) {
    const line = new ApexCharts(lineNode, {
      series: [{ name: f.netMargin, data: periods.map(p => (p.margin == null ? null : Number(p.margin.toFixed(2)))) }],
      chart: { type: 'area', height: 216, toolbar: { show: false }, fontFamily: 'Inter', background: 'transparent' },
      theme: theme, colors: ['#d10a11'],
      stroke: { curve: 'smooth', width: 2.5 },
      fill: { type: 'gradient', gradient: { opacityFrom: 0.24, opacityTo: 0.02 } },
      dataLabels: { enabled: false }, markers: { size: 3 }, grid: grid,
      xaxis: { categories: labels, labels: { style: { fontSize: '10px' } } },
      yaxis: { labels: { formatter: v => (v == null ? '' : v.toFixed(0) + '%') } },
      tooltip: { y: { formatter: v => (v == null ? '—' : v.toFixed(1) + '%') } }
    });
    line.render(); finCharts.push(line);
  }
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
/* Return on equity as the panel and the AI both read it: annual figures as
   reported, a quarter put on a yearly footing so the two are comparable. */
function fundRoe(period) {
  if (!period || !period.netIncome || !period.equity) return null;
  if (!isFinite(period.netIncome.raw) || !isFinite(period.equity.raw) || !period.equity.raw) return null;
  return (period.netIncome.raw / period.equity.raw) * (period.kind === 'Q' ? 4 : 1) * 100;
}

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
    if (period.fcf) lines.push(tag + t.fcf + ': ' + compactNum(period.fcf.raw, period.fcf.currency));
    if (period.equity) lines.push(tag + t.equity + ': ' + compactNum(period.equity.raw, period.equity.currency));
    const roe = fundRoe(period);
    if (roe !== null) lines.push(tag + t.roe + ': ' + roe.toFixed(1) + '%' + (period.kind === 'Q' ? ' (' + t.annualised + ')' : ''));
  });
  if (fund.converted) lines.push(t.converted(Math.round(fund.converted.rate).toLocaleString('en-US')));
  return lines;
}

/* One look for an AI answer, wherever it is rendered: inside the financial
   report, or under an expanded holding. */
function fundAiHtml(text, err, head) {
  const t = I18N[state.lang].fundAi;
  return '<div class="fin-ai-panel' + (err ? ' err' : '') + '">' +
    (head === false ? '' : '<div class="fin-ai-head">✨ ' + esc(t.title) + '</div>') +
    '<div class="fin-ai-text">' + esc(text) + '</div>' +
    (err ? '' : '<div class="fin-ai-note">' + esc(t.note) + '</div>') +
    '</div>';
}

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

const DIV_CACHE_KEY = 'fw.dividends.v2';
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
    /* Individual payments, so the portfolio can date a dividend to the day it
       was paid rather than reporting a trailing twelve-month total. */
    events: list.filter(function (d) { return d.ts >= Date.now() - 2 * 365 * 864e5; })
      .map(function (d) { return { ts: d.ts, amount: d.amount }; }),
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

/* Market snapshot: the two cards that sit under the instrument strip. The
   editorial look stays (paper, ink, serif numbers) but the shape follows a
   modern finance dashboard: one big quote, its 52-week position, then a compact
   leaders list instead of a wall of equal tiles. */
function marketHeroHTML(allData, idxData, usData) {
  const t = I18N[state.lang].mkt;
  const locale = state.lang === 'id' ? 'id-ID' : 'en-US';
  const fmt = function (v, digits) {
    return isFinite(v) ? v.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: 0 }) : '—';
  };
  const ihsg = allData['^JKSE'] || {};
  const up = (ihsg.pct || 0) >= 0;
  const lo = ihsg.week52Low, hi = ihsg.week52High;
  const hasRange = isFinite(lo) && isFinite(hi) && hi > lo && isFinite(ihsg.price);
  const pos = hasRange ? Math.max(0, Math.min(100, ((ihsg.price - lo) / (hi - lo)) * 100)) : null;

  const idx = breadthCounts(idxData);
  const us = breadthCounts(usData);
  const best = idxData.slice().sort(function (a, b) { return b.pct - a.pct; })[0];
  const worst = idxData.slice().sort(function (a, b) { return a.pct - b.pct; })[0];

  const leaderRow = function (label, symbol, pct) {
    const good = pct >= 0;
    return '<div class="ms-row ' + (good ? 'is-up' : 'is-down') + '">' +
      '<span class="ms-row-l"><strong>' + esc(symbol) + '</strong><em>' + esc(label) + '</em></span>' +
      '<span class="ms-row-v ' + (good ? 'up' : 'down') + '">' + (good ? '+' : '') + pct.toFixed(2) + '%</span>' +
      '</div>';
  };

  const stat = function (label, value) {
    return '<div class="ms-stat"><span>' + esc(label) + '</span><strong>' + value + '</strong></div>';
  };

  return '<div class="ms-duo">' +
    '<section class="modern-card ms-hero">' +
      '<div class="card-title"><span>' + esc(t.snapshot) + '</span>' +
      '<span class="div-sub">' + esc(t.ihsgSub) + '</span></div>' +
      '<div class="ms-hero-main">' +
      '<div class="ms-hero-top">' +
        '<div class="ms-hero-val">' + fmt(ihsg.price, 2) + '</div>' +
        '<span class="ms-chip ' + (up ? 'up' : 'down') + '">' + (up ? '▲ ' : '▼ ') + Math.abs(ihsg.pct || 0).toFixed(2) + '%</span>' +
      '</div>' +
      '<div class="ms-hero-lab">IHSG · ' + esc(t.today) + '</div>' +
      (pos === null ? '' :
        '<div class="ms-range"><span class="ms-range-bar">' +
        '<b style="width:' + pos.toFixed(1) + '%"></b>' +
        '<i style="left:' + pos.toFixed(1) + '%"></i></span>' +
        '<div class="ms-range-cap"><span>' + fmt(lo, 0) + '</span><span>' + esc(t.wkRange) + '</span><span>' + fmt(hi, 0) + '</span></div></div>') +
      '<div id="heroSpark" class="ms-hero-spark"></div>' +
      '</div>' +
      '<div class="ms-stats">' +
        stat(t.dayHigh, fmt(ihsg.dayHigh, 0)) +
        stat(t.dayLow, fmt(ihsg.dayLow, 0)) +
        stat(t.prevClose, fmt(ihsg.prevClose, 0)) +
        (isFinite(ihsg.volume)
          ? stat(t.volume, compactNum(ihsg.volume))
          : stat(t.dayRange, (isFinite(ihsg.dayHigh) && isFinite(ihsg.dayLow)) ? fmt(ihsg.dayHigh - ihsg.dayLow, 0) + ' pts' : '—')) +
      '</div>' +
    '</section>' +
    '<section class="modern-card ms-watch">' +
      '<div class="card-title"><span>' + esc(t.leaders) + '</span>' +
      '<span class="div-sub">' + esc(t.breadth) + '</span></div>' +
      '<div class="ms-breadth">' +
        '<div class="ms-b-head"><span>IDX</span><b>' + idx.up + ' / ' + idx.down + '</b></div>' +
        breadthBarHTML(idx) +
        '<div class="ms-b-head" style="margin-top:10px;"><span>US</span><b>' + us.up + ' / ' + us.down + '</b></div>' +
        breadthBarHTML(us) +
      '</div>' +
      '<div class="ms-rows">' +
        (best ? leaderRow(t.topGainer, best.symbol.replace('.JK', ''), best.pct) : '') +
        (worst ? leaderRow(t.topLoser, worst.symbol.replace('.JK', ''), worst.pct) : '') +
        '<div class="ms-row is-yield" id="msTopYield"><span class="ms-row-l"><strong>…</strong><em>' + esc(t.topYield) + '</em></span>' +
        '<span class="ms-row-v muted">' + esc(t.divLoading) + '</span></div>' +
      '</div>' +
    '</section></div>';
}

/* Filled once the dividend scan finishes, so the leaders card stays useful
   before the 37-name sweep completes. */
function updateTopYield(rows) {
  const el = document.getElementById('msTopYield');
  if (!el) return;
  const t = I18N[state.lang].mkt;
  const top = rows && rows[0];
  el.className = 'ms-row' + (top ? ' is-yield' : '');
  el.innerHTML = '<span class="ms-row-l"><strong>' + (top ? esc(top.symbol.replace('.JK', '')) : '—') + '</strong>' +
    '<em>' + esc(t.topYield) + '</em></span>' +
    '<span class="ms-row-v ' + (top ? 'up' : 'muted') + '">' + (top ? top.yieldPct.toFixed(2) + '%' : '—') + '</span>';
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
  const dash = $('#stockDashboard'); const t = I18N[state.lang]; const m = t.market;
  dash.dataset.loaded = '1';
  destroyCharts();

  dash.innerHTML = `
    <div class="loading-container">
      <div class="loading-text">${esc(t.stockLoading)}</div>
      <div class="progress-bar-track">
        <div class="progress-bar-fill" id="marketProgressFill"></div>
      </div>
      <div class="progress-text" id="marketProgressText">0%</div>
    </div>
  `;

  const allSymbols = [...new Set([...INDICES.map(x=>x.symbol), '^GSPC', ...MACRO.map(x=>x.symbol), ...ECON_INDICATORS.map(x=>x.symbol), ...IDX_POOL.map(x=>x.symbol), ...US_POOL.map(x=>x.symbol), ...ETFS.map(x=>x.symbol)])];
  const allData = {};
  let failedCount = 0;

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

    processedCount++;
    if (progressFill) progressFill.style.width = `${(processedCount / totalCount) * 100}%`;
    if (progressText) progressText.textContent = `${Math.round((processedCount / totalCount) * 100)}%`;

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

  const sumSymbols = [...INDICES.map(x => ({...x, type: 'index'})), { symbol: '^GSPC', name: 'S&P 500', type: 'index' }, ...MACRO.map(x => ({...x, type: 'macro'}))];
  const summaryData = await Promise.all(sumSymbols.map(async x => {
    const hist = await fetchHistory(x.symbol, '1mo');
    return { ...x, data: allData[x.symbol], spark: hist };
  }));
  const bySymbol = {};
  summaryData.forEach(d => { if (d.data) bySymbol[d.symbol] = d; });

  const mainChartData = await fetchHistory('^JKSE', '6mo');
  const sp500ChartData = await fetchHistory('^GSPC', '6mo');

  const buildCards = (list) => list.map(stockCardHtml).join('');

  /* Pinned tickers are not in any pool, so their quote and sparkline are
     fetched here and hung on the same map the strip already reads. */
  await Promise.all(mktHeroSymbols().map(async function (symbol) {
    if (bySymbol[symbol]) return;
    const [q, hist] = await Promise.all([fetchStockDetails(symbol), fetchHistory(symbol, '1mo')]);
    if (!q || !isFinite(q.price)) return;
    bySymbol[symbol] = { symbol: symbol, name: q.name || symbol, type: 'custom', data: q, spark: hist };
  }));

  /* The four numbers read first: home market, the US benchmark, the rupiah,
     gold. Everything else lives in the watch list beside them. */
  const HERO_TILES = [
    { symbol: '^JKSE', name: 'IHSG', spark: mainChartData },
    { symbol: '^GSPC', name: 'S&P 500', spark: sp500ChartData },
    { symbol: 'IDR=X', name: 'USD/IDR', spark: (bySymbol['IDR=X'] || {}).spark },
    { symbol: 'GC=F', name: 'Gold', spark: (bySymbol['GC=F'] || {}).spark }
  ].concat(mktHeroSymbols().map(function (symbol) {
    const row = bySymbol[symbol];
    return { symbol: symbol, name: (row && row.name) || symbol, label: symbol.replace(/\.JK$/i, ''), spark: (row || {}).spark, custom: true };
  })).filter(function (hero) { return !!(bySymbol[hero.symbol] || {}).data; });

  const heroTile = function (hero) {
    const q = (bySymbol[hero.symbol] || {}).data;
    if (!q) return '';
    const up = q.pct >= 0;
    const sparkId = 'sparkHero' + hero.symbol.replace(/[^A-Za-z0-9]/g, '');
    return `<div class="mkt-tile${hero.custom ? ' mkt-tile-custom' : ''}" data-hero="${esc(hero.symbol)}"${hero.custom ? ` title="${esc(hero.name)}"` : ''}>
        <div class="mkt-tile-top">
          <span class="mkt-tile-name">${esc(hero.custom ? hero.label : hero.name)}</span>
          <span class="mkt-chip ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(q.pct).toFixed(2)}%</span>
        </div>
        <div class="mkt-tile-val">${mktFmt(q.price)}</div>
        <div class="mkt-tile-spark" id="${sparkId}"></div>
        ${hero.custom ? `<button type="button" class="mkt-tile-x" data-hero-remove="${esc(hero.symbol)}" aria-label="${esc(m.removeTicker)}" title="${esc(m.removeTicker)}">×</button>` : ''}
      </div>`;
  };
  const tileHtml = HERO_TILES.map(heroTile).join('');

  const watchHtml = ['^IXIC', '^DJI', 'IDR=X', 'GC=F', 'CL=F', 'BTC-USD'].map(symbol => {
    const q = (bySymbol[symbol] || {}).data;
    return q ? mktQuoteRow(q.name, mktFmt(q.price), q.pct) : '';
  }).join('');

  const vix = allData['^VIX']; const tnx = allData['^TNX'];
  const ratesHtml = [
    vix ? mktQuoteRow('VIX', mktFmt(vix.price), vix.pct) : '',
    tnx ? mktQuoteRow('US 10Y', tnx.price.toFixed(3) + '%', tnx.pct) : '',
    mktQuoteRow('BI rate', '6.25%', null, m.staticLabel)
  ].join('');

  const RANGE_LABELS = { '1mo': '1M', '3mo': '3M', '6mo': '6M', '1y': '1Y', '5y': '5Y' };
  const rangeButtons = Object.keys(RANGE_LABELS).map(r =>
    `<button type="button" class="chart-btn${r === '6mo' ? ' active' : ''}" data-range="${r}">${RANGE_LABELS[r]}</button>`
  ).join('');

  const locale = state.lang === 'id' ? 'id-ID' : 'en-US';
  const asOf = new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  dash.innerHTML = `
    <div class="mkt-board">
      <p class="mkt-asof">${esc(t.mkt.asOf)} ${esc(asOf)} · ${esc(t.mkt.delayed)}</p>
      <section class="mkt-tiles" aria-label="${esc(m.gauges)}">${tileHtml}<button type="button" class="mkt-tile mkt-tile-add" id="mktTileAdd"><span class="mkt-tile-add-plus">+</span><span>${esc(m.addTicker)}</span></button></section>

      <section class="mkt-grid">
        <div class="mkt-card">
          <div class="mkt-card-head">
            <div>
              <h2 class="mkt-title">${esc(m.performance)}</h2>
              <p class="mkt-sub">${esc(m.performanceSub)}</p>
            </div>
            <div class="chart-controls" id="benchControls">${rangeButtons}</div>
          </div>
          <div class="mkt-legend" id="benchLegend">${pfBenchChipsHtml()}</div>
          <div id="benchChart"></div>
        </div>

        <div class="mkt-card">
          <div class="mkt-card-head">
            <h2 class="mkt-title">${esc(m.movers)}</h2>
            <div class="mkt-seg" id="moversSeg" role="group">
              <button type="button" class="active" data-set="idx">IDX</button>
              <button type="button" data-set="us">US</button>
            </div>
          </div>
          <div class="mkt-mover-cols" id="moversBody">${mktMoverCols(idxGainers, idxLosers)}</div>
        </div>
      </section>

      <section class="mkt-row3">
        <div class="mkt-card">
          <div class="mkt-card-head">
            <h2 class="mkt-title">${esc(m.mostActive)}</h2>
            <div class="mkt-seg" id="activeSeg" role="group">
              <button type="button" class="active" data-set="idx">IDX</button>
              <button type="button" data-set="us">US</button>
            </div>
          </div>
          <div class="mkt-list" id="activeBody">${mktActiveRows(idxMostActive)}</div>
        </div>

        <div class="mkt-card">
          <div class="mkt-card-head"><h2 class="mkt-title">${esc(m.watch)}</h2></div>
          <div class="mkt-list">${watchHtml}</div>
        </div>

        <div class="mkt-card">
          <div class="mkt-card-head"><h2 class="mkt-title">${esc(m.rates)}</h2></div>
          <div class="mkt-list">${ratesHtml}</div>
        </div>
      </section>

      <section class="mkt-card">
        <div class="mkt-card-head">
          <div>
            <h2 class="mkt-title">${esc(m.coverage)}</h2>
            <p class="mkt-sub">${esc(m.coverageSub)}</p>
          </div>
        </div>
        <div class="mkt-tabs" id="coverageTabs" role="tablist">
          <button type="button" class="mkt-tab active" data-tab="idx" role="tab" aria-selected="true">${esc(m.bluechips)}</button>
          <button type="button" class="mkt-tab" data-tab="us" role="tab" aria-selected="false">${esc(m.usTech)}</button>
          <button type="button" class="mkt-tab" data-tab="etfs" role="tab" aria-selected="false">${esc(m.etfs)}</button>
        </div>
        <div class="mkt-panel" data-panel="idx"><div class="stock-card-grid">${buildCards(idxData)}</div></div>
        <div class="mkt-panel" data-panel="us" hidden><div class="stock-card-grid">${buildCards(usData)}</div></div>
        <div class="mkt-panel" data-panel="etfs" hidden><div class="stock-card-grid">${buildCards(ETFS.map(e => allData[e.symbol]).filter(Boolean))}</div></div>
      </section>

      <div id="dividendPanel"></div>
    </div>`;
  hydrateCardFundamentals(dash);

  const divSlot = document.getElementById('dividendPanel');
  if (divSlot) divSlot.innerHTML = '<div class="modern-card"><div class="card-title">' +
    esc(t.mkt.dividends) + '</div><div class="ef-empty">' + esc(t.mkt.divLoading) + '</div></div>';
  loadDividendLeaders().then(function (rows) {
    renderDividendPanel(rows);
  }).catch(function () { renderDividendPanel([]); });

  /* Switches are wired per card so each one only rebuilds its own block. */
  const bindSeg = function (id, onChange) {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('click', function (e) {
      const btn = e.target.closest('button');
      if (!btn || btn.classList.contains('active')) return;
      $$('button', el).forEach(b => b.classList.toggle('active', b === btn));
      onChange(btn.getAttribute('data-set'));
    });
  };
  bindSeg('moversSeg', function (set) {
    const body = document.getElementById('moversBody'); if (!body) return;
    body.innerHTML = set === 'us' ? mktMoverCols(usGainers, usLosers) : mktMoverCols(idxGainers, idxLosers);
  });
  bindSeg('activeSeg', function (set) {
    const body = document.getElementById('activeBody'); if (!body) return;
    body.innerHTML = mktActiveRows(set === 'us' ? usMostActive : idxMostActive);
  });

  const tabs = document.getElementById('coverageTabs');
  if (tabs) tabs.addEventListener('click', function (e) {
    const btn = e.target.closest('.mkt-tab'); if (!btn) return;
    $$('.mkt-tab', tabs).forEach(b => {
      const on = b === btn;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('.mkt-panel', dash).forEach(p => { p.hidden = p.getAttribute('data-panel') !== btn.getAttribute('data-tab'); });
  });

  if (typeof ApexCharts !== 'undefined') {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const chartTheme = { mode: isDark ? 'dark' : 'light' };

    const paintHeroSpark = function (hero) {
      const q = (bySymbol[hero.symbol] || {}).data;
      const node = document.getElementById('sparkHero' + hero.symbol.replace(/[^A-Za-z0-9]/g, ''));
      const values = (hero.spark || []).map(p => (p && isFinite(p.y)) ? p.y : null).filter(v => v != null);
      if (!q || !node || values.length < 2) return;
      const chart = new ApexCharts(node, {
        series: [{ data: values }],
        chart: { type: 'area', height: 40, sparkline: { enabled: true }, background: 'transparent' },
        theme: chartTheme,
        stroke: { curve: 'smooth', width: 2 },
        colors: [q.pct >= 0 ? '#0a8f4a' : '#d10a11'],
        fill: { type: 'gradient', gradient: { opacityFrom: 0.22, opacityTo: 0 } },
        tooltip: { enabled: false }
      });
      chart.render(); chartInstances.push(chart);
    };
    HERO_TILES.forEach(paintHeroSpark);

    /* One more ticker in the strip, without reloading the whole board: the
       quote and the sparkline are the only things it needs. */
    const tilesSec = dash.querySelector('.mkt-tiles');
    const addTile = document.getElementById('mktTileAdd');
    const addHeroTile = async function (symbol) {
      if (mktHeroSymbols().indexOf(symbol) !== -1) return true;
      const [q, hist] = await Promise.all([fetchStockDetails(symbol), fetchHistory(symbol, '1mo')]);
      if (!q || !isFinite(q.price)) return false;
      bySymbol[symbol] = { symbol: symbol, name: q.name || symbol, type: 'custom', data: q, spark: hist };
      const list = mktHeroSymbols(); list.push(symbol); saveMktHeroes(list);
      const hero = { symbol: symbol, name: q.name || symbol, label: symbol.replace(/\.JK$/i, ''), spark: hist, custom: true };
      const holder = document.createElement('div');
      holder.innerHTML = heroTile(hero);
      const node = holder.firstElementChild;
      if (!node || !addTile) return false;
      addTile.insertAdjacentElement('beforebegin', node);
      paintHeroSpark(hero);
      return true;
    };
    const openHeroInput = function () {
      if (!addTile || addTile.querySelector('input')) return;
      const resting = addTile.innerHTML;
      const restore = function () { addTile.classList.remove('editing'); addTile.innerHTML = resting; };
      addTile.classList.add('editing');
      addTile.innerHTML = '<input class="mkt-tile-input" type="text" autocomplete="off" spellcheck="false" placeholder="' + esc(m.addTickerPh) + '">';
      const input = addTile.querySelector('input');
      input.focus();
      input.addEventListener('keydown', async function (ev) {
        if (ev.key === 'Escape') { restore(); return; }
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        const symbol = input.value.trim().toUpperCase();
        if (!symbol) { restore(); return; }
        input.disabled = true;
        const ok = await addHeroTile(symbol);
        if (ok) { restore(); return; }
        input.disabled = false;
        input.value = '';
        input.placeholder = m.notFound;
        input.focus();
      });
    };
    if (tilesSec) tilesSec.addEventListener('click', function (e) {
      const rm = e.target.closest('[data-hero-remove]');
      if (rm) {
        const symbol = rm.getAttribute('data-hero-remove');
        saveMktHeroes(mktHeroSymbols().filter(function (x) { return x !== symbol; }));
        const tile = rm.closest('.mkt-tile');
        if (tile) tile.remove();
        return;
      }
      if (e.target.closest('#mktTileAdd')) openHeroInput();
    });

    mktBenchCache['^JKSE|6mo'] = mainChartData;
    mktBenchCache['^GSPC|6mo'] = sp500ChartData;
    benchChart = new ApexCharts(document.getElementById('benchChart'), {
      series: [],
      chart: { type: 'line', height: 236, toolbar: { show: false }, fontFamily: 'Inter', zoom: { enabled: false }, background: 'transparent' },
      theme: chartTheme,
      colors: [],
      stroke: { curve: 'smooth', width: 2.2 },
      dataLabels: { enabled: false },
      markers: { size: 0, hover: { size: 4 } },
      grid: { borderColor: isDark ? '#334155' : '#f1f3f5', strokeDashArray: 4 },
      xaxis: { type: 'datetime', labels: { datetimeUTC: false } },
      yaxis: { labels: { formatter: v => (v > 0 ? '+' : '') + v.toFixed(1) + '%' } },
      tooltip: { y: { formatter: v => (v > 0 ? '+' : '') + v.toFixed(2) + '%' } },
      legend: { show: false }
    });
    benchChart.render();
    chartInstances.push(benchChart);
    renderMarketBench('6mo');

    const controls = document.getElementById('benchControls');
    if (controls) controls.addEventListener('click', async function (e) {
      const btn = e.target.closest('.chart-btn');
      if (!btn || btn.classList.contains('active')) return;
      $$('.chart-btn', controls).forEach(b => b.classList.toggle('active', b === btn));
      const range = btn.getAttribute('data-range');
      const label = btn.textContent;
      btn.textContent = '…';
      await renderMarketBench(range);
      btn.textContent = label;
    });
  }
}


/* A quoted stock reads the same wherever it appears: the explore board, a
   search result. The card opens the report rather than leaving the site. */
function stockCardHtml(s) {
  if (!s) return '';
  const isUp = s.pct >= 0;
  const lo = s.week52Low, hi = s.week52High;
  const inRange = isFinite(lo) && isFinite(hi) && hi > lo && isFinite(s.price);
  const rangePos = inRange ? Math.max(0, Math.min(100, ((s.price - lo) / (hi - lo)) * 100)) : null;
  const rangeHtml = rangePos === null ? '' :
    '<div class="sc-range"><span class="sc-range-bar"><i style="left:' + rangePos.toFixed(1) + '%"></i></span>' +
    '<span class="sc-range-cap">52W ' + lo.toLocaleString('en-US', { maximumFractionDigits: 0 }) + '–' +
    hi.toLocaleString('en-US', { maximumFractionDigits: 0 }) + '</span></div>';
  return `<div class="stock-card">
    <button type="button" class="sc-body" data-fin-open="${esc(s.symbol)}" data-fin-name="${esc(s.name)}">
      <div class="sc-header">
        <div>
          <div class="sc-sym">${esc(s.symbol.replace('.JK', ''))}</div>
          <div class="sc-name">${esc(s.name)}</div>
        </div>
        <div class="sc-chg ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${s.pct.toFixed(2)}%</div>
      </div>
      <div class="sc-price">${s.price.toLocaleString('en-US')}</div>
      ${rangeHtml}
    </button>
    <div class="sc-foot"><div class="sc-fund" data-fund="${esc(s.symbol)}"></div></div>
  </div>`;
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
      <div class="stock-card-grid">${valid.map(stockCardHtml).join('')}</div>
    </div>`;
    hydrateCardFundamentals(dash);
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
  if (!pfDetail[symbol]) pfDetail[symbol] = { fund: '', why: '', ai: '' };
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
          <div class="pf-why-out" data-pf-ai-out="${esc(symbol)}"${d.ai ? '' : ' hidden'}>${d.ai}</div>
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

/* Everything converts through USD: USD/IDR comes from the quote feed the
   portfolio already loads, and any other currency asks for its own pair the
   first time it is needed (JPY for the Nikkei, say). */
const pfFxExtra = Object.create(null);
const pfFxPending = Object.create(null);

function pfUnitsPerUsd(cur) {
  if (!cur || cur === 'USD') return 1;
  if (cur === 'IDR') return pfRate();
  const v = pfFxExtra[cur];
  return (isFinite(v) && v > 0) ? v : null;
}

async function pfEnsureFx(cur) {
  if (!cur || cur === 'USD' || pfUnitsPerUsd(cur)) return pfUnitsPerUsd(cur);
  if (pfFxPending[cur]) return null;
  pfFxPending[cur] = true;
  try {
    const q = await fetchStockDetails(cur + '=X');
    if (q && isFinite(q.price) && q.price > 0) pfFxExtra[cur] = q.price;
  } catch (e) {}
  pfFxPending[cur] = false;
  return pfUnitsPerUsd(cur);
}

function pfConvert(amount, from, to) {
  if (amount == null || !isFinite(amount)) return null;
  if (!from || !to || from === to) return amount;
  const a = pfUnitsPerUsd(from), b = pfUnitsPerUsd(to);
  if (!a || !b) return null;
  return (amount / a) * b;
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

/* ============================================================
   PORTFOLIO DASHBOARD
   A holding table answers "what do I own and what is it worth".
   The questions an owner asks next — how is the whole thing
   performing against the index, what is it made of, which names
   are carrying it, and what did I actually do — belong on the
   same card, above the table.
   ============================================================ */

const PF_ACT = 'finwire.portfolio.activity.v1';
const PF_ETF_SET = new Set(ETFS.map(function (e) { return e.symbol; }));
const PF_CLASSES = ['idx', 'us', 'etf', 'crypto'];
let pfFilter = 'all';

/* Holdings are read into broad classes from the ticker alone: the Jakarta
   suffix is IDX, a known fund symbol is an ETF, -USD is crypto, the rest is
   a US listing. Enough to answer "what am I actually exposed to". */
function pfClassOf(symbol) {
  const s = String(symbol || '').toUpperCase();
  if (/-USD$/.test(s)) return 'crypto';
  if (PF_ETF_SET.has(s)) return 'etf';
  if (/\.JK$/.test(s)) return 'idx';
  return 'us';
}

function pfClassLabel(cls) {
  const p = (I18N[state.lang] || I18N.en).portfolio;
  return { idx: p.classIdx, us: p.classUs, etf: p.classEtf, crypto: p.classCrypto }[cls] || cls;
}

function pfActivityList() {
  const list = loadJSON(PF_ACT, []);
  return Array.isArray(list) ? list : [];
}

/* Only holdings the reader typed are knowable here, so "activity" is the
   log of what they added and removed, kept in this browser. */
function pfLogActivity(entry) {
  const list = pfActivityList();
  list.unshift(Object.assign({ ts: Date.now() }, entry));
  saveJSON(PF_ACT, list.slice(0, 60));
}

/* One book, one currency. A split or a chart that silently drops the IDX
   positions because they quote in rupiah only tells half the story, so every
   holding is converted at today's rate and the panel says which currency it
   speaks. */
function pfValueIn(view, target) {
  if (view.value == null) return null;
  if (view.target === target) return view.value;
  return pfConvert(view.value, view.target, target);
}

let pfActTarget = 'USD';
const pfDivTried = new Set();

/* Dividends arrive without the reader doing anything, so they are the other
   kind of event this card can honestly show. The dividend scan already pulls
   each symbol's payment history for the leaders table, so the same call and
   cache are reused here instead of a second source. */
function pfHoldingDividends(months) {
  const since = Date.now() - months * 30.5 * 864e5;
  const out = [];
  portfolio.forEach(function (h) {
    const row = divCache.rows[h.symbol];
    if (!row || !row.events) return;
    row.events.forEach(function (ev) {
      if (!ev.ts || ev.ts < since || !isFinite(ev.amount)) return;
      out.push({ ts: ev.ts, symbol: h.symbol, perShare: ev.amount, shares: h.shares, currency: pfCurrency(h.symbol) });
    });
  });
  return out;
}

function paintPfActivity() {
  const slot = document.getElementById('pfActSlot');
  if (slot) slot.innerHTML = pfActivityHtml(pfActTarget);
}

/* One fetch per holding, guarded so a symbol that pays nothing is not asked
   for again on every repaint. */
function pfEnsureHoldingDividends() {
  portfolio.forEach(function (h) {
    if (divCache.rows[h.symbol] || pfDivTried.has(h.symbol)) return;
    pfDivTried.add(h.symbol);
    fetchDividendInfo(h.symbol).then(paintPfActivity).catch(function () {});
  });
}

function pfActivityHtml(target) {
  const p = (I18N[state.lang] || I18N.en).portfolio;
  const locale = state.lang === 'id' ? 'id-ID' : 'en-US';
  const when = function (ts) { return new Date(ts).toLocaleDateString(locale, { day: '2-digit', month: 'short' }); };
  const divs = pfHoldingDividends(14).map(function (d) {
    const money = pfConvert(d.perShare * d.shares, d.currency, target);
    const shares = d.shares.toLocaleString('en-US', { maximumFractionDigits: 4 });
    return { ts: d.ts, html: `<div class="pact-row">
        <span class="pact-date">${esc(when(d.ts))}</span>
        <span class="pact-main"><strong class="div">${esc(p.actDividend)}</strong> ${esc(d.symbol.replace('.JK', ''))}<em>${esc(shares)} × ${pfPrice(d.perShare, d.currency)} = ${money == null ? '—' : pfMoney(money, target)}</em></span>
      </div>` };
  });
  const events = pfActivityList().map(function (e) {
    const price = (e.price != null && isFinite(e.price)) ? ' @ ' + pfMoney(e.price, e.currency || 'USD') : '';
    const qty = (e.shares != null && isFinite(e.shares)) ? e.shares.toLocaleString('en-US', { maximumFractionDigits: 4 }) : '';
    const isOut = e.action === 'remove';
    return { ts: e.ts, html: `<div class="pact-row">
        <span class="pact-date">${esc(when(e.ts))}</span>
        <span class="pact-main"><strong class="${isOut ? 'down' : 'up'}">${esc(isOut ? p.actRemove : p.actAdd)}</strong> ${esc(e.symbol || '')}<em>${esc(qty)}${esc(price)}</em></span>
      </div>` };
  }).concat(divs).sort(function (a, b) { return b.ts - a.ts; }).slice(0, 6);
  if (!events.length) return `<div class="pf-empty-sm">${esc(p.activityEmpty)}</div>`;
  return `<div class="pact-list">${events.map(function (x) { return x.html; }).join('')}</div>`;
}

/* Weight by class: one stacked bar plus a legend that also carries the money,
   so the bar answers "how much is in ETFs" without a second table. */
function pfAllocationHtml(views, target) {
  const p = (I18N[state.lang] || I18N.en).portfolio;
  const rows = views.map(function (r) {
    return { symbol: r.h.symbol, value: pfValueIn(r.v, target) };
  }).filter(function (r) { return r.value != null && r.value > 0; });
  const groups = PF_CLASSES.map(function (cls) {
    const subset = rows.filter(function (r) { return pfClassOf(r.symbol) === cls; });
    const value = subset.reduce(function (a, r) { return a + r.value; }, 0);
    return { cls: cls, value: value, count: subset.length };
  }).filter(function (g) { return g.value > 0; });
  if (!groups.length) return `<div class="pf-empty-sm">${esc(p.trendEmpty)}</div>`;
  const total = groups.reduce(function (a, g) { return a + g.value; }, 0);
  /* A ring rather than a bar: it fills the column beside the chart the way the
     reference does, and the slices are the same four classes as the legend. */
  const ringColors = { idx: '#111418', us: '#2563eb', etf: '#7c3aed', crypto: '#d97706' };
  if (document.documentElement.getAttribute('data-theme') === 'dark') ringColors.idx = '#f8fafc';
  let acc = 0;
  const ring = groups.map(function (g) {
    const from = acc, to = acc + (g.value / total) * 100;
    acc = to;
    return `${ringColors[g.cls]} ${from.toFixed(2)}% ${to.toFixed(2)}%`;
  }).join(', ');
  const legend = groups.map(function (g) {
    return `<div class="pa-row">
        <span class="pa-key"><i class="pa-dot pa-${g.cls}"></i>${esc(pfClassLabel(g.cls))}<em>${g.count}</em></span>
        <span class="pa-weight">${((g.value / total) * 100).toFixed(1)}%</span>
        <span class="pa-val">${pfMoney(g.value, target)}</span>
      </div>`;
  }).join('');
  const count = rows.length;
  return `<div class="pa-body">
      <div class="pa-ring-wrap" style="--ring: conic-gradient(${ring})">
        <span class="pa-ring"></span>
        <span class="pa-ring-hole"><b>${count}</b><em>${esc(p.holdingsTitle)}</em></span>
      </div>
      <div class="pa-legend">${legend}</div>
    </div>`;
}

/* Which holdings are carrying the portfolio and which are dragging it. */
function pfMoveHtml(views, target) {
  const p = (I18N[state.lang] || I18N.en).portfolio;
  const list = views.map(function (r) {
    const pl = r.v.pl == null ? null : (r.v.target === target ? r.v.pl : pfConvert(r.v.pl, r.v.target, target));
    return pl == null ? null : { h: r.h, pl: pl, plPct: r.v.plPct };
  }).filter(Boolean);
  if (!list.length) return `<div class="pf-empty-sm">${esc(p.trendEmpty)}</div>`;
  const peak = list.reduce(function (a, r) { return Math.max(a, Math.abs(r.pl)); }, 0) || 1;
  const rowHtml = function (r) {
    const up = r.pl >= 0;
    return `<div class="pmm-row">
        <span class="pmm-sym">${esc(r.h.symbol.replace('.JK', ''))}</span>
        <span class="pmm-bar"><i class="${up ? 'up' : 'down'}" style="width:${Math.max(6, (Math.abs(r.pl) / peak) * 100).toFixed(0)}%"></i></span>
        <span class="pmm-val ${up ? 'up' : 'down'}">${pfSignedMoney(r.pl, target)}<em>${pfPctText(r.plPct)}</em></span>
      </div>`;
  };
  const up = list.filter(function (r) { return r.pl > 0; }).sort(function (a, b) { return b.pl - a.pl; }).slice(0, 3);
  const down = list.filter(function (r) { return r.pl < 0; }).sort(function (a, b) { return a.pl - b.pl; }).slice(0, 3);
  const col = function (label, arr, cls) {
    if (!arr.length) return '';
    return `<div class="pmm-col"><div class="mkt-col-label ${cls}">${esc(label)}</div>${arr.map(rowHtml).join('')}</div>`;
  };
  const cols = col(p.gaining, up, 'up') + col(p.losing, down, 'down');
  return `<div class="pmm-cols">${cols || `<div class="pf-empty-sm">${esc(p.trendEmpty)}</div>`}</div>`;
}

/* ---- performance trend -------------------------------------
   The portfolio has no stored history, so the line is rebuilt from
   each holding's own closes at today's share count (and today's FX).
   Both lines are indexed to 100 at the start of the range, which is
   the only way a rupiah portfolio and an index compare fairly. ---- */

const pfTrendState = { range: '6mo', key: '', data: null };
let pfFxBusy = false;
let pfTrendChart = null;

function pfDayKey(x) { return new Date(x).toISOString().slice(0, 10); }

function pfLastPct(series) {
  const pts = (series || []).filter(function (p) { return p && isFinite(p.y); });
  if (pts.length < 2) return null;
  return pts[pts.length - 1].y - 100;
}

/* Benchmarks the portfolio can be measured against. Indices only, all quoted
   in their own currency, all rebased to 100 at the start of the range so a
   rupiah book and a dollar index share one axis. */
const PF_BENCH = [
  { id: 'ihsg', symbol: '^JKSE', label: 'IHSG', color: '#d10a11', currency: 'IDR' },
  { id: 'spx', symbol: '^GSPC', label: 'S&P 500', color: '#2563eb', currency: 'USD' },
  { id: 'ixic', symbol: '^IXIC', label: 'Nasdaq', color: '#7c3aed', currency: 'USD' },
  { id: 'n225', symbol: '^N225', label: 'Nikkei 225', color: '#0f766e', currency: 'JPY' }
];
const PF_BENCH_KEY = 'finwire.portfolio.bench.v1';
let pfBenchSel = loadJSON(PF_BENCH_KEY, null);
if (!Array.isArray(pfBenchSel)) pfBenchSel = ['ihsg'];
pfBenchSel = pfBenchSel.filter(function (id) {
  return PF_BENCH.some(function (b) { return b.id === id; });
});
if (!pfBenchSel.length) pfBenchSel = ['ihsg'];

async function pfLoadTrend(range, target) {
  const key = [range, target, pfRate() || 0, pfBenchSel.join('+'), portfolio.map(function (h) { return h.symbol + ':' + h.shares; }).join(',')].join('|');
  if (pfTrendState.key === key && pfTrendState.data) return pfTrendState.data;
  const holdings = portfolio.slice();
  if (!holdings.length) return null;

  const selected = PF_BENCH.filter(function (b) { return pfBenchSel.indexOf(b.id) !== -1; });
  const histories = await Promise.all(holdings.map(function (h) {
    return fetchHistory(h.symbol, range).catch(function () { return []; });
  }));
  const benchLists = await Promise.all(selected.map(function (b) {
    return fetchHistory(b.symbol, range).catch(function () { return []; });
  }));
  /* An index quoted in rupiah and a book valued in dollars are not the same
     unit, so each line is converted first — at that day's rate where one is
     available, otherwise at today's — and only then rebased to 100. */
  const fxLists = await Promise.all(selected.map(function (b) {
    if (b.currency === target || b.currency === 'USD') return Promise.resolve([]);
    return fetchHistory(b.currency + '=X', range).catch(function () { return []; });
  }));
  await Promise.all(selected.map(function (b) { return pfEnsureFx(b.currency); }));
  const targetUnits = pfUnitsPerUsd(target);

  const calendar = [];
  const seen = Object.create(null);
  const addCal = function (list) {
    (list || []).forEach(function (p) {
      if (!p || !isFinite(p.y)) return;
      const k = pfDayKey(p.x);
      if (seen[k]) return;
      seen[k] = 1; calendar.push({ k: k, x: p.x });
    });
  };
  benchLists.forEach(addCal);
  histories.forEach(addCal);
  calendar.sort(function (a, b) { return a.x - b.x; });
  if (calendar.length < 2) return null;

  const byDay = histories.map(function (list) {
    const map = Object.create(null);
    (list || []).forEach(function (p) { if (p && isFinite(p.y)) map[pfDayKey(p.x)] = p.y; });
    return map;
  });
  const last = holdings.map(function () { return null; });

  const total = calendar.map(function (day) {
    let sum = 0, priced = 0;
    holdings.forEach(function (h, i) {
      const px = byDay[i][day.k];
      if (px != null) last[i] = px;
      if (last[i] == null) return;
      const value = pfConvert(last[i] * h.shares, pfCurrency(h.symbol), target);
      if (value != null) { sum += value; priced++; }
    });
    return { x: day.x, y: priced ? sum : null };
  });

  const firstValue = total.filter(function (p) { return p.y != null && p.y > 0; })[0];
  if (!firstValue) return null;
  const portIdx = total.map(function (p) { return { x: p.x, y: p.y == null ? null : (p.y / firstValue.y) * 100 }; });

  const benches = selected.map(function (b, i) {
    const list = benchLists[i] || [];
    const fxMap = Object.create(null);
    (fxLists[i] || []).forEach(function (p) {
      if (p && isFinite(p.y) && p.y > 0) fxMap[pfDayKey(p.x)] = p.y;
    });
    const fallback = pfUnitsPerUsd(b.currency);
    let lastFx = null;
    const converted = list.map(function (p) {
      if (!p || !isFinite(p.y) || p.y <= 0) return { x: p && p.x, y: null };
      const day = pfDayKey(p.x);
      if (fxMap[day] != null) lastFx = fxMap[day];
      const units = (b.currency === 'USD') ? 1 : (lastFx || fallback);
      if (!units || !targetUnits) return { x: p.x, y: null };
      return { x: p.x, y: (p.y / units) * targetUnits };
    });
    const first = converted.filter(function (p) { return p.y != null && p.y > 0; })[0];
    const idx = first ? converted.map(function (p) {
      return { x: p.x, y: (p.y == null) ? null : (p.y / first.y) * 100 };
    }) : [];
    return { id: b.id, label: b.label, color: b.color, idx: idx, pct: pfLastPct(idx) };
  }).filter(function (b) { return b.idx.length > 1; });

  const data = { portIdx: portIdx, portPct: pfLastPct(portIdx), benches: benches };
  pfTrendState.key = key;
  pfTrendState.data = data;
  return data;
}

function pfRenderTrend(target) {
  const host = document.getElementById('pfTrendChart');
  if (!host) return;
  const p = (I18N[state.lang] || I18N.en).portfolio;
  pfLoadTrend(pfTrendState.range, target).then(function (data) {
    const node = document.getElementById('pfTrendChart');
    if (!node) return;
    const paint = function (el, value) {
      if (!el) return;
      if (value == null || !isFinite(value)) { el.textContent = '—'; el.className = ''; return; }
      el.textContent = (value > 0 ? '+' : '') + value.toFixed(2) + '%';
      el.className = value >= 0 ? 'up' : 'down';
    };
    paint(document.getElementById('pfTrendPort'), data ? data.portPct : null);
    PF_BENCH.forEach(function (b) {
      const chip = document.querySelector('#pfTrendLegend [data-pf-bench="' + b.id + '"]');
      if (!chip) return;
      const hit = data && data.benches.filter(function (x) { return x.id === b.id; })[0];
      paint(chip.querySelector('b'), hit ? hit.pct : null);
    });
    if (!data) {
      node.innerHTML = `<div class="pf-empty-sm">${esc(p.trendEmpty)}</div>`;
      return;
    }
    if (typeof ApexCharts === 'undefined') return;
    if (pfTrendChart) { try { pfTrendChart.destroy(); } catch (e) {} pfTrendChart = null; }
    node.innerHTML = '';
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const series = [{ name: p.portfolio, data: data.portIdx }].concat(data.benches.map(function (b) {
      return { name: b.label, data: b.idx };
    }));
    pfTrendChart = new ApexCharts(node, {
      series: series,
      chart: { type: 'line', height: 196, toolbar: { show: false }, fontFamily: 'Inter', zoom: { enabled: false }, background: 'transparent' },
      theme: { mode: isDark ? 'dark' : 'light' },
      colors: [isDark ? '#f8fafc' : '#111418'].concat(data.benches.map(function (b) { return b.color; })),
      stroke: {
        curve: 'smooth',
        width: [2.5].concat(data.benches.map(function () { return 1.4; })),
        dashArray: [0].concat(data.benches.map(function () { return 4; }))
      },
      dataLabels: { enabled: false },
      markers: { size: 0, hover: { size: 4 } },
      grid: { borderColor: isDark ? '#334155' : '#f1f3f5', strokeDashArray: 4 },
      xaxis: { type: 'datetime', labels: { datetimeUTC: false } },
      yaxis: { labels: { formatter: function (v) { return v.toFixed(0); } } },
      tooltip: { y: { formatter: function (v) { return v == null ? '—' : v.toFixed(1); } } },
      legend: { show: false }
    });
    pfTrendChart.render();
  }).catch(function () {
    const node = document.getElementById('pfTrendChart');
    if (node) node.innerHTML = `<div class="pf-empty-sm">${esc(p.trendEmpty)}</div>`;
  });
}

function renderPortfolio() {
  const host = $('#portfolioPanel'); if (!host) return;
  const p = (I18N[state.lang] || I18N.en).portfolio;

  if (host.dataset.lang !== state.lang) { host.dataset.lang = state.lang; host.dataset.ready = ''; }

  if (host.dataset.ready !== '1') {
    host.innerHTML = `
      <div class="pf-board">
        <section class="mkt-card pf-intro">
          <div class="mkt-card-head">
            <div>
              <h2 class="mkt-title">${esc(p.title)}</h2>
              <p class="mkt-sub">${esc(p.subtitle)}</p>
            </div>
            <div class="pf-toolbar">
              <span class="pf-toolbar-label">${esc(p.curLabel)}</span>
              <div class="pf-cur-switch" id="pfCurSwitch" role="group" aria-label="${esc(p.curLabel)}">
                <button type="button" data-pf-cur="auto">${esc(p.curAuto)}</button>
                <button type="button" data-pf-cur="USD">USD</button>
                <button type="button" data-pf-cur="IDR">IDR</button>
              </div>
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
        </section>
        <div id="portfolioBody"></div>
        <div id="pfNewsPanel"></div>
      </div>`;
    host.dataset.ready = '1';
  }

  pfSyncCurSwitch(); pfSyncInputCur();
  const msgEl = $('#pfMsg'); if (msgEl) msgEl.textContent = pfMessage || '';
  const body = $('#portfolioBody'); if (!body) return;

  const sorted = portfolio.slice().sort(function (a, b) { return a.symbol.localeCompare(b.symbol); });
  if (!sorted.length) {
    body.innerHTML = `<div class="pf-empty">${esc(p.empty)}</div><p class="pf-note">${esc(p.note)}</p>`;
    renderHoldingsNews();
    return;
  }

  const views = sorted.map(function (h) { return { h: h, v: pfHoldingView(h) }; });
  const groups = [];
  views.forEach(function (row) { if (groups.indexOf(row.v.target) === -1) groups.push(row.v.target); });

  const sums = groups.map(function (cur) {
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
    return {
      cur: cur, rows: rows, pending: pending, value: priced ? value : null, cost: cost,
      pl: pl, plPct: (pl != null && cost > 0) ? (pl / cost) * 100 : null,
      day: dayCount ? day : null, dayPct: (dayCount && dayBase > 0) ? (day / dayBase) * 100 : null
    };
  });

  /* The trend and allocation panels need one currency. With a fixed display
     currency that is obvious; on "Auto" the group holding most of the names
     wins, since raw amounts in IDR and USD are not comparable. */
  const primary = pfCurMode !== 'auto'
    ? (sums.filter(function (s) { return s.cur === pfCurMode; })[0] || sums[0])
    : (sums.slice().sort(function (a, b) {
        return (b.rows.length - a.rows.length) || ((b.value || 0) - (a.value || 0));
      })[0] || sums[0]);
  const primaryCur = primary.cur;
  /* Converting IDX positions needs a rate the quotes alone never asked for
     (every holding is priced in its own currency), so ask now and re-render
     once it lands rather than charting half the book. */
  if (portfolio.some(function (h) { return pfCurrency(h.symbol) !== primaryCur; }) && !pfRate() && !pfFxBusy) {
    pfFxBusy = true;
    refreshFxRate(true).then(function () { pfFxBusy = false; renderPortfolio(); })
      .catch(function () { pfFxBusy = false; });
  }
  const paneFx = pfRate() && portfolio.some(function (h) { return pfCurrency(h.symbol) !== primaryCur; });
  /* One book, one number: everything converted into the display currency so
     the headline figure matches the chart and the split. */
  const toDash = function (value, from) {
    if (value == null) return null;
    return from === primaryCur ? value : pfConvert(value, from, primaryCur);
  };
  const book = { value: 0, cost: 0, day: 0, dayBase: 0, priced: false, costed: false, dayed: false };
  views.forEach(function (row) {
    const v = row.v;
    const value = toDash(v.value, v.target);
    if (value != null) { book.value += value; book.priced = true; }
    const cost = toDash(v.cost, v.target);
    if (cost != null) { book.cost += cost; book.costed = true; }
    const pct = (v.q && isFinite(v.q.pct)) ? v.q.pct : null;
    if (value != null && pct != null && (1 + pct / 100) > 0) {
      const prev = value / (1 + pct / 100);
      book.day += value - prev; book.dayBase += prev; book.dayed = true;
    }
  });
  const bookPl = (book.priced && book.costed) ? book.value - book.cost : null;
  const bookPlPct = (bookPl != null && book.cost > 0) ? (bookPl / book.cost) * 100 : null;
  const bookDayPct = (book.dayed && book.dayBase > 0) ? (book.day / book.dayBase) * 100 : null;
  const plClass = bookPl == null ? '' : (bookPl >= 0 ? 'up' : 'down');
  const dayClass = book.dayed ? (book.day >= 0 ? 'up' : 'down') : '';

  const heroDelta = `<div class="pf-hero-delta ${plClass}">${bookPl == null ? '—' : pfSignedMoney(bookPl, primaryCur) + ' (' + pfPctText(bookPlPct) + ')'}<span>${esc(p.netPl)}</span></div>`;
  /* The gain already sits under the value, so the strip carries the two facts
     that are not repeated anywhere else. */
  const heroStats = `<div class="pf-hero-stats">
      <span><em>${esc(p.invested)}</em><strong>${book.costed ? pfMoney(book.cost, primaryCur) : '—'}</strong></span>
      <span><em>${esc(p.today)}</em><strong class="${dayClass}">${book.dayed ? pfSignedMoney(book.day, primaryCur) + '<i>' + pfPctText(bookDayPct) + '</i>' : '—'}</strong></span>
    </div>`;

  const chartNote = esc(p.chartNote) + (paneFx ? ' ' + esc((p.chartNoteFx || '').replace('{rate}', pfMoney(pfRate(), 'IDR'))) : '');

  const present = PF_CLASSES.filter(function (cls) {
    return views.some(function (r) { return pfClassOf(r.h.symbol) === cls; });
  });
  const filterChips = ['all'].concat(present).map(function (cls) {
    const label = cls === 'all' ? p.filterAll : pfClassLabel(cls);
    return `<button type="button" class="pf-chip${pfFilter === cls ? ' active' : ''}" data-pf-filter="${cls}" aria-pressed="${pfFilter === cls ? 'true' : 'false'}">${esc(label)}</button>`;
  }).join('');

  const shownRows = views.filter(function (row) { return pfFilter === 'all' || pfClassOf(row.h.symbol) === pfFilter; });

  const rowsHtml = shownRows.map(function (row) {
    const h = row.h, v = row.v, cur = v.target;
    const cls = v.pl == null ? '' : (v.pl >= 0 ? 'pf-up' : 'pf-down');
    const dayPct = (v.q && isFinite(v.q.pct)) ? `<div class="pf-day ${v.q.pct >= 0 ? 'pf-up' : 'pf-down'}">${pfPctText(v.q.pct)}</div>` : '';
    const lastCell = v.price != null ? pfPrice(v.price, cur) + dayPct : (v.failed ? `<span class="pf-warn">${esc(p.unresolved)}</span>` : '…');
    const avgText = v.avg == null ? (v.pending ? '…' : '—') : pfPrice(v.avg, cur);
    const valueCell = v.value != null ? pfMoney(v.value, cur) : (v.pending || !v.failed ? '…' : '—');
    const plCell = v.pl != null ? pfSignedMoney(v.pl, cur) + `<div class="pf-pct">${pfPctText(v.plPct)}</div>` : (v.pending || !v.failed ? '…' : '—');
    return `
      <tr data-fin-open="${esc(h.symbol)}" data-fin-name="${esc((v.q && v.q.name) || h.symbol)}">
        <td><div class="pf-sym">${esc(h.symbol)}</div><div class="pf-name">${esc((v.q && v.q.name) || '')}</div></td>
        <td class="num" data-label="${esc(p.colShares)}">${h.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
        <td class="num" data-label="${esc(p.colCost)}">${avgText}</td>
        <td class="num" data-label="${esc(p.colLast)}">${lastCell}</td>
        <td class="num" data-label="${esc(p.colValue)}">${valueCell}</td>
        <td class="num ${cls}" data-label="${esc(p.colPl)}">${plCell}</td>
        <td class="num"><div class="pf-row-actions">
          <button type="button" class="pf-open${pfOpen.has(h.symbol) ? ' open' : ''}" data-pf-open="${esc(h.symbol)}" aria-expanded="${pfOpen.has(h.symbol) ? 'true' : 'false'}" aria-label="${esc(p.details)}" title="${esc(p.details)}">⌄</button>
          <button type="button" class="pf-remove" data-pf-remove="${esc(h.symbol)}" aria-label="${esc(p.remove)}" title="${esc(p.remove)}">×</button>
        </div></td>
      </tr>${pfDetailRowHtml(h.symbol)}`;
  }).join('');

  const benchChipsHtml = pfBenchChipsHtml();

  const rangeChips = [['3mo', '3M'], ['6mo', '6M'], ['1y', '1Y']].map(function (pair) {
    const on = pfTrendState.range === pair[0];
    return `<button type="button" class="${on ? 'active' : ''}" data-pf-range="${pair[0]}" aria-pressed="${on ? 'true' : 'false'}">${pair[1]}</button>`;
  }).join('');

  body.innerHTML = `
    <div class="pf-dash-row pf-row-a">
      <section class="mkt-card">
        <div class="mkt-card-head">
          <div>
            <h2 class="mkt-title">${esc(p.perfTitle)}<span class="pf-cur-badge">${esc(primaryCur)}</span></h2>
            <div class="pf-hero-value">${book.priced ? pfMoney(book.value, primaryCur) : '—'}</div>
            ${heroDelta}
          </div>
          <div class="mkt-seg" id="pfRangeSeg" role="group">${rangeChips}</div>
        </div>
        ${heroStats}
        <div class="mkt-legend" id="pfTrendLegend">
          <span class="mkt-legend-item"><i class="mkt-dot pf"></i>${esc(p.portfolio)} <b id="pfTrendPort">—</b></span>
          ${benchChipsHtml}
          <span class="pf-legend-note">${esc(p.perfSub)}</span>
        </div>
        <div id="pfTrendChart"><div class="pf-empty-sm">${esc(p.loadingTrend)}</div></div>
        <p class="pf-chart-note">${chartNote}</p>
      </section>

      <section class="mkt-card">
        <div class="mkt-card-head">
          <div>
            <h2 class="mkt-title">${esc(p.allocTitle)}<span class="pf-cur-badge">${esc(primaryCur)}</span></h2>
            <p class="mkt-sub">${esc(p.allocSub)}</p>
          </div>
        </div>
        ${pfAllocationHtml(views, primaryCur)}
      </section>
    </div>

    <div class="pf-dash-row pf-row-b">
      <section class="mkt-card">
        <div class="mkt-card-head">
          <div>
            <h2 class="mkt-title">${esc(p.moveTitle)}<span class="pf-cur-badge">${esc(primaryCur)}</span></h2>
            <p class="mkt-sub">${esc(p.moveSub)}</p>
          </div>
        </div>
        ${pfMoveHtml(views, primaryCur)}
      </section>

      <section class="mkt-card">
        <div class="mkt-card-head">
          <div>
            <h2 class="mkt-title">${esc(p.activityTitle)}</h2>
            <p class="mkt-sub">${esc(p.activitySub)}</p>
          </div>
        </div>
        <div id="pfActSlot">${pfActivityHtml(primaryCur)}</div>
      </section>
    </div>

    <section class="mkt-card">
      <div class="mkt-card-head">
        <div>
          <h2 class="mkt-title">${esc(p.holdingsTitle)}</h2>
          <p class="mkt-sub">${esc(p.holdingsSub)}</p>
        </div>
        <div class="pf-filters" role="group" aria-label="${esc(p.filterLabel)}">${filterChips}</div>
      </div>
      <div class="pf-table-wrap">
        <table class="pf-table">
          <thead><tr>
            <th>${esc(p.colSym)}</th><th class="num">${esc(p.colShares)}</th><th class="num">${esc(p.colCost)}</th>
            <th class="num">${esc(p.colLast)}</th><th class="num">${esc(p.colValue)}</th><th class="num">${esc(p.colPl)}</th><th></th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
      <p class="pf-note">${esc(p.note)}</p>
    </section>`;

  pfActTarget = primaryCur;
  pfEnsureHoldingDividends();
  pfOpen.forEach(pfLoadFund);
  pfRenderTrend(primaryCur);
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
  pfTrendState.key = '';
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

  pfLogActivity({ action: 'add', symbol: resolved, shares: shares, price: avgCost, currency: costCur });
  pfTrendState.key = '';

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
  const held = portfolio[idx];
  pfLogActivity({ action: 'remove', symbol: symbol, shares: held.shares, price: held.avgCost, currency: held.avgCur || pfCurrency(symbol) });
  portfolio.splice(idx, 1);
  pfTrendState.key = '';
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
        // The portfolio trend picks its series colours at build time, so it is
        // rebuilt from cached data instead of being recoloured.
        if (document.getElementById('pfTrendChart')) renderPortfolio();
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

  /* The fundamental read for a holding renders where the figures already are,
     instead of covering them with a panel of its own. */
  async function pfAiRead(symbol, btn) {
    const out = document.querySelector('[data-pf-ai-out="' + symbol + '"]');
    if (!out || out.dataset.busy === '1') return;
    const t = I18N[state.lang].fundAi;
    out.hidden = false;
    out.dataset.busy = '1';
    if (btn) btn.disabled = true;
    const textId = 'pfAiText' + symbol.replace(/[^A-Za-z0-9]/g, '');
    out.innerHTML = '<div class="fin-ai-panel"><div class="fin-ai-text" id="' + textId + '"></div></div>';
    const textNode = document.getElementById(textId);
    const stop = textNode ? startClock(textNode, t.loading) : function () {};
    try {
      const fund = await fetchFundamentals(symbol);
      const lines = fundFigureLines(fund, state.lang);
      if (!lines.length) throw new Error(I18N[state.lang].fund.noData);
      const q = pfQuotes[symbol] || {};
      const data = await aiRequest('/ai-fundamentals', {
        symbol: symbol.replace(/\.JK$/i, ''),
        name: q.name || '',
        lang: state.lang,
        figures: lines.join('\n')
      });
      out.innerHTML = fundAiHtml((data && data.summary) ? data.summary.trim() : t.failed, false, false);
    } catch (err) {
      const message = aiErrorText(err);
      out.innerHTML = fundAiHtml(/\b(404|405)\b/.test(message) ? t.unavailable : message, true, false);
    } finally {
      stop();
      out.dataset.busy = '';
      if (btn) btn.disabled = false;
      pfDetailOf(symbol).ai = out.innerHTML;
    }
  }

  const benchDash = $('#stockDashboard');
  if (benchDash) benchDash.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-pf-bench]');
    if (!btn) return;
    pfToggleBench(btn.getAttribute('data-pf-bench'));
    renderMarketBench();
    renderPortfolio();
  });

  const viewTabs = $('#mktViewTabs');
  if (viewTabs) viewTabs.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-mkt-view]');
    if (btn) setMarketView(btn.getAttribute('data-mkt-view'));
  });

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
      const rangeBtn2 = e.target.closest('[data-pf-range]');
      if (rangeBtn2) { pfTrendState.range = rangeBtn2.getAttribute('data-pf-range'); renderPortfolio(); return; }
      const benchBtn = e.target.closest('[data-pf-bench]');
      if (benchBtn) {
        pfToggleBench(benchBtn.getAttribute('data-pf-bench'));
        renderPortfolio();
        renderMarketBench();
        return;
      }
      const chipBtn = e.target.closest('[data-pf-filter]');
      if (chipBtn) { pfFilter = chipBtn.getAttribute('data-pf-filter'); renderPortfolio(); return; }
      const openBtn = e.target.closest('[data-pf-open]');
      if (openBtn) { pfToggleDetail(openBtn.getAttribute('data-pf-open')); return; }
      const readBtn = e.target.closest('[data-pf-read]');
      if (readBtn) { pfAiRead(readBtn.getAttribute('data-pf-read'), readBtn); return; }
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