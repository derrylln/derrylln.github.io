/* ------------------------------------------------------------
   Portfolio quotes, fx conversion and holdings news
   ------------------------------------------------------------ */
function renderHoldingsNews() {
  const host = $('#pfNewsPanel'); if (!host) return;
  const p = (I18N[state.lang] || I18N.en).portfolio;
  if (!portfolio.length) {
    host.innerHTML = '';
    const row = host.closest ? host.closest('.pf-dash-row') : null;
    if (row) row.classList.add('pf-row-solo');
    return;
  }
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
  if (!items.length) {
    host.innerHTML = '';
    const row = host.closest ? host.closest('.pf-dash-row') : null;
    if (row) row.classList.add('pf-row-solo');
    return;
  }
  items.sort(function (x, y) { return (y.a.ts || 0) - (x.a.ts || 0); });
  const row = host.closest ? host.closest('.pf-dash-row') : null;
  if (row) row.classList.remove('pf-row-solo');
  host.innerHTML = `<section class="mkt-card pf-news-card">
    <div class="mkt-card-head">
      <div>
        <h2 class="mkt-title">${esc(p.newsTitle)}</h2>
        <p class="mkt-sub">${esc(p.newsSub)}</p>
      </div>
    </div>
    <ul class="pf-news-list">${items.slice(0, 5).map(function (it) {
      const a = it.a;
      const meta = [a.sourceLabel || 'FINWIRE', a.ts ? timeAgo(a.ts, state.lang) : ''].filter(Boolean).join(' · ');
      return `<li><a href="${esc(a.link || '#')}" target="_blank" rel="noopener noreferrer">
        <span class="pf-news-sym">${esc(it.symbol.replace(/\.JK$/i, ''))}</span>${esc(a.title || '')}</a>
        <span class="pf-news-meta">${esc(meta)}</span></li>`;
    }).join('')}</ul>
  </section>`;
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
    /* Yahoo names the listing; the trades follow it, so the ledger keeps the
       name the quote feed recognised. */
    pfLedger.forEach(function (e) { if (e.symbol === symbol) e.symbol = resolved; });
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
  const el = $('#pfPrice'); if (!el) return;
  const p = (I18N[state.lang] || I18N.en).portfolio;
  const cur = pfInputCurrency();
  const text = cur ? p.pricePh + ' (' + cur + ')' : p.pricePh;
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
