/* ------------------------------------------------------------
   The news page: ticker, cards, filters and view switching
   ------------------------------------------------------------ */
async function fetchTicker() {
  const settled = await Promise.allSettled(TICKERS.map(async (t) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t.symbol)}?interval=1d&range=5d`;
    const raw = await fetchViaProxy(url, { timeout: 6000 }); const data = JSON.parse(raw);
    const result = data?.chart?.result?.[0];
    const meta = result?.meta; if (!meta) throw new Error('No price');
    
    let price = meta.regularMarketPrice;
    let prev = meta.chartPreviousClose;
    const quotes = result.indicators?.quote?.[0]?.close || [];
    const validQuotes = quotes.filter(q => q !== null && q !== undefined);
    if (validQuotes.length >= 2) prev = validQuotes[validQuotes.length - 2];
    
    return { label: t.label, symbol: t.symbol, price: price, change: prev ? ((price - prev) / prev) * 100 : 0 };
  }));
  const cached = loadJSON(LS.ticker, null); const cachedMap = {};
  if (cached?.items) cached.items.forEach(it => { cachedMap[it.symbol] = it; });
  return settled.map((res, i) => res.status === 'fulfilled' ? res.value : (cachedMap[TICKERS[i].symbol] || { label: TICKERS[i].label, symbol: TICKERS[i].symbol, price: null, change: null }));
}

function renderTicker(items) {
  const track = $('#tickerTrack'); if (!track || !items || !items.length) return;
  const locale = state.lang === 'id' ? 'id-ID' : 'en-US';
  const unit = items.map(t => {
    let priceTxt = typeof t.price === 'number' ? t.price.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: t.price >= 1000 ? 2 : 4 }) : '—';
    let changeTxt = '—', dir = 'flat';
    if (typeof t.change === 'number' && isFinite(t.change)) {
      dir = t.change > 0 ? 'up' : (t.change < 0 ? 'down' : 'flat');
      changeTxt = (dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : '') + Math.abs(t.change).toFixed(2) + '%';
    }
    return `<span class="tk"><span class="tk-sym">${esc(t.label)}</span><span class="tk-price">${esc(priceTxt)}</span><span class="tk-chg ${dir}">${esc(changeTxt)}</span></span>`;
  }).join('');
  track.style.animation = 'none'; track.innerHTML = unit;
  const singleWidth = track.scrollWidth || 1, viewport = window.innerWidth || 1280; let reps = 1;
  while (singleWidth * reps < viewport * 1.6 && reps < 24) reps++;
  track.innerHTML = unit.repeat(reps) + unit.repeat(reps);
  track.style.animationDuration = Math.max(35, reps * items.length * 5) + 's';
  void track.offsetWidth; track.style.animation = '';
}

function matchWatch(article) {
  if (!state.watch.length) return false;
  const haystack = (article.title + ' ' + article.summary).toLowerCase();
  return state.watch.some(kw => kw && haystack.indexOf(kw.toLowerCase()) !== -1);
}

function cardHTML(article, variant) {
  const t = I18N[state.lang]; const isRead = state.read.has(article.link); const isHit = matchWatch(article);
  const classes = ['card', variant || 'grid', isRead ? 'read' : 'unread', isHit ? 'hit' : ''].filter(Boolean).join(' ');
  const thumbInner = article.image ? `<img src="${esc(article.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : '';
  const thumb = `<span class="thumb" style="--cat:${esc(article.color)}"><span class="thumb-fb">${esc(article.sourceLabel)}</span>${thumbInner}</span>`;
  const summary = (variant !== 'side' && article.summary) ? `<p class="summary">${esc(article.summary)}</p>` : '';
  const watchBadge = isHit ? `<span class="badge-watch">${esc(t.watch)}</span>` : '';
  const dot = isRead ? '' : '<span class="unread-dot" aria-hidden="true"></span>';
  
  const hash = article.link.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0); 

  return `<div class="${classes}" data-url="${esc(article.link)}">
    ${thumb}
    <div class="card-body">
      <div class="meta"><span class="src">${esc(article.sourceLabel)}</span><span class="sep">•</span><time class="ago" data-ts="${article.ts}">${esc(timeAgo(article.ts, state.lang))}</time>${watchBadge}</div>
      <h2 class="headline"><a href="${esc(article.link)}" target="_blank" rel="noopener noreferrer">${esc(article.title)}</a></h2>
      ${summary}
      
      <button class="ai-btn" data-text="${esc(article.title + '. ' + article.summary)}" data-target="ai-${hash}">
        ✨ AI Summary
      </button>
      <div class="ai-summary-box" id="ai-${hash}"></div>
    </div>
    ${dot}</div>`;
}

function currentArticles() {
  // The news page only ever shows the last 48 hours, however much is cached.
  const cutoff = Date.now() - NEWS_MAX_AGE_MS;
  let list = state.articles.filter(a => a.ts >= cutoff);
  if (state.filter !== 'all') list = list.filter(a => a.sourceId === state.filter);
  if (state.region !== 'all') {
    list = list.filter(function (a) {
      const source = SOURCE_BY_ID[a.sourceId];
      return source && source.region === state.region;
    });
  }
  if (state.categoryFilter !== 'all') list = list.filter(a => a.category === state.categoryFilter);
  if (state.unreadOnly) list = list.filter(a => !state.read.has(a.link));
  return list;
}

function render() {
  renderBuzzBoard();
  renderHoldingsNews();
  const heroEl = $('#hero'), gridEl = $('#grid'), t = I18N[state.lang]; const list = currentArticles();
  if (!list.length) { if (heroEl) heroEl.innerHTML = ''; if (gridEl) gridEl.innerHTML = `<div class="empty">${esc(t.noArticles)}</div>`; return; }
  
  let heroIndex = 0; 
  
  const hero = list[heroIndex]; const rest = list.slice(0, heroIndex).concat(list.slice(heroIndex + 1));
  const side = rest.slice(0, 4), grid = rest.slice(4);
  if (heroEl) heroEl.innerHTML = `<div class="hero-main">${cardHTML(hero, 'hero')}</div><div class="hero-side">${side.map(a => cardHTML(a, 'side')).join('')}</div>`;
  if (gridEl) gridEl.innerHTML = grid.map(a => cardHTML(a, 'grid')).join('');
}

function refreshTimes() {
  $$('.ago[data-ts]').forEach(el => { const ts = parseInt(el.getAttribute('data-ts'), 10); if (!isNaN(ts)) el.textContent = timeAgo(ts, state.lang); });
  if (state.lastTs) updateStatusLabel(state.lastKind || 'live', state.lastTs);
}

function updateStatusLabel(kind, ts) {
  const el = $('#status'); if (!el) return; const t = I18N[state.lang];
  if (kind === 'loading') { el.className = 'status loading'; el.textContent = t.loading; return; }
  if (kind === 'error') { el.className = 'status stale'; el.innerHTML = `<span class="dot stale"></span>${esc(t.errorLabel)}`; return; }
  const label = kind === 'live' ? t.liveLabel : (kind === 'cached' ? t.cacheLabel : t.staleLabel);
  el.className = `status ${kind}`;
  el.innerHTML = `<span class="dot ${kind}"></span>${esc(label)} · ${esc(t.updated)} ${esc(timeAgo(ts, state.lang))} · ${esc(t.stories(state.articles.length))}`;
}

function renderFilters() {
  const bar = $('#filters'); if (!bar) return;
  const t = I18N[state.lang];
  const regionButtons = ['all', 'id', 'global'].map(r =>
    `<button type="button" class="seg-btn${state.region === r ? ' active' : ''}" data-region="${esc(r)}">${esc(t.regions[r])}</button>`).join('');
  const listedSources = SOURCES.filter(s => state.region === 'all' || s.region === state.region);
  const topicOptions = CATEGORIES.map(c =>
    `<option value="${esc(c.id)}"${state.categoryFilter === c.id ? ' selected' : ''}>${esc((t.cats && t.cats[c.id]) || c.label)}</option>`).join('');
  const sourceOptions = listedSources.map(s =>
    `<option value="${esc(s.id)}"${state.filter === s.id ? ' selected' : ''}>${esc(s.label)}</option>`).join('');

  bar.innerHTML = `
    <div class="filter-row">
      <div class="seg" role="group" aria-label="${esc(t.regionFilter)}">${regionButtons}</div>
      <select id="topicSelect" class="filter-select" aria-label="${esc(t.topicFilter)}">${topicOptions}</select>
      <select id="sourceSelect" class="filter-select" aria-label="${esc(t.sourceFilter)}">
        <option value="all"${state.filter === 'all' ? ' selected' : ''}>${esc(t.allSources)}</option>
        ${sourceOptions}
      </select>
      <label class="switch"><input type="checkbox" id="unreadToggle"${state.unreadOnly ? ' checked' : ''}><span>${esc(t.unreadOnly)}</span></label>
    </div>`;
}

function renderWatchChips() {
  const el = $('#watchChips'); if (!el) return;
  el.innerHTML = state.watch.map((kw, i) => `<span class="chip-watch">${esc(kw)}<button type="button" data-remove-watch="${i}" aria-label="Remove ${esc(kw)}">×</button></span>`).join('');
}

function applyLang() {
  const t = I18N[state.lang]; document.documentElement.lang = state.lang;
  $$('[data-i18n]').forEach(el => { const key = el.getAttribute('data-i18n'); if (t[key]) el.textContent = t[key]; });
  $$('[data-i18n-ph]').forEach(el => { const key = el.getAttribute('data-i18n-ph'); if (t[key]) el.setAttribute('placeholder', t[key]); });
  $$('[data-i18n-title]').forEach(el => { const key = el.getAttribute('data-i18n-title'); if (t[key]) el.setAttribute('title', t[key]); });
  $$('.lang-toggle button').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-lang') === state.lang));
  renderFilters(); renderTicker(state.ticker); renderPortfolio(); render(); refreshTimes();
  /* The IPO board carries long prose, so it has to be redrawn in the new
     language rather than left in whichever one it was opened with. */
  const ipoBoard = document.getElementById('ipoBoard');
  if (ipoBoard && ipoBoard.dataset.loaded) renderIpoBoard();
}

/* MARKET DASHBOARD LOGIC */
/* The markets page answers two different questions — what do I own, and what
   is out there — so it holds two views instead of one long scroll. The
   explore board only fetches once, when it is first opened. */
function setMarketView(view) {
  state.marketView = view === 'explore' ? 'explore' : view === 'ipos' ? 'ipos' : 'holdings';
  const hold = document.getElementById('holdingsView');
  const explore = document.getElementById('exploreView');
  const ipos = document.getElementById('iposView');
  if (hold) hold.hidden = state.marketView !== 'holdings';
  if (explore) explore.hidden = state.marketView !== 'explore';
  if (ipos) ipos.hidden = state.marketView !== 'ipos';
  const tabs = document.querySelectorAll('#mktViewTabs [data-mkt-view]');
  Array.prototype.forEach.call(tabs, function (btn) {
    const on = btn.getAttribute('data-mkt-view') === state.marketView;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (state.marketView === 'explore') {
    const dash = document.getElementById('stockDashboard');
    if (dash && !dash.dataset.loaded) loadMarketDashboard();
  } else if (state.marketView === 'ipos') {
    /* Curated data, no network: the board is drawn once and then kept, so
       switching tabs does not rebuild the dossier a reader was reading. */
    const board = document.getElementById('ipoBoard');
    if (board && !board.dataset.loaded) renderIpoBoard();
  } else {
    /* A chart built while its panel was hidden measures zero width, so the
       trend is drawn again the moment the holdings view is back on screen. */
    setTimeout(renderPortfolio, 0);
  }
}

function switchView(view) {
  if (view === 'news') {
    $('#newsView').style.display = 'block'; $('#stocksView').style.display = 'none'; $('#filters').style.display = 'block';
    $('#navNews').classList.add('active'); $('#navStocks').classList.remove('active');
  } else {
    $('#newsView').style.display = 'none'; $('#stocksView').style.display = 'block'; $('#filters').style.display = 'none';
    $('#navNews').classList.remove('active'); $('#navStocks').classList.add('active');
    setMarketView(state.marketView);
    refreshPortfolio();
  }
}
