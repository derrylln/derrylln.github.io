/* ------------------------------------------------------------
   News mention ranking
   ------------------------------------------------------------ */
const PF_BUZZ_DAYS = 7;
const PF_BUZZ_ROWS = 10;

/* Names only arrive with the quotes, so the matcher learns "Nvidia" and
   "Bank Central Asia Tbk" as the explore board loads instead of scoring on
   bare tickers alone. */
const buzzNames = Object.create(null);

/* Company names as writers use them: parentheticals and legal suffixes
   removed, so "Bank Central Asia Tbk" also matches "Bank Central Asia". */
function pfBuzzNameTerms(name) {
  const clean = String(name || '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return [];
  const bare = clean
    .replace(/\b(inc|incorporated|corp|corporation|company|co|ltd|limited|plc|tbk|nv|sa|ag|se|holdings|holding|group|class [a-z])\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const out = [];
  if (bare.length > 3) out.push(bare);
  if (clean.length > 3 && clean !== bare) out.push(clean);
  return out;
}

/* Company names that are also ordinary words score the word, not the
   company: Indonesian copy says "target" of any goal, and "visa" of travel.
   Those names are matched by ticker instead. */
const PF_BUZZ_GENERIC = { target: 1, visa: 1, timah: 1 };

/* Codes that spell an everyday word, so the ticker only counts when it is
   printed in capitals. The company name still matches in either case. */
const PF_BUZZ_TICKER_ONLY = {
  MAIN: 1, BUKA: 1, CUAN: 1, DEWA: 1, BUMI: 1, BIRD: 1, AUTO: 1, FOOD: 1, WIFI: 1,
  GEMS: 1, HEAL: 1, SILO: 1, MEGA: 1, PANI: 1
};

function buzzRememberNames(map) {
  Object.keys(map || {}).forEach(function (sym) {
    const name = map[sym] && map[sym].name;
    if (name && name !== sym) buzzNames[sym] = name;
  });
}

/* Every IDX code the site already knows about: the names it prices, the
   dividend pool, and the mid and small caps copy writes about. */
function buzzIdxCandidates() {
  const seen = Object.create(null);
  const out = [];
  const push = function (symbol, name) {
    const up = String(symbol).toUpperCase();
    const code = up.replace(/\.JK$/i, '');
    if (!code || seen[code]) return;
    seen[code] = 1;
    out.push({ symbol: up, code: code, region: 'idx', name: name || buzzNames[up] || '' });
  };
  IDX_POOL.forEach(function (s) { push(s.symbol); });
  DIVIDEND_POOL.forEach(function (s) { push(s.symbol, s.name); });
  IDX_BUZZ_EXTRA.forEach(function (s) { push(s.symbol, s.name); });
  return out;
}

function buzzUsCandidates() {
  return US_POOL.map(function (s) {
    return { symbol: s.symbol, code: s.symbol.replace(/\.JK$/i, ''), region: 'us', name: buzzNames[s.symbol] || '' };
  });
}

/* Each candidate becomes a match unit: its ticker, and the company names copy
   is likely to use instead of the ticker. */
function buzzCandidates() {
  return buzzIdxCandidates().concat(buzzUsCandidates()).map(function (c) {
    const unit = { symbol: c.symbol, region: c.region, code: c.code, names: [], res: Object.create(null) };
    pfBuzzNameTerms(c.name).forEach(function (term) {
      if (term.indexOf(' ') === -1 && PF_BUZZ_GENERIC[term]) return;
      if (unit.names.indexOf(term) === -1) unit.names.push(term);
    });
    return unit;
  });
}

function pfBuzzTerm(unit, term, flags) {
  const key = flags ? term + '/' + flags : term;
  if (!unit.res[key]) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    unit.res[key] = new RegExp('(^|[^A-Za-z0-9])' + escaped + '($|[^A-Za-z0-9])', flags || '');
  }
  return unit.res[key];
}

/* `raw` keeps its capitals. A handful of IDX codes are everyday words too
   ("buka" opens, "bumi" is the earth), so those count only when the story
   prints them as a ticker; the company name matches in either case. */
function pfBuzzHit(unit, text, raw) {
  if (unit.code.length >= 3) {
    const strict = PF_BUZZ_TICKER_ONLY[unit.code];
    const hit = strict ? pfBuzzTerm(unit, unit.code, '').test(raw) : pfBuzzTerm(unit, unit.code.toLowerCase(), 'i').test(text);
    if (hit) return true;
  }
  for (let i = 0; i < unit.names.length; i++) {
    if (pfBuzzTerm(unit, unit.names[i], '').test(text)) return true;
  }
  return false;
}

function pfBuzzRank() {
  const units = buzzCandidates();
  if (!units.length) return [];
  const dayMs = 86400000;
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const from = midnight.getTime() - (PF_BUZZ_DAYS - 1) * dayMs;

  const rows = units.map(function (u) {
    return { symbol: u.symbol, code: u.code, region: u.region,
      days: new Array(PF_BUZZ_DAYS).fill(0), total: 0, latest: null };
  });
  const bySymbol = Object.create(null);
  rows.forEach(function (r) { bySymbol[r.symbol] = r; });

  const seen = Object.create(null);
  state.articles.forEach(function (a) {
    if (!a || !a.ts || a.ts < from) return;
    const key = String(a.title || '').toLowerCase();
    if (!key || seen[key]) return;
    seen[key] = 1;
    const raw = String(a.title || '') + ' ' + String(a.summary || '');
    const text = raw.toLowerCase();
    units.forEach(function (u) {
      if (!pfBuzzHit(u, text, raw)) return;
      const row = bySymbol[u.symbol];
      const bucket = Math.floor((a.ts - from) / dayMs);
      if (bucket >= 0 && bucket < PF_BUZZ_DAYS) row.days[bucket] += 1;
      row.total += 1;
      if (!row.latest || a.ts > row.latest.ts) row.latest = a;
    });
  });

  return rows.filter(function (r) { return r.total > 0; }).sort(function (x, y) {
    return (y.total - x.total) || ((y.latest ? y.latest.ts : 0) - (x.latest ? x.latest.ts : 0));
  });
}

/* Seven thin bars, tallest day full height, drawn inline so the card costs
   no chart library and stays readable in both themes. */
function pfBuzzSpark(days) {
  const max = days.reduce(function (a, b) { return Math.max(a, b); }, 1);
  const bar = 4, gap = 3, h = 20;
  const bars = days.map(function (count, i) {
    const full = count ? Math.max(2, Math.round((count / max) * h)) : 1;
    return `<rect class="${count ? '' : 'empty'}" x="${i * (bar + gap)}" y="${h - full}" width="${bar}" height="${full}" rx="1"></rect>`;
  }).join('');
  return `<svg class="pf-buzz-spark" width="${days.length * (bar + gap) - gap}" height="${h}" viewBox="0 0 ${days.length * (bar + gap) - gap} ${h}" aria-hidden="true">${bars}</svg>`;
}

function pfBuzzRowHtml(r, i) {
  const t = I18N[state.lang].mkt;
  const a = r.latest;
  const meta = a ? [a.sourceLabel || 'FINWIRE', a.ts ? timeAgo(a.ts, state.lang) : ''].filter(Boolean).join(' · ') : '';
  const read = buzzAiCached(r.symbol);
  const tone = read ? pfBuzzTone(read) : '';
  return `<li class="pf-buzz-row">
      <span class="pf-buzz-rank">${i + 1}</span>
      <div class="pf-buzz-body">
        <div class="pf-buzz-top">
          <b class="pf-buzz-sym">${esc(r.code)}</b>
          <span class="pf-buzz-count">${esc(pfBuzzMentions(r.total))}</span>
          <button type="button" class="pf-buzz-ai" data-buzz-ai="${esc(r.symbol)}">✨ ${esc(t.buzzAi)}</button>
          ${pfBuzzSpark(r.days)}
        </div>
        ${a ? `<a class="pf-buzz-head" href="${esc(a.link || '#')}" target="_blank" rel="noopener noreferrer" title="${esc(a.title || '')}">${esc(a.title || '')}</a>
        <span class="pf-buzz-meta">${esc(meta)}</span>` : ''}
        <div class="pf-buzz-read${tone ? ' is-' + tone : ''}"${read ? '' : ' hidden'}>${esc(read)}</div>
      </div>
    </li>`;
}

function pfBuzzMentions(count) {
  const t = I18N[state.lang].mkt;
  return typeof t.buzzMentions === 'function' ? t.buzzMentions(count) : String(count);
}

/* ONE AI READ PER NAME PER DAY
   A row asks the model at most once a day, and the answer is kept in
   localStorage keyed by symbol and the reader's local day, so a repaint, a
   reload, a second click or a language switch costs nothing — the same rule
   the article summaries follow. */
const BUZZ_AI_KEY = 'finwire.ai.buzz.v1';
const BUZZ_AI_LIMIT = 200;
let buzzAiCache = (function () {
  const stored = loadJSON(BUZZ_AI_KEY, {});
  const out = {};
  Object.keys(stored || {}).forEach(function (key) {
    const entry = stored[key];
    if (entry && typeof entry.text === 'string' && entry.at) out[key] = entry;
  });
  return out;
})();

function buzzAiKey(symbol) { return symbol + '|' + pfToday(); }

function buzzAiCached(symbol) {
  const hit = buzzAiCache[buzzAiKey(symbol)];
  return hit ? hit.text : '';
}

function buzzAiSave() {
  const keys = Object.keys(buzzAiCache);
  if (keys.length > BUZZ_AI_LIMIT) {
    keys.sort(function (a, b) { return (buzzAiCache[b].at || 0) - (buzzAiCache[a].at || 0); });
    keys.slice(BUZZ_AI_LIMIT).forEach(function (key) { delete buzzAiCache[key]; });
  }
  saveJSON(BUZZ_AI_KEY, buzzAiCache);
}

/* The same seven days of stories the row is counting, as plain lines the model
   can read: title first, publisher in brackets. */
function pfBuzzNews(symbol, limit) {
  const unit = buzzCandidates().filter(function (u) { return u.symbol === symbol; })[0];
  if (!unit) return [];
  const since = Date.now() - PF_BUZZ_DAYS * 864e5;
  const seen = Object.create(null);
  return state.articles.filter(function (a) {
    if (!a || !a.ts || a.ts < since) return false;
    const key = String(a.title || '').toLowerCase();
    if (!key || seen[key]) return false;
    seen[key] = 1;
    const raw = String(a.title || '') + ' ' + String(a.summary || '');
    return pfBuzzHit(unit, raw.toLowerCase(), raw);
  }).sort(function (a, b) { return b.ts - a.ts; }).slice(0, limit || 8)
    .map(function (a) { return '- ' + String(a.title || '') + ' [' + (a.sourceLabel || 'FINWIRE') + ']'; });
}

/* The verdict word decides the colour; the rest of the answer is shown as the
   model wrote it. Models decorate the first word ("**GOOD**", "“Bad.”", "- GOOD -"),
   so markdown, quotes and stray punctuation are stripped before the word is
   read. Only the first word is looked at, never one later in a sentence. */
function pfBuzzTone(text) {
  const clean = String(text || '')
    .replace(/[*_`#>{}\[\]()]/g, ' ')
    .replace(/["'\u2018\u2019\u201c\u201d\u00ab\u00bb]/g, ' ')
    .replace(/[\u2013\u2014\u2022\u00b7]/g, ' ')
    .trim()
    .toLowerCase();
  const word = clean.replace(/^[^a-z]+/, '').match(/^[a-z]+/);
  if (!word) return '';
  const verdict = word[0];
  return (verdict === 'good' || verdict === 'bad' || verdict === 'mixed' || verdict === 'unclear') ? verdict : '';
}

function paintBuzzRead(el, text) {
  if (!el) return;
  const tone = pfBuzzTone(text);
  el.textContent = text;
  el.className = 'pf-buzz-read' + (tone ? ' is-' + tone : '');
  el.hidden = false;
}

async function runBuzzAi(btn) {
  const symbol = btn.getAttribute('data-buzz-ai');
  const body = btn.closest('.pf-buzz-body');
  const slot = body ? body.querySelector('.pf-buzz-read') : null;
  if (!symbol || !slot) return;
  const t = I18N[state.lang].mkt;
  const cached = buzzAiCached(symbol);
  if (cached) { paintBuzzRead(slot, cached); return; }
  if (!slot.hidden && slot.textContent) return;

  const news = pfBuzzNews(symbol);
  if (!news.length) { paintBuzzRead(slot, t.buzzAiNoNews); return; }
  if (!aiSpend()) { paintBuzzRead(slot, aiBlockText()); return; }

  const stop = startClock(slot, '✨ ' + t.buzzAi + '…');
  try {
    const data = await aiRequest('/ai-sentiment', {
      symbol: symbol, name: buzzNames[symbol] || '', newsText: news.join('\n'), lang: state.lang
    });
    const text = (data && data.summary ? String(data.summary) : '').trim();
    if (!text) throw new Error('Empty AI read');
    buzzAiCache[buzzAiKey(symbol)] = { text: text, at: Date.now() };
    buzzAiSave();
    stop();
    paintBuzzRead(slot, text);
  } catch (err) {
    stop();
    if (aiMissingEndpoint(err)) aiRefund();
    paintBuzzRead(slot, aiErrorText(err));
  }
}

function buzzBoardHtml() {
  const t = I18N[state.lang].mkt;
  const rows = pfBuzzRank();
  /* The header says how many names the top ten was picked from, so a short
     list reads as a quiet week rather than a narrow board. */
  const counts = { us: buzzUsCandidates().length, idx: buzzIdxCandidates().length };
  const column = function (region, label) {
    const list = rows.filter(function (r) { return r.region === region; }).slice(0, PF_BUZZ_ROWS);
    return `<div class="buzz-col">
        <div class="buzz-col-head"><span>${esc(label)}</span><i>${esc(t.buzzTop)} · ${counts[region]}</i></div>
        ${list.length
          ? `<ol class="pf-buzz">${list.map(pfBuzzRowHtml).join('')}</ol>`
          : `<div class="pf-empty-sm">${esc(t.buzzEmpty)}</div>`}
      </div>`;
  };
  return `<div class="buzz-cols">${column('us', t.buzzUs)}${column('idx', t.buzzIdx)}</div>`;
}

/* Repainting on every news render is wasteful, so the output is kept against
   the inputs that can change it. */
let pfBuzzCache = { key: '', html: '' };

function renderBuzzBoard() {
  const slot = document.getElementById('buzzBoard');
  if (!slot) return;
  const key = [state.lang, state.articles.length, (state.articles[0] && state.articles[0].ts) || 0,
    Object.keys(buzzNames).length, Object.keys(buzzAiCache).length].join('|');
  if (pfBuzzCache.key !== key) {
    pfBuzzCache.key = key;
    pfBuzzCache.html = buzzBoardHtml();
  }
  slot.innerHTML = pfBuzzCache.html;
}

/* Headlines that name a company you actually own, so the Markets view also
   answers "is anything happening at my companies" without leaving the page. */
function pfHoldingTerms() {
  const terms = [];
  portfolio.forEach(function (h) {
    const code = h.symbol.replace(/\.JK$/i, '').toLowerCase();
    if (code.length > 1) terms.push({ symbol: h.symbol, term: code });
    const q = pfQuotes[h.symbol];
    const name = (q && q.name) ? String(q.name).toLowerCase().trim() : '';
    if (name.length > 3) terms.push({ symbol: h.symbol, term: name });
  });
  return terms;
}
