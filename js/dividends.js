/* ------------------------------------------------------------
   Dividend scan, dividend leaders and market breadth
   ------------------------------------------------------------ */
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

/* ---- world index board ------------------------------------------------
   One tile per exchange, grouped by region: level, today's move and a month
   of closes from the same Yahoo chart endpoint the rest of the page uses, so
   one request per index and no second call for the sparkline. Only fetched
   when the explore board is opened, and cached for ten minutes. */
