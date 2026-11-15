/* ------------------------------------------------------------
   Quotes, chart data and the benchmark series
   ------------------------------------------------------------ */
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
