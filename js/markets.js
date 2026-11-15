/* ------------------------------------------------------------
   The explore board
   ------------------------------------------------------------ */
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
            <h2 class="mkt-title">${esc(m.worldTitle)}</h2>
            <p class="mkt-sub">${esc(m.worldSub)}</p>
          </div>
          <div class="mkt-seg" id="worldSeg" role="group">
            <button type="button" data-set="region"${worldSort === 'region' ? ' class="active"' : ''}>${esc(m.worldSortRegion)}</button>
            <button type="button" data-set="move"${worldSort === 'move' ? ' class="active"' : ''}>${esc(m.worldSortMove)}</button>
          </div>
        </div>
        <div id="worldBoard"><div class="pf-empty-sm">${esc(m.worldLoading)}</div></div>
      </section>

      <section class="mkt-card">
        <div class="mkt-card-head">
          <div>
            <h2 class="mkt-title">${esc(m.buzzTitle)}</h2>
            <p class="mkt-sub">${esc(m.buzzSub)}</p>
          </div>
        </div>
        <div id="buzzBoard"></div>
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

  /* The board's own names are the candidates for the mention ranking, so it
     learns the company names it can then look for in the news. */
  buzzRememberNames(allData);
  renderBuzzBoard();

  /* The world board is not part of the dashboard's own quote sweep: it has
     its own cache and its own ten-minute life, and it only starts here
     because this is the moment the view is actually on screen. */
  loadWorldBoard();

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
  bindSeg('worldSeg', function (set) {
    worldSort = set === 'move' ? 'move' : 'region';
    try { localStorage.setItem(WORLD_SORT_KEY, worldSort); } catch (e) {}
    paintWorldBoard();
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
