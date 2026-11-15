/* ------------------------------------------------------------
   Activity, allocation, contributors, trend, risk and dividend income
   ------------------------------------------------------------ */
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
      /* A payment made before the first trade is not income this book earned,
         and one paid while only part of the position was open is not paid on
         today's share count either. */
      const shares = pfSharesBefore(h.symbol, new Date(ev.ts).toISOString().slice(0, 10));
      if (!(shares > 0)) return;
      out.push({ ts: ev.ts, symbol: h.symbol, perShare: ev.amount, shares: shares, currency: pfCurrency(h.symbol) });
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
    fetchDividendInfo(h.symbol).then(function () {
      paintPfActivity();
      paintPfDividendIncome();
    }).catch(function () {});
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
        <span class="pact-main"><strong class="${isOut ? 'down' : 'up'}">${esc(isOut ? p.actRemove : p.actAdd)}</strong> ${esc(e.symbol || '')}<em>${esc(qty)}${esc(price)}</em>${e.note ? `<span class="pact-note">${esc(e.note)}</span>` : ''}</span>
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
   Every line is indexed to 100, the portfolio at the first day all of
   its holdings are priced, which is the only way a rupiah book and an
   index compare fairly. ---- */

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
  /* The base is the first day every holding actually has a close. Taking the
     latest of each holding's first day is not the same thing: a market holiday
     leaves one holding with no price that day, and the next point — when it
     finally appears — jumps the index by the weight of the whole position.
     Prices are carried forward from the base, never valued before it. */
  const live = [];
  holdings.forEach(function (h, i) {
    const firstDay = calendar.filter(function (day) { return byDay[i][day.k] != null; })[0];
    if (firstDay) live.push(i);
  });
  if (!live.length) return null;
  const common = calendar.filter(function (day) {
    return live.every(function (i) { return byDay[i][day.k] != null; });
  })[0];
  let baseKey = common ? common.k : null;
  if (!baseKey) {
    live.forEach(function (i) {
      const firstDay = calendar.filter(function (day) { return byDay[i][day.k] != null; })[0];
      if (!baseKey || firstDay.k > baseKey) baseKey = firstDay.k;
    });
  }
  if (!baseKey) return null;

  const last = holdings.map(function () { return null; });
  live.forEach(function (i) { last[i] = byDay[i][baseKey]; });

  const total = calendar.filter(function (day) { return day.k >= baseKey; }).map(function (day) {
    let sum = 0, priced = 0;
    live.forEach(function (i) {
      const h = holdings[i];
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

  const baseDay = calendar.filter(function (day) { return day.k === baseKey; })[0];
  const data = { portIdx: portIdx, portPct: pfLastPct(portIdx), benches: benches,
    baseDate: baseDay ? baseDay.k : null };
  pfTrendState.key = key;
  pfTrendState.data = data;
  return data;
}

/* ---- risk ---------------------------------------------------------
   Four numbers read off the same daily series the chart above just built, so
   the block costs no request of its own: volatility and drawdown from the
   portfolio line, beta from the IHSG line beside it, concentration from the
   position values already on the page. */

function pfRiskReturns(series) {
  const pts = (series || []).filter(function (p) { return p && isFinite(p.y) && p.y > 0; });
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const day = pfDayKey(pts[i].x);
    if (day === pfDayKey(pts[i - 1].x)) continue;
    out.push({ k: day, r: pts[i].y / pts[i - 1].y - 1 });
  }
  return out;
}

function pfRiskVolatility(returns) {
  if (returns.length < 5) return null;
  const mean = returns.reduce(function (a, r) { return a + r.r; }, 0) / returns.length;
  const variance = returns.reduce(function (a, r) { return a + (r.r - mean) * (r.r - mean); }, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}

/* Deepest fall from a running peak, as a negative percentage. */
function pfRiskDrawdown(series) {
  let peak = 0, worst = 0;
  (series || []).forEach(function (p) {
    if (!p || !isFinite(p.y) || p.y <= 0) return;
    if (p.y > peak) peak = p.y;
    if (peak > 0) worst = Math.min(worst, p.y / peak - 1);
  });
  return worst * 100;
}

/* Covariance over variance, on the days both series have a return. */
function pfRiskBeta(portReturns, benchReturns) {
  const byDay = Object.create(null);
  benchReturns.forEach(function (r) { byDay[r.k] = r.r; });
  const pairs = portReturns.filter(function (r) { return byDay[r.k] != null; })
    .map(function (r) { return [r.r, byDay[r.k]]; });
  if (pairs.length < 10) return null;
  const meanX = pairs.reduce(function (a, p) { return a + p[1]; }, 0) / pairs.length;
  const meanY = pairs.reduce(function (a, p) { return a + p[0]; }, 0) / pairs.length;
  let cov = 0, varX = 0;
  pairs.forEach(function (p) {
    cov += (p[1] - meanX) * (p[0] - meanY);
    varX += (p[1] - meanX) * (p[1] - meanX);
  });
  return varX > 0 ? cov / varX : null;
}

/* Weight is taken over the positions that have a price; an unpriced holding
   would otherwise invent room for the ones that do. */
function pfRiskConcentration(target) {
  const values = portfolio.map(function (h) {
    return pfValueIn(pfHoldingView(h), target);
  }).filter(function (v) { return v != null && isFinite(v) && v > 0; })
    .sort(function (a, b) { return b - a; });
  if (!values.length) return null;
  const total = values.reduce(function (a, v) { return a + v; }, 0);
  const top3 = values.slice(0, 3).reduce(function (a, v) { return a + v; }, 0);
  return { top3: total > 0 ? (top3 / total) * 100 : null, count: values.length, largest: total > 0 ? (values[0] / total) * 100 : null };
}

/* Historical, not parametric: the fifth percentile of the days actually
   observed, so a fat tail shows as a bigger number instead of being smoothed
   away by a normal curve the returns never promised to follow. */
function pfRiskVaR(returns) {
  if (returns.length < 20) return null;
  const sorted = returns.map(function (r) { return r.r; })
    .sort(function (a, b) { return a - b; });
  const cut = sorted[Math.floor(sorted.length * 0.05)];
  return cut == null ? null : -cut * 100;
}

/* The book in one number, for turning a percentage risk into money. */
function pfBookValue(target) {
  return portfolio.reduce(function (sum, h) {
    const v = pfValueIn(pfHoldingView(h), target);
    return (v != null && isFinite(v) && v > 0) ? sum + v : sum;
  }, 0);
}

/* ---- exposure vs target ------------------------------------------
   Classes come from the symbols already on the page, so this needs no input
   beyond the targets themselves, which are the reader's own numbers and are
   kept locally. Drift is measured in percentage points of the book, not in
   rupiah, because a target is a share, not an amount. */
const PF_TARGET_KEY = 'finwire.portfolio.targets.v1';
const PF_DRIFT_BAND = 5;
const PF_TARGET_DEFAULT = { idx: 50, us: 30, etf: 15, crypto: 5 };

let pfTargets = (function () {
  const out = Object.assign({}, PF_TARGET_DEFAULT);
  const saved = loadJSON(PF_TARGET_KEY, null);
  if (saved && typeof saved === 'object') {
    PF_CLASSES.forEach(function (cls) {
      const v = Number(saved[cls]);
      if (isFinite(v) && v >= 0 && v <= 100) out[cls] = v;
    });
  }
  return out;
})();

function pfClassWeights(target) {
  const by = Object.create(null);
  let total = 0;
  portfolio.forEach(function (h) {
    const v = pfValueIn(pfHoldingView(h), target);
    if (v == null || !isFinite(v) || v <= 0) return;
    const cls = pfClassOf(h.symbol);
    by[cls] = (by[cls] || 0) + v;
    total += v;
  });
  return PF_CLASSES.map(function (cls) {
    const value = by[cls] || 0;
    return { cls: cls, value: value, pct: total > 0 ? (value / total) * 100 : 0 };
  }).filter(function (g) { return g.value > 0 || pfTargets[g.cls] > 0; });
}

function pfDriftHtml(target) {
  const p = (I18N[state.lang] || I18N.en).portfolio;
  const rows = pfClassWeights(target);
  const total = rows.reduce(function (a, g) { return a + g.value; }, 0);
  if (!total) return '';
  const sum = PF_CLASSES.reduce(function (a, c) { return a + (pfTargets[c] || 0); }, 0);
  const body = rows.map(function (g) {
    const want = pfTargets[g.cls] || 0;
    const drift = g.pct - want;
    const over = drift > PF_DRIFT_BAND, under = drift < -PF_DRIFT_BAND;
    const flag = over ? p.driftOver : under ? p.driftUnder : p.driftOk;
    return `<tr>
        <td>${esc(pfClassLabel(g.cls))}</td>
        <td class="num">${g.pct.toFixed(1)}%</td>
        <td class="num"><input type="number" min="0" max="100" step="1" value="${want}" data-pf-target="${g.cls}" aria-label="${esc(pfClassLabel(g.cls))}"></td>
        <td class="num ${over ? 'down' : under ? 'up' : ''}">${drift > 0 ? '+' : ''}${drift.toFixed(1)}</td>
        <td class="num"><span class="pf-drift-flag ${over ? 'over' : under ? 'under' : 'ok'}">${esc(flag)}</span></td>
      </tr>`;
  }).join('');
  const off = Math.abs(sum - 100) > 0.5;
  return `<div class="pf-drift">
      <div class="pf-risk-head"><span>${esc(p.driftTitle)}</span><i>${esc(p.driftBand.replace('{pp}', String(PF_DRIFT_BAND)))}</i></div>
      <table class="pf-drift-table">
        <thead><tr>
          <th>${esc(p.driftColClass)}</th><th class="num">${esc(p.driftColNow)}</th>
          <th class="num">${esc(p.driftColTarget)}</th><th class="num">${esc(p.driftColDrift)}</th>
          <th class="num">${esc(p.driftColFlag)}</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
      ${off ? `<p class="pf-drift-note">${esc(p.driftSum.replace('{sum}', sum.toFixed(0)))}</p>` : ''}
    </div>`;
}

/* Repainting after a target edit re-runs the whole block, because the flag,
   the total and the row colour all depend on every target at once. */
let pfRiskTarget = 'IDR';
document.addEventListener('change', function (e) {
  const input = e.target && e.target.closest ? e.target.closest('[data-pf-target]') : null;
  if (!input) return;
  const cls = input.getAttribute('data-pf-target');
  const raw = Number(input.value);
  if (!PF_CLASSES.includes(cls) || !isFinite(raw)) return;
  pfTargets[cls] = Math.max(0, Math.min(100, raw));
  saveJSON(PF_TARGET_KEY, pfTargets);
  const slot = document.getElementById('pfRiskBlock');
  if (slot) slot.innerHTML = pfRiskHtml(pfTrendState.data, pfRiskTarget);
});

const PF_RANGE_LABEL = { '3mo': '3M', '6mo': '6M', '1y': '1Y' };

function pfRiskHtml(data, target) {
  const p = (I18N[state.lang] || I18N.en).portfolio;
  pfRiskTarget = target;
  const range = PF_RANGE_LABEL[pfTrendState.range] || '';
  const port = (data && data.portIdx) || [];
  const returns = pfRiskReturns(port);
  const vol = pfRiskVolatility(returns);
  const dd = port.length > 1 ? pfRiskDrawdown(port) : null;
  const ihsg = (data && (data.benches || []).filter(function (b) { return b.id === 'ihsg'; })[0]) || null;
  const beta = ihsg ? pfRiskBeta(returns, pfRiskReturns(ihsg.idx)) : null;
  const conc = pfRiskConcentration(target);
  const book = pfBookValue(target);
  const varPct = pfRiskVaR(returns);
  if (vol == null && dd == null && conc == null) return '';

  const cell = function (label, value, trend, sub) {
    return `<div class="pf-risk-cell"><span>${esc(label)}</span>` +
      `<strong${trend ? ` class="${trend}"` : ''}>${value}</strong><em>${esc(sub)}</em></div>`;
  };
  const pct = function (v) { return v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%'; };

  return `<div class="pf-risk-head"><span>${esc(p.riskTitle)}</span><i>${esc(range)}</i></div>
    <div class="pf-risk">
      ${cell(p.riskVol, vol == null ? '—' : vol.toFixed(1) + '%', '', (p.riskVolSub || '').replace('{range}', range))}
      ${cell(p.riskDd, dd == null ? '—' : pct(dd), dd == null ? '' : (dd < 0 ? 'down' : 'up'), (p.riskDdSub || '').replace('{range}', range))}
      ${cell(p.riskBeta, beta == null ? '—' : beta.toFixed(2), '', beta == null && !ihsg ? p.riskBetaOff : p.riskBetaSub)}
      ${cell(p.riskTop3, conc && conc.top3 != null ? conc.top3.toFixed(0) + '%' : '—', '', (p.riskTop3Sub || '').replace('{n}', conc ? String(conc.count) : '0'))}
      ${cell(p.riskVar, varPct == null ? '—' : '−' + varPct.toFixed(1) + '%', varPct == null ? '' : 'down', varPct == null ? (p.riskVarOff || '') : pfMoney(book * varPct / 100, target) + ' · ' + (p.riskVarSub || '').replace('{range}', range))}
    </div>
    ${pfDriftHtml(target)}`;
}

/* ---- dividend income --------------------------------------------
   Built from the payout history the dividend scan already caches for these
   holdings, so the card costs no request of its own: trailing twelve-month
   income at today's share count, that income against what was paid, and the
   next payment if the company keeps to its own rhythm. */

/* The median gap between payments, in days. A company that pays twice a year
   gets ~182, one that pays quarterly ~91; payments closer than three weeks
   apart are treated as part of the same distribution. */
function pfDividendGap(row) {
  const events = (row && row.events) || [];
  if (events.length < 2) return null;
  const gaps = [];
  for (let i = 1; i < events.length; i++) {
    const days = (events[i].ts - events[i - 1].ts) / 864e5;
    if (days > 20 && days < 400) gaps.push(days);
  }
  if (!gaps.length) return null;
  gaps.sort(function (a, b) { return a - b; });
  return gaps[Math.floor(gaps.length / 2)];
}

/* Projected, never announced: the last payout plus the company's own spacing,
   walked forward until it is in the future. */
function pfDividendNext(row) {
  const events = (row && row.events) || [];
  const gap = pfDividendGap(row);
  if (!gap || !events.length) return null;
  const lastTs = events[events.length - 1].ts;
  let ts = lastTs + gap * 864e5;
  for (let i = 0; i < 24 && ts < Date.now(); i++) ts += gap * 864e5;
  return ts > Date.now() ? ts : null;
}

function pfDividendRows(target) {
  const out = [];
  let income = 0, bookCost = 0;
  portfolio.forEach(function (h) {
    const cur = pfCurrency(h.symbol);
    const cost = pfConvert((h.avgCost || 0) * h.shares, h.avgCur || cur, target);
    if (cost != null) bookCost += cost;
    const row = divCache.rows[h.symbol];
    if (!row || !(row.dps > 0)) return;
    const annual = pfConvert(row.dps * h.shares, cur, target);
    if (annual == null) return;
    income += annual;
    out.push({
      symbol: h.symbol, shares: h.shares, dps: row.dps, cur: cur,
      annual: annual, cost: cost, next: pfDividendNext(row)
    });
  });
  return { rows: out.sort(function (a, b) { return b.annual - a.annual; }), income: income, bookCost: bookCost };
}

function pfDividendIncomeHtml(target) {
  const p = (I18N[state.lang] || I18N.en).portfolio;
  const data = pfDividendRows(target);
  if (!portfolio.length) return '';
  if (!data.rows.length) return `<div class="pf-empty-sm">${esc(p.divEmpty)}</div>`;

  const yoc = data.bookCost > 0 ? (data.income / data.bookCost) * 100 : null;
  const next = data.rows.filter(function (r) { return r.next; })
    .sort(function (a, b) { return a.next - b.next; })[0];
  const locale = state.lang === 'id' ? 'id-ID' : 'en-GB';
  /* An ex-date is a day, not an instant: the payout timestamps sit at UTC
     midnight, so formatting them in local time lands on the day before for
     anyone west of Greenwich. */
  const dateText = function (ts) {
    return new Date(ts).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  const cell = function (label, value, cls, sub) {
    return `<div class="pf-risk-cell"><span>${esc(label)}</span>` +
      `<strong${cls ? ` class="${cls}"` : ''}>${value}</strong><em>${esc(sub)}</em></div>`;
  };

  const rows = data.rows.map(function (r) {
    return `<tr class="pf-div-row">
        <td><div class="pf-sym">${esc(r.symbol)}</div></td>
        <td class="num" data-label="${esc(p.colShares)}">${r.shares.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
        <td class="num" data-label="${esc(p.divColDps)}">${esc(pfPrice(r.dps, r.cur))}</td>
        <td class="num" data-label="${esc(p.divColIncome)}">${esc(pfMoney(r.annual, target))}</td>
        <td class="num" data-label="${esc(p.divYoc)}">${r.cost > 0 ? (r.annual / r.cost * 100).toFixed(2) + '%' : '—'}</td>
        <td class="num" data-label="${esc(p.divColNext)}">${r.next ? esc(dateText(r.next)) + ` <span class="pf-tag">${esc(p.divExpected)}</span>` : '—'}</td>
      </tr>`;
  }).join('');

  return `<div class="pf-risk pf-div-stats">
      ${cell(p.divAnnual, esc(pfMoney(data.income, target)), '', p.divAnnualSub)}
      ${cell(p.divYoc, yoc == null ? '—' : yoc.toFixed(2) + '%', '', p.divYocSub)}
      ${cell(p.divNext, next ? esc(dateText(next.next)) : '—', '', p.divNextSub)}
    </div>
    <div class="pf-table-wrap">
      <table class="pf-table pf-div-table">
        <thead><tr>
          <th>${esc(p.colSym)}</th><th class="num">${esc(p.colShares)}</th><th class="num">${esc(p.divColDps)}</th>
          <th class="num">${esc(p.divColIncome)}</th><th class="num">${esc(p.divYoc)}</th><th class="num">${esc(p.divColNext)}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="pf-note">${esc((p.divNote || '').replace('{paying}', String(data.rows.length)).replace('{total}', String(portfolio.length)))}</p>`;
}

let pfDivTarget = 'USD';

function paintPfDividendIncome() {
  const slot = document.getElementById('pfDivSlot');
  if (!slot) return;
  slot.innerHTML = pfDividendIncomeHtml(pfDivTarget);
}
