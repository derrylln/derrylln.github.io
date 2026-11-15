/* ------------------------------------------------------------
   Timers, storage keys, feeds, tickers and symbol pools
   ------------------------------------------------------------ */
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

/* Beyond the names the board prices, the mention ranking also carries the
   liquid IDX mid and small caps that retail copy actually writes about, with
   the name each one goes by in Indonesian coverage. */
const IDX_BUZZ_EXTRA = [
  ['ARTO', 'Bank Jago'], ['BBHI', 'Allo Bank'], ['BRIS', 'Bank Syariah Indonesia'],
  ['BJBR', 'Bank Jabar Banten'], ['BNGA', 'Bank Cimb Niaga'], ['NISP', 'Bank OCBC NISP'],
  ['MEGA', 'Bank Mega'], ['BTPS', 'Bank BTPN Syariah'], ['PNBN', 'Bank Pan Indonesia'],
  ['BDMN', 'Bank Danamon'], ['AGRO', 'Bank Raya'], ['BFIN', 'BFI Finance'], ['ADMF', 'Adira Finance'],
  ['GOTO', 'GoTo Gojek Tokopedia'], ['BUKA', 'Bukalapak'], ['EMTK', 'Elang Mahkota'],
  ['MTEL', 'Dayamitra Telekomunikasi'], ['TBIG', 'Tower Bersama'], ['WIFI', 'Solusi Sinergi Digital'],
  ['MTDL', 'Metrodata Electronics'], ['DCII', 'DCI Indonesia'], ['MLPT', 'Multipolar Technology'],
  ['DMMX', 'Digital Mediatama'], ['MYOR', 'Mayora Indah'], ['MIDI', 'Midi Utama'],
  ['ERAA', 'Erajaya Swasembada'], ['LPPF', 'Matahari Department Store'], ['MAPI', 'Mitra Adiperkasa'],
  ['RALS', 'Ramayana Lestari'], ['ULTJ', 'Ultrajaya Milk'], ['MAIN', 'Main Squeeze Indonesia'],
  ['KAEF', 'Kimia Farma'], ['INAF', 'Indofarma'], ['HEAL', 'Medikaloka Hermina'],
  ['SILO', 'Siloam International'], ['PRDA', 'Prodia Widyahusada'],
  ['SMRA', 'Summarecon Agung'], ['ASRI', 'Alam Sutera'], ['LPKR', 'Lippo Karawaci'],
  ['DMAS', 'Puradelta Lestari'], ['SSIA', 'Surya Semesta'], ['KIJA', 'Kawasan Jababeka'],
  ['PTPP', 'PP Persero'], ['WIKA', 'Wijaya Karya'], ['WSKT', 'Waskita Karya'], ['ADHI', 'Adhi Karya'],
  ['HRUM', 'Harum Energy'], ['BYAN', 'Bayan Resources'], ['INDY', 'Indika Energy'],
  ['GEMS', 'Golden Energy Mines'], ['BUMI', 'Bumi Resources'], ['TOBA', 'TBS Energi Utama'],
  ['MEDC', 'Medco Energi'], ['ELSA', 'Elnusa'], ['AKRA', 'AKR Corporindo'],
  ['ESSA', 'ESSA Industries'], ['BRPT', 'Barito Pacific'], ['TPIA', 'Chandra Asri Pacific'],
  ['MBMA', 'Merdeka Battery'], ['NCKL', 'Trimegah Bangun Persada'], ['BRMS', 'Bumi Resources Minerals'],
  ['PSAB', 'J Resources'], ['AMMN', 'Amman Mineral'], ['SGER', 'Sumber Global Energy'],
  ['PANI', 'Pantai Indah Kapuk Dua'], ['CUAN', 'Petrindo Jaya Kreasi'],
  ['AALI', 'Astra Agro Lestari'], ['LSIP', 'London Sumatra'], ['SGRO', 'Sampoerna Agro'],
  ['DSNG', 'Dharma Satya'], ['TBLA', 'Tunas Baru Lampung'], ['SIMP', 'Salim Ivomas'],
  ['ANJT', 'Austindo Nusantara'], ['TAPG', 'Triputra Agro Persada'],
  ['AUTO', 'Astra Otoparts'], ['GJTL', 'Gajah Tunggal'], ['SMSM', 'Selamat Sempurna'],
  ['KRAS', 'Krakatau Steel'], ['BIRD', 'Blue Bird'], ['ASSA', 'Adi Sarana Armada'],
  ['TMAS', 'Tempuran Emas'], ['SMDR', 'Samudera Indonesia'], ['GIAA', 'Garuda Indonesia'],
  ['JSMR', 'Jasa Marga'], ['BMTR', 'Global Mediacom'], ['MNCN', 'Media Nusantara Citra'],
  ['SCMA', 'Surya Citra Media']
].map(function (pair) { return { symbol: pair[0] + '.JK', name: pair[1] }; });

const ETFS = [
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF' }, { symbol: 'QQQ', name: 'Invesco QQQ Trust' },
  { symbol: 'VOO', name: 'Vanguard S&P 500' }, { symbol: 'EIDO', name: 'iShares MSCI Indonesia' },
  { symbol: 'ARKK', name: 'ARK Innovation ETF' }
];
