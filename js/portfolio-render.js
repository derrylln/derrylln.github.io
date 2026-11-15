/* ------------------------------------------------------------
   Painting the portfolio page
   ------------------------------------------------------------ */
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
    /* The line rebases on a day this card cannot know until the history
       lands, so the sub-line names that day rather than saying "the period". */
    const sub = document.getElementById('pfPerfSub');
    if (sub) {
      const locale = state.lang === 'id' ? 'id-ID' : 'en-GB';
      /* The base is a calendar day from the feed, so format it in UTC: in a
         timezone behind it the same day would otherwise print as the day before. */
      sub.textContent = (data && data.baseDate)
        ? p.perfSubOn.replace('{date}', new Date(data.baseDate + 'T00:00:00Z').toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }))
        : p.perfSub;
    }
    paint(document.getElementById('pfTrendPort'), data ? data.portPct : null);
    PF_BENCH.forEach(function (b) {
      const chip = document.querySelector('#pfTrendLegend [data-pf-bench="' + b.id + '"]');
      if (!chip) return;
      const hit = data && data.benches.filter(function (x) { return x.id === b.id; })[0];
      paint(chip.querySelector('b'), hit ? hit.pct : null);
    });
    const riskSlot = document.getElementById('pfRiskBlock');
    if (riskSlot) riskSlot.innerHTML = data ? pfRiskHtml(data, target) : '';
    if (!data) {
      node.innerHTML = `<div class="pf-empty-sm">${esc(p.trendEmpty)}</div>`;
      return;
    }
    if (typeof ApexCharts === 'undefined') return;
    if (pfTrendChart) { try { pfTrendChart.destroy(); } catch (e) {} pfTrendChart = null; }
    node.innerHTML = '';
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    /* The chart sits in a column that is as tall as the card beside it, so it
       is drawn at whatever height that column actually has. Drawn at a fixed
       196 inside a 600px card, the difference is a blank band under the line. */
    const chartH = Math.max(200, Math.round(node.clientHeight) || 200);
    const series = [{ name: p.portfolio, data: data.portIdx }].concat(data.benches.map(function (b) {
      return { name: b.label, data: b.idx };
    }));
    pfTrendChart = new ApexCharts(node, {
      series: series,
      chart: { type: 'line', height: chartH, toolbar: { show: false }, fontFamily: 'Inter', zoom: { enabled: false }, background: 'transparent' },
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
    if (!window.__pfTrendResize) {
      window.__pfTrendResize = true;
      window.addEventListener('resize', function () {
        const host = document.getElementById('pfTrendChart');
        if (!pfTrendChart || !host) return;
        const h = Math.max(200, Math.round(host.clientHeight) || 200);
        try { pfTrendChart.updateOptions({ chart: { height: h } }, false, false); } catch (e) {}
      });
    }
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
            <select id="pfSide" class="pf-side" aria-label="${esc(p.colSide)}">
              <option value="buy">${esc(p.buy)}</option><option value="sell">${esc(p.sell)}</option>
            </select>
            <input id="pfQty" type="number" min="0" step="any" inputmode="decimal" placeholder="${esc(p.qtyPh)}" aria-label="${esc(p.qtyPh)}" />
            <div class="pf-cost">
              <input id="pfPrice" type="number" min="0" step="any" inputmode="decimal" placeholder="${esc(p.pricePh)}" aria-label="${esc(p.pricePh)}" />
              <div class="pf-cost-cur" id="pfCostCur" role="group" aria-label="${esc(p.costIn)}" title="${esc(p.costIn)}">
                <button type="button" data-pf-in="auto">${esc(p.curAuto)}</button>
                <button type="button" data-pf-in="USD">USD</button>
                <button type="button" data-pf-in="IDR">IDR</button>
              </div>
            </div>
            <input id="pfDate" type="date" class="pf-date" value="${pfToday()}" aria-label="${esc(p.colDate)}" />
            <input id="pfNote" type="text" class="pf-note-input" maxlength="140" spellcheck="false" placeholder="${esc(p.notePh)}" aria-label="${esc(p.notePh)}" />
            <button type="submit">${esc(p.add)}</button>
          </form>
          <div id="pfMsg" class="pf-msg"></div>
        </section>
        <div id="portfolioBody"></div>
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
  const xirr = pfBookXirr(primaryCur, book.value);
  const xirrClass = xirr == null ? '' : (xirr >= 0 ? 'up' : 'down');
  const xirrText = xirr == null ? '—' : pfPctText(xirr * 100);
  /* Beside the annualised rate, the time it is annualised over. */
  const heldText = pfHeldText(p);
  const heldFirst = pfFirstTradeDate();
  const heldTitle = heldFirst
    ? p.heldSince.replace('{date}', new Date(heldFirst + 'T00:00:00Z').toLocaleDateString(
        state.lang === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }))
    : '';
  const heroStats = `<div class="pf-hero-stats">
      <span><em>${esc(p.invested)}</em><strong>${book.costed ? pfMoney(book.cost, primaryCur) : '—'}</strong></span>
      <span><em>${esc(p.today)}</em><strong class="${dayClass}">${book.dayed ? pfSignedMoney(book.day, primaryCur) + '<i>' + pfPctText(bookDayPct) + '</i>' : '—'}</strong></span>
      <span><em>${esc(p.xirr)}</em><strong class="${xirrClass}">${xirrText}</strong></span>
      ${heldText ? `<span title="${esc(heldTitle)}"><em>${esc(p.held)}</em><strong>${esc(heldText)}</strong></span>` : ''}
    </div>
    <p class="pf-xirr-note">${esc(p.xirrNote)}</p>`;

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
    <div class="pf-band"><span>${esc(p.bandOverview)}</span></div>

    <div class="pf-dash-row pf-row-a">
<section class="mkt-card">
        <div class="mkt-card-head">
          <div>
            <h2 class="mkt-title">${esc(p.perfTitle)}<span class="pf-cur-badge">${esc(primaryCur)}</span></h2>
            <p class="mkt-sub" id="pfPerfSub">${esc(p.perfSub)}</p>
            <div class="pf-hero-value">${book.priced ? pfMoney(book.value, primaryCur) : '—'}</div>
            ${heroDelta}
          </div>
          <div class="mkt-seg" id="pfRangeSeg" role="group">${rangeChips}</div>
        </div>
        ${heroStats}
        <div class="mkt-legend" id="pfTrendLegend">
          <span class="mkt-legend-item"><i class="mkt-dot pf"></i>${esc(p.portfolio)} <b id="pfTrendPort">—</b></span>
          ${benchChipsHtml}
        </div>
        <div id="pfTrendChart"><div class="pf-empty-sm">${esc(p.loadingTrend)}</div></div>
        <p class="pf-chart-note">${chartNote}</p>
      </section>

      <div class="pf-side">
<section class="mkt-card">
        <div class="mkt-card-head">
          <div>
            <h2 class="mkt-title">${esc(p.allocTitle)}<span class="pf-cur-badge">${esc(primaryCur)}</span></h2>
            <p class="mkt-sub">${esc(p.allocSub)}</p>
          </div>
        </div>
        ${pfAllocationHtml(views, primaryCur)}
        <div class="pf-sub-block">
          <div class="pf-sub-head"><span>${esc(p.moveTitle)}</span><em>${esc(p.moveSub)}</em></div>
          <div class="pf-move-body">${pfMoveHtml(views, primaryCur)}</div>
        </div>
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
    </div>

    <div class="pf-dash-row pf-row-b">
<section class="mkt-card">
      <div class="mkt-card-head">
        <div>
          <h2 class="mkt-title">${esc(p.goalTitle)}<span class="pf-cur-badge">${esc(primaryCur)}</span></h2>
          <p class="mkt-sub">${esc(p.goalSub)}</p>
        </div>
      </div>
      <div id="pfGoalSlot">${pfGoalHtml(primaryCur)}</div>
    </section>


    </div>

<section class="mkt-card">
      <div class="mkt-card-head">
        <div>
          <h2 class="mkt-title">${esc(p.riskCardTitle)}</h2>
          <p class="mkt-sub">${esc(p.riskCardSub)}</p>
        </div>
      </div>
      <div id="pfRiskBlock" class="pf-risk-block"></div>
    </section>



        <div class="pf-band"><span>${esc(p.bandHoldings)}</span></div>

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
    </section>

    <section class="mkt-card">
      <div class="mkt-card-head">
        <div>
          <h2 class="mkt-title">${esc(p.divTitle)}<span class="pf-cur-badge">${esc(primaryCur)}</span></h2>
          <p class="mkt-sub">${esc(p.divSub)}</p>
        </div>
      </div>
      <div id="pfDivSlot"></div>
    </section>

        <div class="pf-band"><span>${esc(p.bandRecord)}</span></div>

    <div class="pf-dash-row pf-row-c">
<section class="mkt-card">
      <div class="mkt-card-head">
        <div>
          <h2 class="mkt-title">${esc(p.ledgerTitle)}</h2>
          <p class="mkt-sub">${esc(p.ledgerSub)}</p>
        </div>
        <div class="pf-export-group">
          <button type="button" class="pf-export" data-pf-export="holdings">${esc(p.exportHoldings)}</button>
          <button type="button" class="pf-export" data-pf-export="events">${esc(p.exportEvents)}</button>
        </div>
      </div>
      ${pfLedgerHtml(p)}
    </section>

      <div id="pfNewsPanel" class="pf-news-slot"></div>
    </div>`;

  pfActTarget = primaryCur;
  pfDivTarget = primaryCur;
  paintPfDividendIncome();
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

async function addHolding(rawSymbol, rawQty, rawPrice, rawCur, rawSide, rawDate, rawNote) {
  const p = (I18N[state.lang] || I18N.en).portfolio;
  const symbol = String(rawSymbol == null ? '' : rawSymbol).toUpperCase().replace(/\s+/g, '');
  const qty = Number(String(rawQty == null ? '' : rawQty).replace(/,/g, ''));
  const price = Number(String(rawPrice == null ? '' : rawPrice).replace(/,/g, ''));
  const side = rawSide === 'sell' ? 'sell' : 'buy';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(rawDate)) ? String(rawDate) : pfToday();
  const fixedCur = (rawCur === 'USD' || rawCur === 'IDR') ? rawCur : null;

  if (!/^[A-Z0-9.^=-]{1,15}$/.test(symbol)) { pfMessage = p.invalidSym; renderPortfolio(); return; }
  if (!isFinite(qty) || qty <= 0) { pfMessage = p.invalidQty; renderPortfolio(); return; }
  if (!isFinite(price) || price < 0) { pfMessage = p.invalidCost; renderPortfolio(); return; }
  if (date > pfToday()) { pfMessage = p.invalidDate; renderPortfolio(); return; }

  pfMessage = '';
  /* With "Auto" the ticker is resolved first, so a bare IDX symbol such as
     CUAN is read in rupiah instead of being taken for dollars. */
  let hit = null, resolved = symbol, tradeCur = fixedCur;
  const lookup = function () { return fixedCur === 'IDR' ? pfLookupIdr(symbol) : pfLookup(symbol); };
  if (!tradeCur) {
    hit = await lookup();
    if (hit) { resolved = hit.symbol; tradeCur = pfQuoteCurrency(hit.quote, hit.symbol); }
    else tradeCur = pfCurrency(symbol);
  }

  /* A sell has to have something behind it, or the average cost would divide
     by a position that never existed. */
  if (side === 'sell') {
    const held = pfHeldShares(resolved);
    if (qty > held + 1e-9) {
      pfMessage = (p.invalidSell || '').replace('{qty}', held.toLocaleString('en-US', { maximumFractionDigits: 4 })).replace('{sym}', resolved);
      renderPortfolio();
      return;
    }
  }

  const note = String(rawNote == null ? '' : rawNote);
  pfLedger.push(pfEvent({ side: side, symbol: resolved, qty: qty, price: price, cur: tradeCur, date: date, note: note }));
  pfLogActivity({ action: side === 'sell' ? 'sell' : 'add', symbol: resolved, shares: qty, price: price, currency: tradeCur, date: date, note: note });

  savePortfolio();
  ['#pfSymbol', '#pfQty', '#pfPrice', '#pfNote'].forEach(function (sel) { const el = $(sel); if (el) el.value = ''; });
  renderPortfolio();

  if (!hit) hit = await lookup();
  if (hit) pfApplyQuote(resolved, hit);
  else { pfMarkFailed(resolved); pfMessage = (p.notFound || '').replace('{sym}', symbol); }
  saveJSON(PF.quotes, pfQuotes);
  if (pfNeedsFx() && !pfRate()) await refreshFxRate();
  renderPortfolio();
}

/* Removing a holding removes its trades: with the ledger as the source of
   truth there is nowhere else for a position to hide. */
function removeHolding(symbol) {
  const held = portfolio.filter(function (h) { return h.symbol === symbol; })[0];
  if (!held) return;
  pfLogActivity({ action: 'remove', symbol: symbol, shares: held.shares, price: held.avgCost, currency: held.avgCur || pfCurrency(symbol) });
  pfLedger = pfLedger.filter(function (e) { return e.symbol !== symbol; });
  savePortfolio();
  renderPortfolio();
}

function removeTrade(id) {
  const before = pfLedger.length;
  pfLedger = pfLedger.filter(function (e) { return e.id !== id; });
  if (pfLedger.length === before) return;
  pfLogActivity({ action: 'remove', symbol: '—', shares: 0, price: 0, currency: 'USD' });
  savePortfolio();
  renderPortfolio();
}

/* DATA LOADING & BINDING */
