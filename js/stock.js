/* ------------------------------------------------------------
   Stock search, the financials modal and card fundamentals
   ------------------------------------------------------------ */
const fundCache = new Map();
const FUND_TYPES = ['trailingMarketCap', 'trailingPeRatio',
  'annualTotalRevenue', 'annualNetIncome', 'annualDilutedEPS', 'annualFreeCashFlow', 'annualStockholdersEquity',
  'annualTotalDebt', 'annualCashAndCashEquivalents',
  'annualOrdinarySharesNumber', 'quarterlyOrdinarySharesNumber',
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
  const stmtTypes = ['annualTotalRevenue', 'annualNetIncome', 'annualDilutedEPS', 'annualFreeCashFlow', 'annualStockholdersEquity', 'annualTotalDebt', 'annualCashAndCashEquivalents', 'annualOrdinarySharesNumber', 'quarterlyOrdinarySharesNumber'];
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
    debt: last('annualTotalDebt'),
    cash: last('annualCashAndCashEquivalents'),
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
let finState = { symbol: null, name: '', kind: 'q', range: '6mo', quote: null, ai: null };
let finPriceSeq = 0;
let finPriceChart = null;
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
    if (e.target.closest && e.target.closest('[data-dcf-reset]')) { finDcfReset(); return; }
    const basisBtn = e.target.closest ? e.target.closest('[data-dcf-basis]') : null;
    if (basisBtn) {
      const basis = basisBtn.getAttribute('data-dcf-basis');
      const prev = finDcfEdits[finState.symbol] || {};
      if (prev.basis === basis) return;
      finDcfEdits[finState.symbol] = Object.assign({}, prev, { basis: basis });
      paintDcfSlot();
      return;
    }
    const rangeBtn = e.target.closest ? e.target.closest('[data-fin-range]') : null;
    if (rangeBtn) {
      const range = rangeBtn.getAttribute('data-fin-range');
      if (range === finState.range) return;
      finState.range = range;
      $$('#finPriceSeg button', wrap).forEach(function (b) {
        const on = b === rangeBtn;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      paintFinPrice();
      return;
    }
    const btn = e.target.closest ? e.target.closest('[data-fin-kind]') : null;
    if (!btn) return;
    const kind = btn.getAttribute('data-fin-kind');
    if (kind === finState.kind) return;
    finState.kind = kind;
    $$('#finSeg button', wrap).forEach(b => b.classList.toggle('active', b === btn));
    paintFinBody();
  });
  wrap.addEventListener('input', function (e) {
    const field = e.target.closest ? e.target.closest('[data-dcf]') : null;
    if (field) finDcfRecalc();
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
  /* A history fetch that lands after the close would otherwise build a chart
     inside a hidden card and leave it behind in the registry. */
  finPriceSeq += 1;
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
    if (!aiSpend()) throw aiCapError();
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
    finState.ai = { text: aiMissingEndpoint(err) ? t.unavailable : message, err: true };
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
  finPriceChart = null;
}

async function paintFinBody() {
  const body = document.getElementById('finBody');
  if (!body) return;
  const t = finT(), f = I18N[state.lang].fund;
  const symbol = finState.symbol;
  destroyFinCharts();
  body.innerHTML = '<div class="fin-loading">' + esc(t.loading) + '</div>';
  let fund = null, quote = null;
  const fetched = await Promise.all([
    fetchFundamentals(symbol).catch(function () { return null; }),
    fetchStockDetails(symbol).catch(function () { return null; })
  ]);
  fund = fetched[0]; quote = fetched[1];
  if (finState.symbol !== symbol) return;
  finState.quote = quote;
  finState.fund = fund;
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
  const dcf = fundDcf(fund, quote && quote.price, quote && quote.currency, finDcfEdits[symbol]);

  /* Some feeds report net income without a diluted EPS. A share count turns
     that profit into the same per-share figure, so the tile says where the
     number came from rather than showing a dash. */
  const epsShares = finShares(fund, quote && quote.price, quote && quote.currency);
  const epsOf = function (period) {
    if (period.eps && isFinite(period.eps.raw)) return { value: val(period.eps), derived: false };
    const own = (period.shares && isFinite(period.shares.raw) && period.shares.raw > 0) ? period.shares.raw : null;
    const count = own || epsShares;
    if (period.netIncome && isFinite(period.netIncome.raw) && count > 0) {
      return {
        value: compactNum(period.netIncome.raw / count, period.netIncome.currency || fund.currency),
        derived: true, today: !own
      };
    }
    return { value: '—', derived: false };
  };
  const eps = epsOf(newest);
  let epsOwnCount = 0, epsTodayCount = 0;
  const tile = function (label, value, sub, growth) {
    return '<div class="fin-kpi"><span class="fin-kpi-label">' + esc(label) + '</span>' +
      '<strong class="fin-kpi-value">' + esc(value) + '</strong>' +
      '<span class="fin-kpi-sub">' + esc(sub) + '</span>' +
      (growth == null ? '' : '<span class="fin-kpi-badge ' + (growth >= 0 ? 'up' : 'down') + '">' +
        (growth >= 0 ? '+' : '') + growth.toFixed(1) + '% ' + esc(f.yoy) + '</span>') +
      '</div>';
  };
  body.innerHTML =
    finPriceHtml(quote, t) +
    '<div class="fin-kpis">' +
      tile(f.rev, val(newest.revenue), per, newest.growth) +
      tile(f.netIncome, val(newest.netIncome), newest.margin == null ? per : per + ' · ' + newest.margin.toFixed(1) + '% ' + f.netMargin, null) +
      tile(f.eps, eps.value, eps.derived ? per + ' · ' + (eps.today ? t.epsDerivedToday : t.epsDerived) : per, null) +
      tile(f.fcf, val(newest.fcf), per, null) +
      tile(f.equity, val(newest.equity), per, null) +
      tile(f.roe, roeText(newest), newest.kind === 'Q' ? per + ' · ' + f.annualised : per, null) +
    '</div>' +
    '<div id="finAiSlot"></div>' +
    '<div id="finDcfSlot">' + finDcfHtml(dcf, t) + '</div>' +
    '<div id="finVerdictSlot"></div>' +
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
        const epsCell = epsOf(p);
        if (epsCell.derived) { if (epsCell.today) epsTodayCount += 1; else epsOwnCount += 1; }
        return '<tr><td>' + esc(periodLabel(p, f)) + '</td>' +
          '<td>' + esc(val(p.revenue)) + '</td>' +
          '<td class="' + (g == null ? '' : g >= 0 ? 'up' : 'down') + '">' +
            (g == null ? '—' : (g >= 0 ? '+' : '') + g.toFixed(1) + '%') + '</td>' +
          '<td>' + esc(val(p.netIncome)) + '</td>' +
          '<td>' + (p.margin == null ? '—' : p.margin.toFixed(1) + '%') + '</td>' +
          '<td>' + esc(epsCell.value) + (epsCell.derived ? '<sup class="fin-dag">' + (epsCell.today ? '‡' : '†') + '</sup>' : '') + '</td>' +
          '<td>' + esc(val(p.fcf)) + '</td>' +
          '<td>' + esc(val(p.equity)) + '</td>' +
          '<td>' + esc(roeText(p)) + '</td></tr>';
      }).join('') +
    '</tbody></table></div>' +
    (epsOwnCount || epsTodayCount
      ? '<p class="fin-note">' +
        [epsOwnCount ? '† ' + esc(t.epsDerived) : '', epsTodayCount ? '‡ ' + esc(t.epsDerivedToday) : '']
          .filter(Boolean).join(' · ') + '</p>'
      : '');
  finDcfPatch(dcf);
  paintFinVerdict(dcf);
  paintFinCharts(list.slice().reverse(), f);
  paintFinAiOut();
  paintFinPrice();
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

/* PRICE
   The report values a share, so the price it is being valued against leads
   the report instead of hiding behind a link. Only the range is refetched:
   the fundamentals above stay painted while the line changes. */
const FIN_RANGES = [['1mo', '1M'], ['3mo', '3M'], ['6mo', '6M'], ['1y', '1Y'], ['5y', '5Y']];

function finPriceHtml(quote, t) {
  const cur = (quote && quote.currency) || fundCurrencySymbol(finState.symbol) || '';
  const price = (quote && isFinite(quote.price)) ? quote.price : null;
  const pct = (quote && isFinite(quote.pct)) ? quote.pct : null;
  const chg = pct == null ? '' : '<span class="fin-price-chg ' + (pct >= 0 ? 'up' : 'down') + '">' +
    (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%</span>';
  const pills = FIN_RANGES.map(function (pair) {
    const on = finState.range === pair[0];
    return '<button type="button" class="' + (on ? 'active' : '') + '" data-fin-range="' + pair[0] +
      '" aria-pressed="' + (on ? 'true' : 'false') + '">' + pair[1] + '</button>';
  }).join('');
  return '<section class="fin-price">' +
    '<div class="fin-price-head">' +
      '<div><span class="fin-price-label">' + esc(t.price) + (cur ? ' · ' + esc(cur) : '') + '</span>' +
      '<div class="fin-price-value">' + esc(price == null ? '—' : finMoney(price, cur)) + chg + '</div>' +
      '<div class="fin-price-meta" id="finPriceMeta"></div></div>' +
      '<div class="mkt-seg" id="finPriceSeg" role="group" aria-label="' + esc(t.price) + '">' + pills + '</div>' +
    '</div>' +
    '<div id="finPriceChart"></div>' +
  '</section>';
}

async function paintFinPrice() {
  const symbol = finState.symbol;
  const range = finState.range || '6mo';
  const node = document.getElementById('finPriceChart');
  if (!node || !symbol) return;
  const t = finT();
  const seq = ++finPriceSeq;
  node.innerHTML = '<div class="fin-empty">' + esc(t.loading) + '</div>';
  const list = await fetchHistory(symbol, range);
  if (seq !== finPriceSeq || finState.symbol !== symbol) return;
  const host = document.getElementById('finPriceChart');
  if (!host) return;
  const meta = document.getElementById('finPriceMeta');
  const points = (list || []).filter(function (p) { return p && isFinite(p.y); });
  if (!points.length) {
    host.innerHTML = '<div class="fin-empty">' + esc(t.priceEmpty) + '</div>';
    if (meta) meta.innerHTML = '';
    return;
  }
  const cur = (finState.quote && finState.quote.currency) || fundCurrencySymbol(symbol) || '';
  const first = points[0].y, last = points[points.length - 1].y;
  const pct = first > 0 ? (last / first - 1) * 100 : null;
  const up = pct == null || pct >= 0;
  if (meta) {
    const label = (FIN_RANGES.filter(function (p) { return p[0] === range; })[0] || ['', range])[1];
    meta.innerHTML = esc(label + ' ' + t.priceIn) + ' <b class="' + (up ? 'up' : 'down') + '">' +
      (pct == null ? '—' : (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%') + '</b>';
  }
  if (typeof ApexCharts === 'undefined') { host.innerHTML = ''; return; }
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (finPriceChart) { try { finPriceChart.destroy(); } catch (e) {} finPriceChart = null; }
  host.innerHTML = '';
  const chart = new ApexCharts(host, {
    series: [{ name: symbol, data: points.map(function (p) { return { x: p.x, y: p.y }; }) }],
    chart: { type: 'area', height: 190, toolbar: { show: false }, fontFamily: 'Inter', background: 'transparent', zoom: { enabled: false } },
    theme: { mode: isDark ? 'dark' : 'light' },
    colors: [up ? '#0f9d58' : '#d10a11'],
    stroke: { curve: 'smooth', width: 2.2 },
    fill: { type: 'gradient', gradient: { opacityFrom: 0.22, opacityTo: 0.01 } },
    dataLabels: { enabled: false },
    markers: { size: 0, hover: { size: 4 } },
    grid: { borderColor: isDark ? '#334155' : '#f1f3f5', strokeDashArray: 4, padding: { left: 6, right: 6 } },
    xaxis: { type: 'datetime', labels: { datetimeUTC: false, style: { fontSize: '10px' } }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { labels: { style: { fontSize: '10px' }, formatter: function (v) { return v == null ? '' : v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : 2 }); } } },
    tooltip: { x: { format: 'dd MMM yyyy' }, y: { formatter: function (v) { return finMoney(v, cur); } } }
  });
  chart.render();
  finPriceChart = chart;
  finCharts.push(chart);
}

/* One entry per reported period, newest first. Growth compares with the same
   period a year earlier, so a quarter is never measured against the previous
   quarter's seasonality. */
