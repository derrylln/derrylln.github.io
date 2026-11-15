/* ------------------------------------------------------------
   Period building, the DCF model and its verdict
   ------------------------------------------------------------ */
function buildPeriods(series, kind) {
  const prefix = kind === 'annual' ? 'annual' : 'quarterly';
  const dates = {};
  ['TotalRevenue', 'NetIncome', 'DilutedEPS', 'FreeCashFlow', 'StockholdersEquity'].forEach(field => {
    (series[prefix + field] || []).forEach(point => { dates[point.date] = true; });
  });
  const at = (field, date) => (series[prefix + field] || []).filter(point => point.date === date)[0] || null;
  /* Only an exact date match counts: a share count from a neighbouring
     quarter would quietly make the derived figure look reported. */
  const sharesAt = date => at('OrdinarySharesNumber', date);
  const list = Object.keys(dates).sort().reverse().map(date => ({
    kind: kind === 'annual' ? 'FY' : 'Q',
    end: date,
    revenue: at('TotalRevenue', date),
    netIncome: at('NetIncome', date),
    equity: at('StockholdersEquity', date),
    eps: at('DilutedEPS', date),
    fcf: at('FreeCashFlow', date),
    shares: sharesAt(date)
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

/* INTRINSIC VALUE
   A five-year discounted cash flow on the free cash flow the company actually
   reported: grow it at its own past rate, discount at 9%, add a Gordon
   terminal value, divide by the shares outstanding. Every input is printed on
   the card, because the answer is only ever as good as they are. */
const FIN_DCF = { years: 5, discount: 0.09, terminal: 0.025, growthMin: -0.10, growthMax: 0.20, growthFallback: 0.06 };

function finAnnualOldestFirst(fund) {
  return (fund.annual || []).filter(function (p) { return p && p.end; })
    .slice().sort(function (a, b) { return String(a.end) < String(b.end) ? -1 : 1; });
}

/* Compound annual growth from the first to the last figure. A sign flip (FCF
   that went negative, say) is not a growth rate, so it returns null instead. */
function finCagr(values) {
  if (!values || values.length < 2) return null;
  if (values.some(function (v) { return !isFinite(v) || v <= 0; })) return null;
  const cagr = Math.pow(values[values.length - 1] / values[0], 1 / (values.length - 1)) - 1;
  return isFinite(cagr) ? cagr : null;
}

/* Market cap over price is the cleanest share count; diluted EPS is the
   fallback for a company with no trailing market cap in the feed. */
function finShares(fund, price, priceCur) {
  const cap = (fund.mktCap && isFinite(fund.mktCap.raw) && fund.mktCap.raw > 0) ? fund.mktCap.raw : null;
  const capCur = (fund.mktCap && fund.mktCap.currency) || fund.currency || null;
  const sameUnit = !priceCur || !capCur || priceCur === capCur;
  if (cap && price && isFinite(price) && price > 0 && sameUnit) return cap / price;
  const annual = finAnnualOldestFirst(fund);
  for (let i = annual.length - 1; i >= 0; i--) {
    const p = annual[i];
    if (p.netIncome && p.eps && isFinite(p.netIncome.raw) && isFinite(p.eps.raw) && p.eps.raw > 0) {
      return p.netIncome.raw / p.eps.raw;
    }
  }
  return null;
}

const finDcfEdits = {};   // symbol -> assumptions the reader typed

/* The model is the reported numbers; growth and discount are the guesses. One
   projection serves the point value, the band and the reverse solve, so the
   three can never drift apart. */
function finValue(model, growth, discount) {
  const terminal = Math.min(model.terminal, discount - 0.005);
  let flow = model.base, pv = 0;
  for (let year = 1; year <= model.years; year++) {
    flow *= 1 + growth;
    pv += flow / Math.pow(1 + discount, year);
  }
  const tvPv = (flow * (1 + terminal)) / (discount - terminal) / Math.pow(1 + discount, model.years);
  const enterprise = pv + tvPv;
  return {
    enterprise: enterprise,
    perShare: (enterprise - model.netDebt) / model.shares,
    tvShare: enterprise > 0 ? (tvPv / enterprise) * 100 : null
  };
}

function fundDcf(fund, price, priceCur, edits) {
  if (!fund) return null;
  const annual = finAnnualOldestFirst(fund);
  const e = edits || {};
  /* Reported cash flow is the default because it is the cleanest owner
     earnings for most companies, but for a bank it carries the balance sheet,
     so the same model can run on net income instead. */
  const basis = e.basis === 'ni' ? 'ni' : 'fcf';
  const field = basis === 'ni' ? 'netIncome' : 'fcf';
  const periods = annual.filter(function (p) { return p[field] && isFinite(p[field].raw); }).slice(-5);
  if (!periods.length) return { ok: false, reason: basis === 'ni' ? 'noNi' : 'noFcf', basis: basis };
  const basePeriod = periods[periods.length - 1];
  const base = basePeriod[field].raw;
  const currency = basePeriod[field].currency || fund.currency || null;
  if (!(base > 0)) return { ok: false, reason: basis === 'ni' ? 'negNi' : 'negFcf', basis: basis };
  const shares = finShares(fund, price, priceCur);
  if (!(shares > 0)) return { ok: false, reason: 'noShares' };

  /* The default growth is the company's own record rather than a hope: FCF
     CAGR over the reported years, revenue CAGR when FCF is too short or its
     sign flipped. */
  let growth = finCagr(periods.map(function (p) { return p[field].raw; }));
  let assumed = false, histYears = periods.length - 1;
  if (growth == null) {
    growth = finCagr(annual.map(function (p) { return (p.revenue && p.revenue.raw) || null; }));
    assumed = true;
    histYears = annual.length - 1;
  }
  if (growth == null) { growth = FIN_DCF.growthFallback; assumed = true; histYears = 0; }
  /* A short history can compound into a rate no company holds for five years,
     so the cap is part of the model and the card says when it bit. */
  const growthRaw = growth;
  const capped = growth > FIN_DCF.growthMax || growth < FIN_DCF.growthMin;
  const growthDefault = Math.min(FIN_DCF.growthMax, Math.max(FIN_DCF.growthMin, growth));

  /* Every figure the reader can change is an assumption, so each is read back
     on its own: a blank field falls back to the model's value for that field
     instead of emptying the whole calculation. */
  const g = isFinite(e.growth) ? e.growth : growthDefault;
  const r = (isFinite(e.discount) && e.discount > 0) ? e.discount : FIN_DCF.discount;
  const terminalRaw = isFinite(e.terminal) ? e.terminal : FIN_DCF.terminal;
  const years = Math.max(1, Math.min(15, isFinite(e.years) ? Math.round(e.years) : FIN_DCF.years));
  const invalid = !(r > 0) || terminalRaw >= r;
  const tg = invalid ? Math.min(terminalRaw, r - 0.005) : terminalRaw;

  /* Discounting gives an enterprise value. A share is worth that less the
     debt it answers for, or more when the company holds net cash, so the
     bridge to equity value belongs in the model rather than in a footnote. */
  const sameCurrency = function (c) { return !c || !currency || c === currency; };
  const debtRaw = (fund.debt && isFinite(fund.debt.raw)) ? fund.debt.raw : null;
  const cashRaw = (fund.cash && isFinite(fund.cash.raw)) ? fund.cash.raw : null;
  const hasBalance = (debtRaw != null || cashRaw != null) &&
    sameCurrency(fund.debt && fund.debt.currency) && sameCurrency(fund.cash && fund.cash.currency);
  const netDebt = hasBalance ? (debtRaw || 0) - (cashRaw || 0) : null;

  const model = { base: base, shares: shares, netDebt: netDebt || 0, terminal: tg, years: years };
  const valued = invalid ? null : finValue(model, g, r);
  const perShare = valued ? valued.perShare : null;
  const comparable = price && isFinite(price) && price > 0 && (!priceCur || !currency || priceCur === currency);

  /* Two things decide whether the answer is worth reading: how much of it is
     terminal value, and whether the cash flow it starts from is really cash
     the owners could take out. */
  const last = annual[annual.length - 1];
  const ni = (last && last.netIncome && isFinite(last.netIncome.raw)) ? last.netIncome.raw : null;

  return {
    ok: true, perShare: perShare, currency: currency, invalid: invalid,
    price: comparable ? price : null, priceCur: priceCur || currency,
    upside: (comparable && perShare != null) ? (perShare / price - 1) * 100 : null,
    base: base, baseYear: String(basePeriod.end).slice(0, 4),
    basis: basis, growthEdited: isFinite(e.growth),
    growth: g, growthRaw: growthRaw,
    assumed: assumed, capped: capped, histYears: histYears,
    discount: r, terminal: tg, years: years,
    shares: shares, netDebt: netDebt, model: model,
    tvShare: valued ? valued.tvShare : null,
    cashAboveProfit: basis === 'fcf' && !!(ni && base > ni * 1.05)
  };
}

/* VALUATION VERDICT
   A single point is a guess wearing a number, so the verdict rests on a band:
   nine valuations across three discount rates and three growth rates. Only
   when every one of them sits clear of the price by the margin below does the
   card commit to a word. */
const FIN_BAND = {
  discounts: [-0.01, 0, 0.01], growthSteps: [-0.02, 0, 0.02],
  edge: 0.15, impliedMin: -0.5, impliedMax: 1.5
};

function finDcfBand(dcf) {
  if (!dcf || !dcf.ok || !(dcf.price > 0)) return null;
  const rows = [], seen = Object.create(null);
  FIN_BAND.growthSteps.forEach(function (step) {
    const growth = Math.min(FIN_DCF.growthMax, Math.max(FIN_DCF.growthMin, dcf.growth + step));
    /* A capped row can land on the same rate as its neighbour: one row each. */
    const key = growth.toFixed(9);
    if (seen[key]) return;
    seen[key] = 1;
    const current = Math.abs(growth - dcf.growth) < 1e-9;
    const cells = FIN_BAND.discounts.map(function (offset) {
      const discount = Math.max(0.01, dcf.discount + offset);
      const value = finValue(dcf.model, growth, discount).perShare;
      return {
        discount: discount, value: value,
        side: value >= dcf.price * (1 + FIN_BAND.edge) ? 'under'
          : value <= dcf.price / (1 + FIN_BAND.edge) ? 'over' : 'mid',
        spot: current && offset === 0
      };
    });
    rows.push({ growth: growth, current: current, cells: cells });
  });
  if (!rows.length) return null;
  const values = rows.reduce(function (all, row) {
    return all.concat(row.cells.map(function (cell) { return cell.value; }));
  }, []);
  return {
    rows: rows,
    verdict: Math.min.apply(null, values) >= dcf.price * (1 + FIN_BAND.edge) ? 'under'
      : Math.max.apply(null, values) <= dcf.price / (1 + FIN_BAND.edge) ? 'over' : 'none'
  };
}

/* The price read backwards: the growth that, held for the same horizon at the
   same discount rate, makes the model return exactly today's price. Value is
   monotone in growth, so bisection is enough. */
function finImpliedGrowth(dcf) {
  if (!dcf || !dcf.ok || !(dcf.price > 0)) return null;
  const at = function (growth) { return finValue(dcf.model, growth, dcf.discount).perShare; };
  if (at(FIN_BAND.impliedMax) < dcf.price) return { value: FIN_BAND.impliedMax, above: true, below: false };
  if (at(FIN_BAND.impliedMin) > dcf.price) return { value: FIN_BAND.impliedMin, above: false, below: true };
  let lo = FIN_BAND.impliedMin, hi = FIN_BAND.impliedMax;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < dcf.price) lo = mid; else hi = mid;
  }
  return { value: (lo + hi) / 2, above: false, below: false };
}

function finVerdictHtml(dcf, t) {
  const band = finDcfBand(dcf);
  const implied = finImpliedGrowth(dcf);
  if (!band || !implied) return '';
  const pct = function (v) { return (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%'; };
  const impliedText = implied.above ? t.vMore : implied.below ? t.vLess : pct(implied.value);
  const record = dcf.histYears > 0 ? t.vRecord(pct(dcf.growthRaw), dcf.histYears) : t.vRecordNone;
  /* A bank's reported cash flow is not owner earnings, so the band can look
     decisive for the wrong reason. The card refuses a word there and says why. */
  const suspect = dcf.cashAboveProfit && dcf.basis === 'fcf';
  const verdict = suspect ? 'none' : band.verdict;
  const why = suspect ? t.vSuspectWhy
    : verdict === 'under' ? t.vUnderWhy
    : verdict === 'over' ? t.vOverWhy : t.vNoneWhy;
  const label = verdict === 'under' ? t.vUnder : verdict === 'over' ? t.vOver : t.vNone;
  const head = '<tr><th>' + esc(t.vGrowthRow) + '</th>' +
    band.rows[0].cells.map(function (cell) { return '<th>' + (cell.discount * 100).toFixed(1) + '%</th>'; }).join('') + '</tr>';
  const body = band.rows.map(function (row) {
    const lead = '<td>' + (row.growth * 100).toFixed(1) + '%' + (row.current ? ' <em>' + esc(t.vSpot) + '</em>' : '') + '</td>';
    return '<tr>' + lead + row.cells.map(function (cell) {
      return '<td class="is-' + cell.side + (cell.spot ? ' is-spot' : '') + '">' + esc(finMoney(cell.value, dcf.currency)) + '</td>';
    }).join('') + '</tr>';
  }).join('');
  return '<section class="fin-verdict" id="finVerdict">' +
    '<div class="fin-verdict-head"><h3>' + esc(t.vTitle) + '</h3>' +
      '<span class="fin-verdict-badge is-' + verdict + '">' + esc(label) + '</span></div>' +
    '<p class="fin-verdict-line" id="finVerdictLine"><b>' + esc(impliedText) + '</b> · ' + esc(record) + '</p>' +
    '<p class="fin-verdict-say" id="finVerdictSay">' + esc(why) + '</p>' +
    '<div class="fin-band-wrap"><table class="fin-band">' +
      '<caption>' + esc(t.vBand) + '</caption><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' +
    '<p class="fin-verdict-note">' + esc(t.vNote) + '</p></section>';
}

/* Rebuilt whenever the assumptions change, since the band is centred on them. */
function paintFinVerdict(dcf) {
  const slot = document.getElementById('finVerdictSlot');
  if (!slot) return;
  slot.innerHTML = dcf ? finVerdictHtml(dcf, finT()) : '';
}

function finMoney(raw, currency) {
  if (!isFinite(raw)) return '—';
  const prefix = currency === 'IDR' ? 'Rp ' : currency === 'USD' ? '$' : (currency ? currency + ' ' : '');
  const digits = currency === 'IDR' ? 0 : 2;
  return prefix + raw.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function finDcfHtml(dcf, t) {
  if (!dcf) return '';
  const head = '<div class="fin-dcf-head"><h3>' + esc(t.dcfTitle) + '</h3>' +
    '<div class="fin-dcf-head-side"><span class="fin-dcf-tag">DCF' +
      (dcf.ok && dcf.currency ? ' · ' + esc(dcf.currency) : '') + '</span>' +
      (dcf.ok ? '<button type="button" class="fin-dcf-reset" data-dcf-reset>' + esc(t.dcfReset) + '</button>' : '') +
    '</div></div>';
  const basisBtn = function (id, label) {
    const on = dcf.basis === id;
    return '<button type="button" data-dcf-basis="' + id + '" class="' + (on ? 'active' : '') +
      '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + '</button>';
  };
  const basisHtml = '<div class="fin-dcf-basis"><span class="fin-dcf-basis-label">' + esc(t.dcfBasis) + '</span>' +
    '<div class="fin-seg" role="group" aria-label="' + esc(t.dcfBasis) + '">' +
      basisBtn('fcf', t.dcfFcf) + basisBtn('ni', t.dcfNi) +
    '</div></div>';
  if (!dcf.ok) {
    const why = dcf.reason === 'negFcf' ? t.dcfNegFcf
      : dcf.reason === 'negNi' ? t.dcfNegNi
      : dcf.reason === 'noShares' ? t.dcfNoShares
      : dcf.reason === 'noNi' ? t.dcfNoNi : t.dcfNoFcf;
    return '<section class="fin-dcf is-na">' + head + basisHtml +
      '<p class="fin-dcf-empty">' + esc(why) + '</p></section>';
  }
  const row = function (label, value, cls) {
    return '<div class="fin-dcf-row' + (cls ? ' ' + cls : '') + '"><span>' + esc(label) + '</span>' +
      '<b>' + esc(value) + '</b></div>';
  };
  const inputRow = function (label, key, value, unit, max, extra) {
    return '<div class="fin-dcf-row is-input"><span>' + esc(label) + '</span>' +
      '<label class="fin-dcf-field"><input type="number" inputmode="decimal" data-dcf="' + key + '"' +
      ' step="' + (key === 'years' ? '1' : '0.1') + '" min="' + (key === 'terminal' ? '-5' : key === 'years' ? '1' : key === 'growth' ? '-50' : '0.1') + '"' +
      (max ? ' max="' + max + '"' : '') + ' value="' + esc(String(value)) + '" />' +
      (unit ? '<i>' + unit + '</i>' : '') + '</label>' + (extra || '') + '</div>';
  };
  const up = dcf.upside;
  const tone = up == null ? '' : up >= 0 ? 'up' : 'down';
  const growthText = (dcf.growth * 100).toFixed(1);
  return '<section class="fin-dcf" id="finDcf">' + head + basisHtml +
    '<div class="fin-dcf-main"><div><span class="fin-dcf-label">' + esc(t.dcfValue) + '</span>' +
    '<strong class="fin-dcf-value" id="finDcfValue">' +
      esc(dcf.perShare == null ? '—' : finMoney(dcf.perShare, dcf.currency)) + '</strong></div>' +
    (dcf.price == null ? '' : '<div class="fin-dcf-gap ' + tone + '" id="finDcfGap"></div>') +
    '</div>' +
    '<div class="fin-dcf-rows">' +
      row(dcf.basis === 'ni' ? t.dcfBaseNi : t.dcfBaseFcf, compactNum(dcf.base, dcf.currency) + ' · FY' + dcf.baseYear) +
      row(t.dcfShares, compactNum(dcf.shares, '')) +
      inputRow(t.dcfGrowth, 'growth', growthText, '% per year', null,
        '<em class="fin-dcf-hint" id="finDcfGrowthHint"></em>') +
      inputRow(t.dcfDiscount, 'discount', (dcf.discount * 100).toFixed(1), '%', null) +
      inputRow(t.dcfTerminal, 'terminal', (dcf.terminal * 100).toFixed(1), '%', null) +
      inputRow(t.dcfYears, 'years', dcf.years, '', 15) +
      row(dcf.netDebt != null && dcf.netDebt < 0 ? t.dcfNetCash : t.dcfNetDebt,
        dcf.netDebt == null ? '—' : compactNum(Math.abs(dcf.netDebt), dcf.currency), 'is-bridge') +
    '</div>' +
    '<p class="fin-dcf-note fin-dcf-warn" id="finDcfWarn"></p>' +
    '<p class="fin-dcf-note" id="finDcfTv"></p>' +
    '<p class="fin-dcf-note" id="finDcfNote">' + esc(finDcfCaveat(dcf)) + '</p></section>';
}

/* One caveat per card: the model it used, then — only when this company's
   cash flow really does run ahead of its profit — the reason to distrust it. */
function finDcfCaveat(dcf) {
  const t = finT();
  const base = (dcf.basis === 'ni' ? t.dcfNoteNi : t.dcfNote)(dcf.years);
  return dcf.cashAboveProfit ? base + ' ' + t.dcfCashCaveat : base;
}

/* The growth field defaults to a cap, not to the record it was cut from, so
   the card says the raw rate out loud next to the number. */
function finGrowthNote(dcf) {
  const t = finT();
  if (dcf.assumed) return t.dcfAssumed + (dcf.histYears > 0 ? ' · ' + t.dcfSpan(dcf.histYears) : '');
  if (dcf.capped) return t.dcfCapNote((Math.round(dcf.growthRaw * 1000) / 10).toFixed(1), dcf.histYears);
  return '';
}

/* Recompute from the inputs and patch only the numbers, so typing never
   re-renders the card and never steals the focus of the field being used. */
function finDcfPatch(dcf) {
  if (!dcf || !dcf.ok) return;
  const t = finT();
  const val = document.getElementById('finDcfValue');
  if (val) val.textContent = dcf.perShare == null ? '—' : finMoney(dcf.perShare, dcf.currency);
  const gap = document.getElementById('finDcfGap');
  if (gap) {
    const up = dcf.upside;
    gap.className = 'fin-dcf-gap ' + (up == null ? '' : up >= 0 ? 'up' : 'down');
    gap.innerHTML = up == null ? '' : '<b>' + (up >= 0 ? '+' : '') + up.toFixed(1) + '%</b>' +
      '<span>' + esc(t.dcfVs) + ' ' + esc(finMoney(dcf.price, dcf.priceCur)) + '</span>';
  }
  const warn = document.getElementById('finDcfWarn');
  if (warn) warn.textContent = dcf.invalid ? t.dcfBadTerminal : '';
  const tv = document.getElementById('finDcfTv');
  if (tv) tv.textContent = dcf.tvShare == null ? '' : t.dcfTv(Math.round(dcf.tvShare));
  const hint = document.getElementById('finDcfGrowthHint');
  if (hint) hint.textContent = dcf.growthEdited ? '' : finGrowthNote(dcf);
  /* The caveat names the base and the horizon, both of which change here. */
  const note = document.getElementById('finDcfNote');
  if (note) note.textContent = finDcfCaveat(dcf);
}

function finDcfRecalc() {
  const card = document.getElementById('finDcf');
  if (!card || !finState.fund) return;
  const edits = {};
  [['growth', 100], ['discount', 100], ['terminal', 100], ['years', 1]].forEach(function (pair) {
    const el = card.querySelector('[data-dcf="' + pair[0] + '"]');
    const v = el ? parseFloat(el.value) : NaN;
    if (isFinite(v)) edits[pair[0]] = v / pair[1];
  });
  const prev = finDcfEdits[finState.symbol];
  if (prev && prev.basis) edits.basis = prev.basis;
  finDcfEdits[finState.symbol] = edits;
  const quote = finState.quote || {};
  const dcf = fundDcf(finState.fund, quote.price, quote.currency, edits);
  finDcfPatch(dcf);
  paintFinVerdict(dcf);
}

function paintDcfSlot() {
  const slot = document.getElementById('finDcfSlot');
  if (!slot || !finState.fund) return;
  const quote = finState.quote || {};
  const dcf = fundDcf(finState.fund, quote.price, quote.currency, finDcfEdits[finState.symbol]);
  slot.innerHTML = finDcfHtml(dcf, finT());
  finDcfPatch(dcf);
  paintFinVerdict(dcf);
}

function finDcfReset() {
  delete finDcfEdits[finState.symbol];
  paintDcfSlot();
}

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
