/* ------------------------------------------------------------
   Portfolio state, ledger, XIRR, CSV export and fx
   ------------------------------------------------------------ */
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

/* THE LEDGER
   A holding is a claim on dated trades, so the trades are what gets stored:
   one event per buy or sell with its own quantity, price, currency and date.
   Shares, average cost and the money-weighted return are all derived from
   those events rather than typed in beside them, so they cannot disagree. */
const PF_LEDGER_KEY = 'finwire.portfolio.ledger.v1';

function pfToday() { return new Date().toISOString().slice(0, 10); }

function pfEvent(raw) {
  if (!raw) return null;
  const symbol = String(raw.symbol || '').toUpperCase().trim();
  const qty = Number(raw.qty);
  const price = Number(raw.price);
  if (!/^[A-Z0-9.^=-]{1,15}$/.test(symbol)) return null;
  if (!isFinite(qty) || qty <= 0 || !isFinite(price) || price < 0) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date)) ? String(raw.date) : pfToday();
  /* The reason is free text and never required; it is kept short because it
     rides along in the ledger row and the activity line. */
  const note = String(raw.note == null ? '' : raw.note).replace(/\s+/g, ' ').trim().slice(0, 140);
  return {
    id: String(raw.id || ('ev' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36))),
    side: raw.side === 'sell' ? 'sell' : 'buy',
    symbol: symbol, qty: qty, price: price,
    cur: (raw.cur === 'IDR' || raw.cur === 'USD') ? raw.cur : pfCurrency(symbol),
    date: date, opening: !!raw.opening, note: note
  };
}

/* A browser from before the ledger holds a snapshot of positions and no dates.
   Each one becomes a single opening buy dated today — which is all that is
   actually known — and can be deleted once the real trade is entered. */
function pfLedgerInit() {
  const saved = loadJSON(PF_LEDGER_KEY, null);
  if (Array.isArray(saved) && saved.length) {
    const list = saved.map(pfEvent).filter(Boolean);
    if (list.length) return list;
  }
  const legacy = loadJSON(PF.store, []);
  if (!Array.isArray(legacy)) return [];
  return legacy.map(function (h) {
    return pfEvent({
      symbol: h && h.symbol, qty: h && h.shares, price: h && h.avgCost,
      cur: h && h.avgCur, date: pfToday(), side: 'buy', opening: true
    });
  }).filter(Boolean);
}

/* Average cost, walked in date order: a buy adds to the pot, a sell takes its
   share of the running average back out of it. */
function pfLedgerHoldings(events) {
  const bySymbol = Object.create(null);
  (events || []).slice()
    .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; })
    .forEach(function (e) { (bySymbol[e.symbol] = bySymbol[e.symbol] || []).push(e); });
  const out = [];
  Object.keys(bySymbol).forEach(function (symbol) {
    let shares = 0, cost = 0, cur = null;
    bySymbol[symbol].forEach(function (e) {
      cur = cur || e.cur || pfCurrency(symbol);
      const price = e.cur === cur ? e.price : (pfConvert(e.price, e.cur, cur) || e.price);
      if (e.side === 'buy') { cost += price * e.qty; shares += e.qty; return; }
      if (shares <= 0) return;
      const sold = Math.min(e.qty, shares);
      cost -= (cost / shares) * sold;
      shares -= sold;
    });
    if (shares > 1e-9) out.push({ symbol: symbol, shares: shares, avgCost: cost / shares, avgCur: cur || pfCurrency(symbol) });
  });
  return out;
}

function pfHeldShares(symbol) {
  const hit = pfLedgerHoldings(pfLedger).filter(function (h) { return h.symbol === symbol; })[0];
  return hit ? hit.shares : 0;
}

/* Shares on the book on a given day, from the dated trades rather than from
   today's total. A trade dated the payment day does not count: the feed gives
   a date, not a time, so the reader was not holding before that morning. */
function pfSharesBefore(symbol, day) {
  let shares = 0;
  pfLedger.forEach(function (e) {
    if (e.symbol !== symbol || !e.date || e.date >= day) return;
    shares += e.side === 'sell' ? -e.qty : e.qty;
  });
  return shares > 1e-9 ? shares : 0;
}

let pfLedger = pfLedgerInit();
let portfolio = pfLedgerHoldings(pfLedger);

function savePortfolio() {
  saveJSON(PF_LEDGER_KEY, pfLedger);
  portfolio = pfLedgerHoldings(pfLedger);
  pfTrendState.key = '';
}

/* MONEY-WEIGHTED RETURN
   A snapshot profit says what the book gained; it cannot say how fast, because
   it ignores when the money went in. Each trade becomes a dated cash flow in
   the display currency — converted at the rate that held on its own day — and
   today's value closes the series. The internal rate of return of that series
   is the annual return the reader actually earned. */
let pfFxHist = null, pfFxHistBusy = false;

function pfFxHistory() {
  if (pfFxHist) return pfFxHist;
  if (!pfFxHistBusy) {
    pfFxHistBusy = true;
    fetchHistory(PF.fxSymbol, '10y').then(function (list) {
      pfFxHist = pfRateSeries(list);
      pfFxHistBusy = false;
      if (pfFxHist.length) renderPortfolio();
    }).catch(function () { pfFxHistBusy = false; });
  }
  return null;
}

function pfRateThen(cur, iso) {
  if (!cur || cur === 'USD') return 1;
  const series = pfFxHistory();
  const day = String(iso || pfToday()).slice(0, 10);
  if (series && series.length) {
    const rate = pfRateOn(series, day);
    if (isFinite(rate) && rate > 0) return rate;
  }
  return pfUnitsPerUsd(cur);
}

function pfConvertThen(amount, from, to, iso) {
  if (amount == null || !isFinite(amount)) return null;
  if (!from || !to || from === to) return amount;
  const usdIdr = pfRateThen('IDR', iso);
  if (!isFinite(usdIdr) || usdIdr <= 0) return null;
  if (from === 'USD' && to === 'IDR') return amount * usdIdr;
  if (from === 'IDR' && to === 'USD') return amount / usdIdr;
  return null;
}

function pfXirr(flows) {
  const list = (flows || []).filter(function (f) { return f && isFinite(f.v) && f.v !== 0; })
    .sort(function (a, b) { return a.t - b.t; });
  if (list.length < 2) return null;
  if (!list.some(function (f) { return f.v > 0; })) return null;
  if (!list.some(function (f) { return f.v < 0; })) return null;
  const t0 = list[0].t;
  const npv = function (rate) {
    return list.reduce(function (sum, f) {
      return sum + f.v / Math.pow(1 + rate, (f.t - t0) / 31557600000);
    }, 0);
  };
  /* A money-weighted return below -95% is not a return worth naming, so the
     scan starts there and brackets the first sign change it finds. */
  let prevRate = -0.95, prev = npv(prevRate);
  for (let rate = -0.94; rate <= 10.0001; rate += 0.005) {
    const value = npv(rate);
    if (!isFinite(prev) || !isFinite(value)) { prevRate = rate; prev = value; continue; }
    if (prev === 0) return prevRate;
    if (prev * value < 0) {
      let lo = prevRate, hi = rate;
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
      }
      return (lo + hi) / 2;
    }
    prevRate = rate;
    prev = value;
  }
  return null;
}

/* How long the book has actually been held: the first dated trade, not the
   first day a price was stored, so an annualised rate can be read against the
   time behind it. */
function pfFirstTradeDate() {
  let first = null;
  pfLedger.forEach(function (e) {
    if (e.date && (!first || e.date < first)) first = e.date;
  });
  return first;
}

function pfHeldText(p) {
  const first = pfFirstTradeDate();
  if (!first) return null;
  const then = Date.parse(first + 'T00:00:00Z');
  if (!isFinite(then)) return null;
  const days = Math.max(0, Math.floor((Date.now() - then) / 864e5));
  if (days <= 1) return p.heldDay;
  if (days < 60) return p.heldDays.replace('{n}', String(days));
  if (days < 730) return p.heldMonths.replace('{n}', String(Math.round(days / 30.44)));
  return p.heldYears.replace('{n}', String(Math.round(days / 365.25)));
}

function pfBookXirr(target, value) {
  if (value == null || !(value > 0)) return null;
  const flows = [];
  pfLedger.forEach(function (e) {
    const amount = pfConvertThen(e.qty * e.price, e.cur, target, e.date);
    if (amount == null || !isFinite(amount)) return;
    flows.push({ t: Date.parse(e.date + 'T12:00:00Z'), v: e.side === 'sell' ? amount : -amount });
  });
  flows.push({ t: Date.now(), v: value });
  return pfXirr(flows);
}

function pfLedgerHtml(p) {
  const events = pfLedger.slice().sort(function (a, b) {
    return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
  });
  if (!events.length) return `<div class="pf-empty-sm">${esc(p.ledgerEmpty)}</div>`;
  const rows = events.map(function (e) {
    return `<tr class="${e.side === 'sell' ? 'is-sell' : 'is-buy'}">
        <td>${esc(e.date)}${e.opening ? `<span class="pf-tag">${esc(p.ledgerOpening)}</span>` : ''}</td>
        <td><span class="pf-side-chip ${e.side}">${esc(e.side === 'sell' ? p.sell : p.buy)}</span></td>
        <td class="pf-ledger-sym">${esc(e.symbol)}${e.note ? `<div class="pf-ledger-note">${esc(e.note)}</div>` : ''}</td>
        <td class="num">${e.qty.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
        <td class="num">${esc(pfPrice(e.price, e.cur))}</td>
        <td class="num">${esc(pfMoney(e.qty * e.price, e.cur))}</td>
        <td class="num"><button type="button" class="pf-remove" data-pf-del="${esc(e.id)}" aria-label="${esc(p.remove)}" title="${esc(p.remove)}">×</button></td>
      </tr>`;
  }).join('');
  return `<div class="pf-table-wrap"><table class="pf-table pf-ledger">
      <thead><tr>
        <th>${esc(p.colDate)}</th><th>${esc(p.colSide)}</th><th>${esc(p.colSym)}</th>
        <th class="num">${esc(p.colQty)}</th><th class="num">${esc(p.colPrice)}</th><th class="num">${esc(p.colValue)}</th><th></th>
      </tr></thead><tbody>${rows}</tbody>
    </table></div>`;
}
/* CSV for a spreadsheet rather than for the screen: plain numbers, no currency
   symbols, and a byte-order mark so Excel reads the Indonesian names right. */
function pfCsvCell(value) {
  if (value == null) return '';
  if (typeof value === 'number' && !isFinite(value)) return '';
  const text = String(value);
  return /[",;\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function pfDownloadCsv(name, rows) {
  const csv = rows.map(function (row) { return row.map(pfCsvCell).join(','); }).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
}

function pfExportHoldingsCsv() {
  const rows = [['Symbol', 'Name', 'Shares', 'Avg cost', 'Cost currency', 'Last', 'Value', 'Value currency', 'P/L', 'P/L %', 'Class']];
  portfolio.slice().sort(function (a, b) { return a.symbol.localeCompare(b.symbol); }).forEach(function (h) {
    const v = pfHoldingView(h);
    rows.push([
      h.symbol, (v.q && v.q.name) || '', h.shares,
      isFinite(h.avgCost) ? h.avgCost : '',
      h.avgCur || pfCurrency(h.symbol),
      isFinite(v.price) ? v.price : '',
      isFinite(v.value) ? v.value : '',
      v.target || '',
      isFinite(v.pl) ? v.pl : '',
      isFinite(v.plPct) ? v.plPct : '',
      pfClassOf(h.symbol)
    ]);
  });
  pfDownloadCsv('finwire-holdings-' + pfToday() + '.csv', rows);
}

function pfExportEventsCsv() {
  const rows = [['Date', 'Side', 'Symbol', 'Quantity', 'Price', 'Currency', 'Amount', 'Note']];
  pfLedger.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).forEach(function (e) {
    rows.push([e.date, e.side, e.symbol, e.qty, e.price, e.cur, e.qty * e.price, e.note || '']);
  });
  pfDownloadCsv('finwire-events-' + pfToday() + '.csv', rows);
}

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

/* ---- news buzz ------------------------------------------------
   What the market is talking about, not just what you own. The count runs
   over the stories this page already cached, so it needs no key, no request
   and no AI call: the explore board's own IDX and US pools are ranked by
   mentions over the last seven days, ten names a market. ---- */
