/* ------------------------------------------------------------
   The world index board
   ------------------------------------------------------------ */
const WORLD_INDICES = [
  { region: 'americas', name: 'S&P 500', where: 'United States', symbol: '^GSPC' },
  { region: 'americas', name: 'TSX', where: 'Canada', symbol: '^GSPTSE' },
  { region: 'americas', name: 'IPC', where: 'Mexico', symbol: '^MXX' },
  { region: 'americas', name: 'Ibovespa', where: 'Brazil', symbol: '^BVSP' },
  { region: 'americas', name: 'Merval', where: 'Argentina', symbol: '^MERV' },
  { region: 'europe', name: 'FTSE 100', where: 'United Kingdom', symbol: '^FTSE' },
  { region: 'europe', name: 'DAX', where: 'Germany', symbol: '^GDAXI' },
  { region: 'europe', name: 'CAC 40', where: 'France', symbol: '^FCHI' },
  { region: 'europe', name: 'Euro Stoxx 50', where: 'Eurozone', symbol: '^STOXX50E' },
  { region: 'europe', name: 'IBEX 35', where: 'Spain', symbol: '^IBEX' },
  { region: 'europe', name: 'FTSE MIB', where: 'Italy', symbol: 'FTSEMIB.MI' },
  { region: 'europe', name: 'AEX', where: 'Netherlands', symbol: '^AEX' },
  { region: 'europe', name: 'SMI', where: 'Switzerland', symbol: '^SSMI' },
  { region: 'apac', name: 'IHSG', where: 'Indonesia', symbol: '^JKSE' },
  { region: 'apac', name: 'Nikkei 225', where: 'Japan', symbol: '^N225' },
  { region: 'apac', name: 'Hang Seng', where: 'Hong Kong', symbol: '^HSI' },
  { region: 'apac', name: 'Shanghai', where: 'China', symbol: '000001.SS' },
  { region: 'apac', name: 'KOSPI', where: 'South Korea', symbol: '^KS11' },
  { region: 'apac', name: 'TAIEX', where: 'Taiwan', symbol: '^TWII' },
  { region: 'apac', name: 'Sensex', where: 'India', symbol: '^BSESN' },
  { region: 'apac', name: 'ASX 200', where: 'Australia', symbol: '^AXJO' },
  { region: 'apac', name: 'STI', where: 'Singapore', symbol: '^STI' },
  { region: 'apac', name: 'KLCI', where: 'Malaysia', symbol: '^KLSE' },
  { region: 'emea', name: 'BIST 100', where: 'Turkey', symbol: 'XU100.IS' },
  { region: 'emea', name: 'JSE Top 40', where: 'South Africa', symbol: '^JN0U.JO' },
  { region: 'emea', name: 'TA-125', where: 'Israel', symbol: '^TA125.TA' }
];

/* Country names are the one thing on a tile that is not a proper name, so they
   follow the page language rather than the exchange's. */
const WORLD_PLACES_ID = {
  'United States': 'Amerika Serikat', 'Canada': 'Kanada', 'Mexico': 'Meksiko', 'Brazil': 'Brasil',
  'Argentina': 'Argentina', 'United Kingdom': 'Inggris', 'Germany': 'Jerman', 'France': 'Prancis',
  'Eurozone': 'Zona Euro', 'Spain': 'Spanyol', 'Italy': 'Italia', 'Netherlands': 'Belanda',
  'Switzerland': 'Swiss', 'Indonesia': 'Indonesia', 'Japan': 'Jepang', 'Hong Kong': 'Hong Kong',
  'China': 'Tiongkok', 'South Korea': 'Korea Selatan', 'Taiwan': 'Taiwan', 'India': 'India',
  'Australia': 'Australia', 'Singapore': 'Singapura', 'Malaysia': 'Malaysia', 'Turkey': 'Turki',
  'South Africa': 'Afrika Selatan', 'Israel': 'Israel'
};

const WORLD_SORT_KEY = 'fw.worldidx.sort';
let worldSort = (function () {
  let v = 'region';
  try { v = localStorage.getItem(WORLD_SORT_KEY) || 'region'; } catch (e) {}
  return v === 'move' ? 'move' : 'region';
})();

function worldPlace(entry) {
  return (state.lang === 'id' && WORLD_PLACES_ID[entry.where]) || entry.where;
}

const WORLD_CACHE_KEY = 'fw.worldidx.v1';
const WORLD_CACHE_TTL = 10 * 60 * 1000;
let worldCache = loadJSON(WORLD_CACHE_KEY, null);
if (!worldCache || typeof worldCache !== 'object' || !worldCache.rows) worldCache = { ts: 0, rows: {} };
let worldBusy = false;

/* Level and the day's move both come out of the month of closes, so a tile
   costs one request rather than a quote plus a history. */
async function worldFetch(symbol) {
  const hist = await fetchHistory(symbol, '1mo').catch(function () { return []; });
  const pts = (hist || []).filter(function (p) { return p && isFinite(p.y) && p.y > 0; });
  if (pts.length < 2) return null;
  const level = pts[pts.length - 1].y;
  const prev = pts[pts.length - 2].y;
  return {
    level: level,
    pct: (level / prev - 1) * 100,
    spark: pts.map(function (p) { return Math.round(p.y * 100) / 100; })
  };
}

function worldSpark(vals, up) {
  if (!vals || vals.length < 2) return '';
  const min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  const span = (max - min) || 1;
  const w = 120, h = 34, pad = 3;
  const pts = vals.map(function (v, i) {
    return [(i / (vals.length - 1) * w).toFixed(1), (h - pad - ((v - min) / span) * (h - pad * 2)).toFixed(1)];
  });
  const line = pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ');
  const line2 = pts.map(function (p) { return 'L' + p[0] + ',' + p[1]; }).join(' ');
  /* non-scaling-stroke keeps the line one hairline wide even though the shape
     stretches to whatever width the card ends up with */
  return `<svg class="world-spark ${up ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">`
    + `<path class="world-area" d="M0,${h} ${line2} L${w},${h} Z"></path>`
    + `<polyline points="${line}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"></polyline>`
    + `</svg>`;
}

function worldTileHtml(entry, row) {
  const up = row.pct >= 0;
  return `<div class="world-tile ${up ? 'up' : 'down'}" title="${esc(worldPlace(entry) + ' · ' + entry.symbol)}">
      <span class="world-where">${esc(worldPlace(entry))}</span>
      <b class="world-name">${esc(entry.name)}</b>
      <span class="world-level">${esc(mktFmt(row.level, 2))}</span>
      <div class="world-foot">
        <span class="world-pct ${up ? 'up' : 'down'}">${up ? '+' : ''}${row.pct.toFixed(2)}%</span>
        ${worldSpark(row.spark, up)}
      </div>
    </div>`;
}

const WORLD_REGIONS = ['americas', 'europe', 'apac', 'emea'];

function worldBoardHtml() {
  const m = I18N[state.lang].market;
  if (worldSort === 'move') {
    /* Strongest first, so the top-left tile answers "where is money going
       today" without reading a single number. */
    const ranked = WORLD_INDICES.filter(function (e) { return worldCache.rows[e.symbol]; })
      .sort(function (a, b) { return worldCache.rows[b.symbol].pct - worldCache.rows[a.symbol].pct; })
      .map(function (e) { return worldTileHtml(e, worldCache.rows[e.symbol]); });
    return ranked.length ? `<div class="world-grid">${ranked.join('')}</div>`
      : `<div class="pf-empty-sm">${esc(m.worldEmpty)}</div>`;
  }
  const built = WORLD_REGIONS.map(function (region) {
    const tiles = WORLD_INDICES.filter(function (e) { return e.region === region; })
      .filter(function (e) { return worldCache.rows[e.symbol]; })
      .map(function (e) { return worldTileHtml(e, worldCache.rows[e.symbol]); });
    if (!tiles.length) return '';
    return `<div class="world-region">
        <h3 class="world-region-head">${esc(m['world_' + region] || region)}</h3>
        <div class="world-grid">${tiles.join('')}</div>
      </div>`;
  }).filter(Boolean);
  return built.length ? built.join('') : `<div class="pf-empty-sm">${esc(m.worldEmpty)}</div>`;
}

let worldPainted = 0;

function paintWorldBoard() {
  const slot = document.getElementById('worldBoard');
  if (!slot) return;
  slot.innerHTML = worldBoardHtml();
}

/* Four at a time, like the dividend scan, and the board repaints as answers
   land so the first tiles are readable while the rest are still loading. */
function loadWorldBoard(force) {
  const slot = document.getElementById('worldBoard');
  if (!slot) return;
  const fresh = worldCache.ts && (Date.now() - worldCache.ts) < WORLD_CACHE_TTL;
  if (Object.keys(worldCache.rows).length) paintWorldBoard();
  if (fresh && !force) return;
  if (worldBusy) return;
  worldBusy = true;
  const m = I18N[state.lang].market;
  if (!Object.keys(worldCache.rows).length) slot.innerHTML = `<div class="pf-empty-sm">${esc(m.worldLoading)}</div>`;
  const queue = WORLD_INDICES.filter(function (e) { return force || !worldCache.rows[e.symbol]; });
  let index = 0, active = 0, done = 0;
  const total = queue.length;
  const step = function () {
    if (index >= total && active === 0) {
      worldCache.ts = Date.now();
      saveJSON(WORLD_CACHE_KEY, worldCache);
      worldBusy = false;
      paintWorldBoard();
      return;
    }
    while (active < 4 && index < total) {
      const entry = queue[index++];
      active++;
      worldFetch(entry.symbol).then(function (row) {
        if (row) worldCache.rows[entry.symbol] = row;
        done++;
        if (done % 4 === 0) paintWorldBoard();
      }).catch(function () {}).finally(function () { active--; step(); });
    }
  };
  step();
}
