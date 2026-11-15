/* ------------------------------------------------------------
   Shared state and the small helpers everything else uses
   ------------------------------------------------------------ */
const MKT_HERO_KEY = 'finwire.market.heroes.v1';
function mktHeroSymbols() {
  const saved = loadJSON(MKT_HERO_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved.filter(function (sym, i) {
    return typeof sym === 'string' && sym && saved.indexOf(sym) === i;
  });
}
function saveMktHeroes(list) { saveJSON(MKT_HERO_KEY, list); }

const SOURCE_BY_ID = {};
SOURCES.forEach(function (source) { SOURCE_BY_ID[source.id] = source; });

const state = { articles: [], ticker: [], filter: 'all', categoryFilter: 'all', region: 'all', unreadOnly: false, marketView: 'holdings', lang: 'en', read: new Set(), watch: [], lastTs: 0, lastKind: '', loading: false };

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.prototype.slice.call(root.querySelectorAll(sel));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function loadJSON(key, fallback) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (e) { return fallback; } }
function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
function timeAgo(ts, lang) {
  const t = I18N[lang] || I18N.en; const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (secs < 60) return t.justNow; const mins = Math.floor(secs / 60);
  if (mins < 60) return t.minAgo(mins); const hours = Math.floor(mins / 60);
  if (hours < 24) return t.hourAgo(hours); return t.dayAgo(Math.floor(hours / 24));
}
function stripHtml(html) { if (!html) return ''; const doc = new DOMParser().parseFromString(String(html), 'text/html'); doc.querySelectorAll('script, style, noscript').forEach(n => n.remove()); return (doc.body.textContent || '').replace(/\s+/g, ' ').trim(); }

function categorizeArticle(article) {
  const text = (article.title + ' ' + article.summary).toLowerCase();
  for (const cat of CATEGORIES) {
    if (cat.id === 'all') continue;
    if (cat.keywords.some(kw => text.includes(kw))) {
      return cat.id;
    }
  }
  return 'markets';
}

/* CORS PROXY LAYER */
