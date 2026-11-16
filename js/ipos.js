/* ------------------------------------------------------------
   The IPO board
   ------------------------------------------------------------
   Reads IPO_DEALS (js/ipos-data.js) and draws one card per deal.
   Opening a card shows what the filing says, what it leaves
   unsettled, and where each number came from — the point of the
   page is that a reader can check it, not that it looks certain.

   Nothing here is fetched: the data is curated, so the board
   renders instantly and cannot be rate-limited. Money is shown in
   US dollars because every deal listed files in the US.
   ------------------------------------------------------------ */

const IPO_STATUS_KEY = {
  pricing: 'statusPricing',
  registration: 'statusRegistration',
  trading: 'statusTrading',
};

function ipoText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[state.lang] || value.en || '';
}

function ipoDate(iso) {
  if (!iso) return I18N[state.lang].ipo.noDate;
  const d = new Date(iso + 'T00:00:00Z');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(state.lang === 'id' ? 'id-ID' : 'en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

function ipoRows(rows) {
  return rows.map(function (row) {
    const note = ipoText(row.note);
    return `<div class="ipo-row">
      <div class="ipo-row-head"><span>${esc(ipoText(row.label))}</span><b>${esc(row.value)}</b></div>
      ${note ? `<p class="ipo-row-note">${esc(note)}</p>` : ''}
    </div>`;
  }).join('');
}

function ipoList(items) {
  return '<ul class="ipo-list">' + items.map(function (item) {
    return `<li>${esc(ipoText(item))}</li>`;
  }).join('') + '</ul>';
}

function ipoDetailHtml(deal) {
  const t = I18N[state.lang].ipo;
  const checks = [t.check1, t.check2, t.check3, t.check4, t.check5];
  const empty = `<p class="ipo-none">${esc(t.noneCurated)}</p>`;
  return `
    <div class="ipo-detail-head">
      <div>
        <p class="ipo-kicker">${esc(deal.ticker || '—')} · ${esc(deal.exchange)}</p>
        <h3 class="ipo-detail-title">${esc(deal.name)}</h3>
      </div>
      <button type="button" class="ipo-close" data-ipo-close="1">${esc(t.close)}</button>
    </div>
    <p class="ipo-detail-summary">${esc(ipoText(deal.summary))}</p>

    <div class="ipo-terms">
      <div><span>${esc(t.range)}</span><b>${esc(deal.terms.range)}</b></div>
      <div><span>${esc(t.shares)}</span><b>${esc(ipoText(deal.terms.shares))}</b></div>
      <div><span>${esc(t.dealSize)}</span><b>${esc(deal.terms.dealSize)}</b></div>
      <div><span>${esc(t.exchange)}</span><b>${esc(deal.exchange)}</b></div>
      <div><span>${esc(t.expected)}</span><b>${esc(ipoText(deal.terms.expected))}</b></div>
      <div><span>${esc(t.asOf)}</span><b>${esc(ipoDate(deal.asOf))}</b></div>
    </div>

    <h4 class="ipo-h">${esc(t.valuation)}</h4>
    ${deal.valuation.length ? `<div class="ipo-rows">${ipoRows(deal.valuation)}</div>` : empty}

    <h4 class="ipo-h">${esc(t.financials)}</h4>
    ${deal.financials.length ? `<div class="ipo-rows">${ipoRows(deal.financials)}</div>` : empty}

    ${deal.bull.length ? `<h4 class="ipo-h">${esc(t.bull)}</h4>${ipoList(deal.bull)}` : ''}
    ${deal.bear.length ? `<h4 class="ipo-h">${esc(t.bear)}</h4>${ipoList(deal.bear)}` : ''}

    <h4 class="ipo-h">${esc(t.unknown)}</h4>
    ${ipoList(deal.unknown)}

    <h4 class="ipo-h">${esc(t.checklist)}</h4>
    ${ipoList(checks)}

    <h4 class="ipo-h">${esc(t.sources)}</h4>
    <ul class="ipo-sources">
      ${deal.sources.map(function (source) {
        return `<li><a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.label)}</a></li>`;
      }).join('')}
    </ul>
    <p class="ipo-disclaimer">${esc(t.disclaimer)}</p>
  `;
}

function renderIpoBoard() {
  const host = $('#ipoBoard');
  if (!host) return;
  host.dataset.loaded = '1';
  const t = I18N[state.lang].ipo;

  const cards = IPO_DEALS.map(function (deal) {
    const statusKey = IPO_STATUS_KEY[deal.status] || 'statusRegistration';
    /* Sector is optional: an early filing does not always disclose enough to
       name one, and a guess would read as a fact on the card. */
    const meta = [deal.exchange && deal.exchange !== '—' ? deal.exchange : '', deal.sector ? ipoText(deal.sector) : '']
      .filter(Boolean).join(' · ');
    return `<button type="button" class="ipo-card" data-ipo="${esc(deal.id)}">
      <span class="ipo-card-top">
        <span class="ipo-ticker">${esc(deal.ticker || '—')}</span>
        <span class="ipo-status ipo-status-${esc(deal.status)}">${esc(t[statusKey])}</span>
      </span>
      <span class="ipo-name">${esc(deal.name)}</span>
      ${meta ? `<span class="ipo-meta">${esc(meta)}</span>` : ''}
      <span class="ipo-card-terms">
        <span><i>${esc(t.range)}</i><b>${esc(deal.terms.range)}</b></span>
        <span><i>${esc(t.expected)}</i><b>${esc(deal.date ? ipoDate(deal.date) : t.noDate)}</b></span>
      </span>
    </button>`;
  }).join('');

  host.innerHTML = `
    <p class="ipo-sub">${esc(t.sub)}</p>
    <div class="ipo-grid">${cards}</div>
    <div id="ipoDetail" class="ipo-detail" hidden></div>
  `;

  host.onclick = function (event) {
    const closer = event.target.closest('[data-ipo-close]');
    const card = event.target.closest('[data-ipo]');
    const detail = document.getElementById('ipoDetail');
    if (!detail) return;
    if (closer || (card && detail.dataset.open === card.getAttribute('data-ipo'))) {
      detail.hidden = true;
      detail.dataset.open = '';
      return;
    }
    if (!card) return;
    const deal = IPO_DEALS.filter(function (d) { return d.id === card.getAttribute('data-ipo'); })[0];
    if (!deal) return;
    detail.dataset.open = deal.id;
    detail.innerHTML = ipoDetailHtml(deal);
    detail.hidden = false;
    detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
}
