/* ------------------------------------------------------------
   Boot, AI requests and UI wiring
   ------------------------------------------------------------ */
async function loadNews(force) {
  const cached = loadJSON(LS.news, null);
  if (cached && cached.articles && cached.articles.length > 0) {
    const cutoff = Date.now() - NEWS_MAX_AGE_MS;
    state.articles = cached.articles.filter(a => a.ts >= cutoff);
    state.lastTs = cached.ts; state.lastKind = 'cached';
    render(); updateStatusLabel('cached', cached.ts); backfillAllImages();
    if (!force && (Date.now() - cached.ts) < CACHE_TTL) return;
  } else { updateStatusLabel('loading'); }
  try {
    await fetchAllNews(); state.lastTs = Date.now(); state.lastKind = 'live';
    saveJSON(LS.news, { ts: Date.now(), articles: state.articles.slice(0, MAX_ARTICLES) }); updateStatusLabel('live', state.lastTs);
  } catch (err) { if (!cached || !cached.articles) updateStatusLabel('error'); }
}

async function loadTicker(force) {
  const cached = loadJSON(LS.ticker, null);
  if (!force && cached && cached.items && (Date.now() - cached.ts) < CACHE_TTL) { state.ticker = cached.items; renderTicker(state.ticker); return; }
  try {
    const items = await fetchTicker(); state.ticker = items; saveJSON(LS.ticker, { ts: Date.now(), items }); renderTicker(items);
  } catch (err) { if (cached && cached.items) { state.ticker = cached.items; renderTicker(state.ticker); } }
}

async function loadAll(force) {
  if (state.loading) return; state.loading = true;
  try { await Promise.all([loadNews(force), loadTicker(force)]); } finally { state.loading = false; }
}

async function getFullArticleText(url) {
  try {
    const fetchUrl = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    const html = await fetchViaProxy(fetchUrl, { timeout: 10000 });
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('script, style, nav, footer, header, aside, iframe, noscript, .ads, .related').forEach(el => el.remove());
    let contentEl = doc.querySelector('article') || doc.querySelector('main') || doc.querySelector('.detail-text') || doc.querySelector('.article-content') || doc.querySelector('.post-content') || doc.body;
    let text = contentEl.textContent || '';
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length < 300) return ''; 
    return text.substring(0, 5000);
  } catch (e) {
    return '';
  }
}

/* AI calls go through the worker. A cold Gemini start can take 20s, so keep a
   hard limit and narrate the wait — a silent button reads as "it's broken". */
/* PUBLIC DEMO GUARDS
   The AI routes run on a free-tier Gemini key, so a traffic spike can exhaust
   the per-minute quota. Three cheap guards keep the page readable when that
   happens: a per-session call cap, a per-article summary cache so a repeat
   click costs nothing, and error text a visitor can understand. */
const AI_SESSION_KEY = 'finwire.ai.calls.v1';
const AI_SESSION_CAP = 12;
const AI_COOLDOWN_MS = 4000;
const AI_CACHE_KEY   = 'finwire.ai.summaries.v1';
const AI_CACHE_TTL   = 7 * 24 * 60 * 60 * 1000;
const AI_CACHE_LIMIT = 300;

let aiSessionCalls = (function () {
  try { const n = parseInt(sessionStorage.getItem(AI_SESSION_KEY) || '0', 10); return isFinite(n) && n > 0 ? n : 0; }
  catch (e) { return 0; }
})();

function aiCanSpend() { return aiSessionCalls < AI_SESSION_CAP; }

let aiLastCallAt = 0;
let aiBlockReason = '';

/* One gate for every AI entry point. A click during the cooldown is refused
   without spending anything, so holding down a button costs nothing. */
function aiSpend() {
  aiBlockReason = '';
  if ((Date.now() - aiLastCallAt) < AI_COOLDOWN_MS) { aiBlockReason = 'slow'; return false; }
  if (!aiCanSpend()) { aiBlockReason = 'cap'; return false; }
  aiSessionCalls++;
  aiLastCallAt = Date.now();
  try { sessionStorage.setItem(AI_SESSION_KEY, String(aiSessionCalls)); } catch (e) {}
  return true;
}

/* A route that is not deployed never reaches Gemini, so refusing it must not
   consume one of the tab's calls: give the slot back and leave the cooldown
   alone, which still stops a visitor hammering an endpoint that is not there. */
function aiRefund() {
  if (aiSessionCalls > 0) aiSessionCalls -= 1;
  try { sessionStorage.setItem(AI_SESSION_KEY, String(aiSessionCalls)); } catch (e) {}
}

function aiBlockText() {
  const t = I18N[state.lang] || I18N.en;
  return aiBlockReason === 'slow' ? t.aiSlow : t.aiCap;
}

function aiCapError() {
  const error = new Error(aiBlockText());
  error.code = 'cap';
  return error;
}

const aiCache = (function () {
  const stored = loadJSON(AI_CACHE_KEY, {});
  const out = {};
  Object.keys(stored || {}).forEach(function (key) {
    const entry = stored[key];
    if (entry && typeof entry.text === 'string' && entry.at) out[key] = entry;
  });
  return out;
})();

let aiCacheTimer = null;
function aiCacheSave() {
  if (aiCacheTimer) return;
  aiCacheTimer = setTimeout(function () {
    aiCacheTimer = null;
    const keys = Object.keys(aiCache).sort(function (a, b) { return (aiCache[a].at || 0) - (aiCache[b].at || 0); });
    while (keys.length > AI_CACHE_LIMIT) { const old = keys.shift(); delete aiCache[old]; }
    saveJSON(AI_CACHE_KEY, aiCache);
  }, 500);
}

function aiCacheKey(text) {
  const str = String(text || '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; }
  return 'h' + hash;
}

function aiCacheGet(key) {
  const hit = aiCache[key];
  if (!hit) return '';
  if ((Date.now() - (hit.at || 0)) > AI_CACHE_TTL) { delete aiCache[key]; aiCacheSave(); return ''; }
  return hit.text;
}

function aiCacheSet(key, text) {
  if (!key || !text) return;
  aiCache[key] = { text: text, at: Date.now() };
  aiCacheSave();
}

async function aiRequest(path, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const res = await fetch(WORKER_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error((data && data.detail) || (data && data.error) || ('Server error ' + res.status));
      error.status = res.status;
      error.code = (data && data.code) || '';
      throw error;
    }
    if (!data) throw new Error('Empty response from AI');
    return data;
  } finally { clearTimeout(timer); }
}

/* A route that is not deployed on this Worker yet (an older build) is reported
   as unavailable rather than as a generic failure. */
function aiMissingEndpoint(err) {
  if (!err) return false;
  return err.status === 404 || err.status === 405 || /not found|no route/i.test(String(err.message || ''));
}

function aiErrorText(err) {
  const t = I18N[state.lang] || I18N.en;
  if (err && err.name === 'AbortError') return t.aiTimeout;
  if (err && err.code === 'cap') return err.message;
  if (err && err.code === 'limit') return t.aiLimit;
  const status = err && err.status;
  const message = String((err && err.message) || '').toLowerCase();
  if (status === 429 || (err && err.code === 'quota') || /quota|resource_exhausted|rate.?limit|\b429\b/.test(message)) return t.aiQuota;
  if (status === 503 || (err && err.code === 'busy') || /overloaded|unavailable|busy/.test(message)) return t.aiBusy;
  return t.aiFailed;
}

/* Rewrites the label every second so a slow answer still looks alive. */
function startClock(el, label) {
  const t0 = Date.now();
  const tick = () => { el.textContent = `${label} ${Math.round((Date.now() - t0) / 1000)}s`; };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}

function bindUI() {
  /* Delegated, so it survives every repaint of the board. */
  document.addEventListener('click', function (ev) {
    const btn = ev.target && ev.target.closest ? ev.target.closest('[data-buzz-ai]') : null;
    if (!btn) return;
    ev.preventDefault();
    runBuzzAi(btn);
  });
  if ($('#navNews')) $('#navNews').addEventListener('click', () => switchView('news'));
  if ($('#navStocks')) $('#navStocks').addEventListener('click', () => switchView('stocks'));

  // --- NEW: THEME TOGGLE LOGIC GOES HERE ---
  const themeToggleBtn = $('#themeToggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem(LS.theme, newTheme);
      
      // Update Icon
      themeToggleBtn.innerHTML = newTheme === 'dark' ? '<span aria-hidden="true">☀️</span>' : '<span aria-hidden="true">🌙</span>';
      
      // Re-theme existing charts if on Market page (do not refetch data)
      if ($('#stocksView').style.display !== 'none') {
        applyChartTheme(newTheme);
        // The portfolio trend picks its series colours at build time, so it is
        // rebuilt from cached data instead of being recoloured.
        if (document.getElementById('pfTrendChart')) renderPortfolio();
      }
    });
  }
  // -----------------------------------------

  /* Why a holding moved — the same news-grounded answer Market Movers gives,
     built from the ticker's own headlines rather than the macro feed. */
  async function pfWhyMoved(symbol) {
    const p = (I18N[state.lang] || I18N.en).portfolio;
    const out = document.querySelector('[data-pf-why-out="' + symbol + '"]');
    if (!out) return;
    out.hidden = false;
    const q = pfQuotes[symbol] || {};
    const pct = isFinite(q.pct) ? q.pct : 0;
    const stop = startClock(out, '✨ ' + p.whyMoved + '…');
    try {
      const items = await fetchTickerNews(symbol);
      const terms = [symbol.replace(/\.JK$/i, '').toLowerCase(), String(q.name || '').toLowerCase()].filter(t => t.length > 1);
      const related = state.articles.filter(a => {
        const text = ((a.title || '') + ' ' + (a.summary || '')).toLowerCase();
        return terms.some(term => text.includes(term));
      }).slice(0, 4);
      const seen = new Set(); const lines = []; const sources = [];
      items.forEach(n => {
        const key = n.title.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key); sources.push(n); lines.push(headlineLine(n));
      });
      related.forEach(a => {
        const key = (a.title || '').toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        sources.push({ publisher: a.sourceLabel || 'FINWIRE', link: a.link || '' });
        lines.push('- [' + (a.sourceLabel || 'FINWIRE') + '] ' + a.title);
      });
      if (!lines.length) { out.textContent = p.whyNoNews.replace('{sym}', symbol.replace(/\.JK$/i, '')); return; }
      if (!aiSpend()) { out.textContent = aiBlockText(); return; }
      const data = await aiRequest('/ai-explain-move', {
        symbol: symbol.replace(/\.JK$/i, ''), pct: pct, isUp: pct >= 0, lang: state.lang, newsText: lines.join('\n')
      });
      if (!data || !data.summary) { out.textContent = p.whyFailed; return; }
      const summary = data.summary.trim().replace(/^no specific news found,?\s*(but\s+)?(likely\s+)?(due\s+)?to\s*/i, '');
      const links = sources.slice(0, 3).map(n => n.link
        ? '<a href="' + esc(n.link) + '" target="_blank" rel="noopener noreferrer">' + esc(n.publisher) + '</a>'
        : esc(n.publisher)).join(' · ');
      out.innerHTML = '<strong>' + esc(p.whyMoved) + ':</strong> ' + esc(summary) +
        (links ? '<div class="explain-sources">Sources: ' + links + '</div>' : '');
      pfDetailOf(symbol).why = out.innerHTML;
    } catch (err) {
      out.textContent = aiErrorText(err);
    } finally { stop(); }
  }

  /* The fundamental read for a holding renders where the figures already are,
     instead of covering them with a panel of its own. */
  async function pfAiRead(symbol, btn) {
    const out = document.querySelector('[data-pf-ai-out="' + symbol + '"]');
    if (!out || out.dataset.busy === '1') return;
    const t = I18N[state.lang].fundAi;
    out.hidden = false;
    out.dataset.busy = '1';
    if (btn) btn.disabled = true;
    const textId = 'pfAiText' + symbol.replace(/[^A-Za-z0-9]/g, '');
    out.innerHTML = '<div class="fin-ai-panel"><div class="fin-ai-text" id="' + textId + '"></div></div>';
    const textNode = document.getElementById(textId);
    const stop = textNode ? startClock(textNode, t.loading) : function () {};
    try {
      const fund = await fetchFundamentals(symbol);
      const lines = fundFigureLines(fund, state.lang);
      if (!lines.length) throw new Error(I18N[state.lang].fund.noData);
      if (!aiSpend()) throw aiCapError();
      const q = pfQuotes[symbol] || {};
      const data = await aiRequest('/ai-fundamentals', {
        symbol: symbol.replace(/\.JK$/i, ''),
        name: q.name || '',
        lang: state.lang,
        figures: lines.join('\n')
      });
      out.innerHTML = fundAiHtml((data && data.summary) ? data.summary.trim() : t.failed, false, false);
    } catch (err) {
      const message = aiErrorText(err);
      out.innerHTML = fundAiHtml(aiMissingEndpoint(err) ? t.unavailable : message, true, false);
    } finally {
      stop();
      out.dataset.busy = '';
      if (btn) btn.disabled = false;
      pfDetailOf(symbol).ai = out.innerHTML;
    }
  }

  const benchDash = $('#stockDashboard');
  if (benchDash) benchDash.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-pf-bench]');
    if (!btn) return;
    pfToggleBench(btn.getAttribute('data-pf-bench'));
    renderMarketBench();
    renderPortfolio();
  });

  const viewTabs = $('#mktViewTabs');
  if (viewTabs) viewTabs.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-mkt-view]');
    if (btn) setMarketView(btn.getAttribute('data-mkt-view'));
  });

  const pfHost = $('#portfolioPanel');
  if (pfHost) {
    pfHost.addEventListener('submit', (e) => {
      if (!e.target || e.target.id !== 'pfForm') return;
      e.preventDefault();
      addHolding(
        $('#pfSymbol').value, $('#pfQty').value, $('#pfPrice').value, pfInCur,
        ($('#pfSide') || {}).value, ($('#pfDate') || {}).value, ($('#pfNote') || {}).value
      );
    });
    pfHost.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'pfSymbol') pfSyncInputCur();
    });
    pfHost.addEventListener('click', (e) => {
      const curBtn = e.target.closest('[data-pf-cur]');
      if (curBtn) { setPfCurrencyMode(curBtn.getAttribute('data-pf-cur')); return; }
      const inBtn = e.target.closest('[data-pf-in]');
      if (inBtn) { setPfInputCurrency(inBtn.getAttribute('data-pf-in')); return; }
      const rangeBtn2 = e.target.closest('[data-pf-range]');
      if (rangeBtn2) { pfTrendState.range = rangeBtn2.getAttribute('data-pf-range'); renderPortfolio(); return; }
      const exportBtn = e.target.closest('[data-pf-export]');
      if (exportBtn) {
        if (exportBtn.getAttribute('data-pf-export') === 'events') pfExportEventsCsv();
        else pfExportHoldingsCsv();
        return;
      }
      const benchBtn = e.target.closest('[data-pf-bench]');
      if (benchBtn) {
        pfToggleBench(benchBtn.getAttribute('data-pf-bench'));
        renderPortfolio();
        renderMarketBench();
        return;
      }
      const chipBtn = e.target.closest('[data-pf-filter]');
      if (chipBtn) { pfFilter = chipBtn.getAttribute('data-pf-filter'); renderPortfolio(); return; }
      const openBtn = e.target.closest('[data-pf-open]');
      if (openBtn) { pfToggleDetail(openBtn.getAttribute('data-pf-open')); return; }
      const readBtn = e.target.closest('[data-pf-read]');
      if (readBtn) { pfAiRead(readBtn.getAttribute('data-pf-read'), readBtn); return; }
      const whyBtn = e.target.closest('[data-pf-why]');
      if (whyBtn) { pfWhyMoved(whyBtn.getAttribute('data-pf-why')); return; }
      const delBtn = e.target.closest('[data-pf-del]');
      if (delBtn) { removeTrade(delBtn.getAttribute('data-pf-del')); return; }
      const removeBtn = e.target.closest('[data-pf-remove]');
      if (!removeBtn) return;
      removeHolding(removeBtn.getAttribute('data-pf-remove'));
    });
  }

  const searchInput = $('#stockSearchInput');
  if ($('#stockSearchBtn')) $('#stockSearchBtn').addEventListener('click', () => searchStocks(searchInput.value.trim()));
  if (searchInput) searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); searchStocks(searchInput.value.trim()); } });

  $('#filters').addEventListener('click', (e) => {
    const regionBtn = e.target.closest('.seg-btn[data-region]');
    if (!regionBtn) return;
    state.region = regionBtn.getAttribute('data-region');
    // A source from the other region would filter to nothing.
    const allowed = SOURCES.filter(s => state.region === 'all' || s.region === state.region).map(s => s.id);
    if (state.filter !== 'all' && allowed.indexOf(state.filter) === -1) state.filter = 'all';
    renderFilters(); render();
  });

  $('#filters').addEventListener('change', (e) => {
    if (!e.target) return;
    if (e.target.id === 'unreadToggle') { state.unreadOnly = e.target.checked; render(); }
    else if (e.target.id === 'topicSelect') { state.categoryFilter = e.target.value; render(); }
    else if (e.target.id === 'sourceSelect') { state.filter = e.target.value; render(); }
  });

  $$('.lang-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.getAttribute('data-lang') === state.lang) return;
      state.lang = btn.getAttribute('data-lang'); localStorage.setItem(LS.lang, state.lang);
      applyLang(); if ($('#stocksView').style.display !== 'none') loadMarketDashboard();
      if (state.lastTs) updateStatusLabel(state.lastKind || 'live', state.lastTs);
    });
  });

  $('#markAllRead').addEventListener('click', () => { currentArticles().forEach(a => state.read.add(a.link)); saveJSON(LS.read, Array.from(state.read).slice(-1000)); render(); refreshTimes(); });
  $('#refreshBtn').addEventListener('click', () => loadAll(true));

  const input = $('#watchInput');
  const addKeyword = () => {
    const raw = (input.value || '').trim(); if (!raw) return;
    if (!state.watch.some(k => k.toLowerCase() === raw.toLowerCase())) { state.watch.push(raw); saveJSON(LS.watch, state.watch); renderWatchChips(); render(); }
    input.value = '';
  };
  $('#watchAdd').addEventListener('click', addKeyword);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } });

  $('#watchChips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove-watch]'); if (!btn) return;
    const idx = parseInt(btn.getAttribute('data-remove-watch'), 10);
    if (!isNaN(idx)) { state.watch.splice(idx, 1); saveJSON(LS.watch, state.watch); renderWatchChips(); render(); }
  });

  // AI SUMMARIZE LOGIC (Gemini)
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.ai-btn');
    if (!btn) return;
    
    e.preventDefault();
    e.stopPropagation(); 
    
    const targetId = btn.getAttribute('data-target');
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;
    
    if (targetEl.style.display === 'block') {
      targetEl.style.display = 'none';
      return;
    }

    btn.disabled = true;
    const aiT = I18N[state.lang] || I18N.en;
    const aiCard = btn.closest('.card');
    const aiUrl = aiCard ? aiCard.getAttribute('data-url') : null;
    const aiKey = aiUrl
      ? 'a|' + aiUrl + '|' + state.lang
      : 't|' + aiCacheKey(btn.getAttribute('data-text')) + '|' + state.lang;

    /* A cached summary costs no quota, so it is shown even after the cap. */
    const aiSaved = aiCacheGet(aiKey);
    if (aiSaved) {
      targetEl.innerHTML = `<strong>AI Summary:</strong> ${esc(aiSaved)}`;
      targetEl.style.display = 'block';
      btn.disabled = false;
      return;
    }
    if (!aiSpend()) {
      targetEl.innerHTML = `<em>${esc(aiBlockText())}</em>`;
      targetEl.style.display = 'block';
      btn.disabled = false;
      return;
    }

    let stopClock = startClock(btn, '✨ Reading article...');
    
    try {
      const card = btn.closest('.card');
      const articleUrl = card ? card.getAttribute('data-url') : null;
      
      let textToSummarize = '';
      if (articleUrl) {
          textToSummarize = await getFullArticleText(articleUrl);
      }
      
      if (!textToSummarize || textToSummarize.length < 100) {
          textToSummarize = btn.getAttribute('data-text');
      }

      stopClock();
      stopClock = startClock(btn, '✨ Thinking...');
      
      const data = await aiRequest('/ai-summarize', { text: textToSummarize, lang: state.lang });
      
      const summary = (data && data.summary) ? data.summary.trim() : '';
      if (summary) {
        aiCacheSet(aiKey, summary);
        targetEl.innerHTML = `<strong>AI Summary:</strong> ${esc(summary)}`;
      } else {
        targetEl.innerHTML = `<em>${esc(aiT.aiBusy)}</em>`;
      }
      targetEl.style.display = 'block';
    } catch (err) {
      targetEl.innerHTML = `<em>Failed: ${esc(aiErrorText(err))}</em>`;
      targetEl.style.display = 'block';
    } finally {
      stopClock();
      btn.disabled = false;
      btn.innerHTML = '✨ AI Summary';
    }
  });

  // Headlines published about one ticker — far more relevant to a single-stock
  // move than our own RSS feeds, which are mostly Indonesian macro/business news.
  // Yahoo covers US listings; for IDX it returns nothing at all, so the ticker is
  // instead searched in Bing's Indonesian news feed (Google News' equivalent
  // throttles us with 503s), falling back to Google when Bing comes up empty.
  function bingArticleLink(link) {
    const m = /[?&]url=([^&]+)/.exec(link || '');
    if (!m) return link || '';
    try { return decodeURIComponent(m[1]); } catch (e) { return link; }
  }

  function parseNewsFeed(xml, symbol, isBing) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const nodes = Array.prototype.slice.call(doc.getElementsByTagName('item'));
    const out = [];
    nodes.forEach(node => {
      let title = textOf(node, ['title']);
      const rawLink = linkOf(node);
      let publisher = textOf(node, ['source', 'News:Source']);
      if (!publisher) {
        const src = node.getElementsByTagNameNS ? node.getElementsByTagNameNS('*', 'Source')[0] : null;
        publisher = src ? (src.textContent || '').trim() : '';
      }
      const ts = Date.parse(textOf(node, ['pubDate'])) || 0;
      if (!title || !rawLink) return;
      // These feeds are relevance-ranked, so they drag in loose matches; keep only
      // headlines that actually name the ticker.
      if (title.toLowerCase().indexOf(symbol.toLowerCase()) === -1) return;
      if (publisher && title.endsWith(' - ' + publisher)) title = title.slice(0, title.length - 3 - publisher.length);
      out.push({
        title: title.trim(),
        publisher: publisher || (isBing ? 'Bing News' : 'Google News'),
        link: isBing ? bingArticleLink(rawLink) : rawLink,
        ts, tickers: [symbol]
      });
    });
    return out;
  }

  // A click on several tickers in a row should not re-hit the news feeds.
  const tickerNewsCache = new Map();
  const TICKER_NEWS_TTL = 5 * 60 * 1000;

  async function fetchIdxNews(symbol) {
    const cached = tickerNewsCache.get(symbol);
    if (cached && Date.now() - cached.at < TICKER_NEWS_TTL) return cached.items;
    const feeds = [
      { url: `https://www.bing.com/news/search?q=${encodeURIComponent(symbol + ' saham')}&format=RSS&setlang=id`, bing: true },
      { url: `https://news.google.com/rss/search?q=${encodeURIComponent(symbol + ' saham')}&hl=id&gl=ID&ceid=ID:id`, bing: false }
    ];
    for (let i = 0; i < feeds.length; i++) {
      try {
        const items = parseNewsFeed(await fetchViaProxy(feeds[i].url, { timeout: 7000 }), symbol, feeds[i].bing);
        if (items.length) { tickerNewsCache.set(symbol, { at: Date.now(), items }); return items; }
      } catch (err) { /* try the next feed */ }
    }
    return [];
  }

  async function fetchTickerNews(symbol) {
    const clean = symbol.replace(/\.JK$/i, '').toUpperCase();
    let items = [];
    try {
      const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(symbol)}&newsCount=12&quotesCount=0&enableFuzzyQuery=false`;
      const data = JSON.parse(await fetchViaProxy(url, { timeout: 7000 }));
      items = (data.news || []).filter(n => n && n.title).map(n => ({
        title: n.title.trim(),
        publisher: n.publisher || 'Yahoo Finance',
        link: n.link || '',
        ts: (n.providerPublishTime || 0) * 1000,
        tickers: n.relatedTickers || []
      }));
      const tagged = items.filter(n => n.tickers.indexOf(clean) !== -1);
      items = tagged.length ? tagged : items;
    } catch (err) { items = []; }

    if (/\.JK$/i.test(symbol)) {
      try { items = items.concat(await fetchIdxNews(clean)); }
      catch (err) { /* Indonesian press unreachable — fall back to whatever we have */ }
    }

    const seen = new Set();
    return items
      .filter(n => {
        const key = n.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key); return true;
      })
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 8);
  }

  function headlineLine(n) {
    const age = n.ts ? new Date(n.ts).toISOString().slice(0, 10) : '';
    return `- [${n.publisher}] ${n.title}${age ? ` (${age})` : ''}`;
  }

  // Daily Briefing Logic
  const briefingBtn = $('#generateBriefingBtn');
  if (briefingBtn) {
    briefingBtn.addEventListener('click', async () => {
      const contentEl = $('#briefingContent');
      const articles = currentArticles().slice(0, 15);
      if (articles.length === 0) return;

      const combinedText = articles.map((a, i) => `${i+1}. ${a.title} - ${a.summary}`).join('\n\n');

      if (!aiSpend()) {
        contentEl.style.display = 'block';
        contentEl.innerHTML = `<em>${esc(aiBlockText())}</em>`;
        return;
      }

      briefingBtn.disabled = true;
      briefingBtn.innerHTML = '✨ Analyzing 15 articles...';
      contentEl.style.display = 'block';
      const stopClock = startClock(contentEl, '✨ Reading the latest headlines...');

      try {
        const data = await aiRequest('/ai-summarize', { text: combinedText, isBriefing: true, lang: state.lang });
        
        if (data && data.summary) {
          let formattedText = data.summary
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/^\* (.*$)/gim, '<li>$1</li>');
          
          if (formattedText.includes('<li>')) formattedText = `<ul>${formattedText}</ul>`;

          contentEl.innerHTML = `<strong>Market Briefing:</strong><br>${formattedText}`;
          contentEl.style.display = 'block';
        } else {
          contentEl.innerHTML = `<em>Failed to generate briefing. Try again.</em>`;
          contentEl.style.display = 'block';
        }
      } catch (err) {
        stopClock();
        contentEl.innerHTML = `<em>${esc(aiErrorText(err))}</em>`;
        contentEl.style.display = 'block';
      } finally {
        stopClock();
        briefingBtn.disabled = false;
        briefingBtn.innerHTML = '✨ Generate Today\'s Market Briefing';
      }
    });
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => renderTicker(state.ticker), 350); });
  setInterval(refreshTimes, 60 * 1000);
}

function init() {
  // --- LOAD SAVED THEME ---
  const savedTheme = localStorage.getItem(LS.theme) || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  const themeToggleBtn = $('#themeToggle');
  if (themeToggleBtn) {
    themeToggleBtn.innerHTML = savedTheme === 'dark' ? '<span aria-hidden="true">☀️</span>' : '<span aria-hidden="true">🌙</span>';
  }
  // ------------------------

  const savedLang = localStorage.getItem(LS.lang); state.lang = (savedLang === 'id' || savedLang === 'en') ? savedLang : 'en';
  const savedRead = loadJSON(LS.read, []); state.read = new Set(Array.isArray(savedRead) ? savedRead : []);
  const savedWatch = loadJSON(LS.watch, null); state.watch = Array.isArray(savedWatch) ? savedWatch : [];

  bindUI(); renderFilters(); renderWatchChips(); applyLang(); loadAll(false);
  setInterval(() => loadAll(true), AUTO_REFRESH_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const cached = loadJSON(LS.news, null);
      if (!cached || (Date.now() - cached.ts) >= CACHE_TTL) loadAll(false); else refreshTimes();
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
