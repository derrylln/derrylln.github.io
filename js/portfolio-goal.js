/* ------------------------------------------------------------
   Goal and contribution progress
   The one part of the portfolio that looks forward: what the book is
   worth today against a target, what it becomes if the same monthly
   addition keeps arriving, and how much that addition has to be to land
   on the target instead.
   ------------------------------------------------------------ */

const PF_GOAL_KEY = 'finwire.portfolio.goal.v1';
const PF_GOAL_DEFAULT = { amount: 0, years: 5, monthly: 0, rate: 8 };
const PF_GOAL_LOOKBACK = 6;

let pfGoalState = (function () {
  const out = Object.assign({}, PF_GOAL_DEFAULT);
  const saved = loadJSON(PF_GOAL_KEY, null);
  if (saved && typeof saved === 'object') {
    Object.keys(PF_GOAL_DEFAULT).forEach(function (k) {
      const v = Number(saved[k]);
      if (isFinite(v) && v >= 0) out[k] = v;
    });
  }
  return out;
})();

let pfGoalTarget = 'IDR';

/* What the ledger says was actually added, per month, over the last half
   year. Buys only: a sale is money leaving the book, not a contribution, and
   opening positions are carried in at cost like any other buy. */
function pfGoalContributions(months, target) {
  const cutoff = Date.now() - months * 30.44 * 864e5;
  let total = 0, count = 0;
  (pfLedger || []).forEach(function (e) {
    if (!e || e.side !== 'buy') return;
    const day = new Date(String(e.date) + 'T00:00:00Z').getTime();
    if (!isFinite(day) || day < cutoff) return;
    const cash = pfConvert(Number(e.qty) * Number(e.price), e.cur, target);
    if (cash == null || !isFinite(cash)) return;
    total += cash;
    count++;
  });
  return { total: total, count: count, perMonth: total / Math.max(1, months) };
}

/* Monthly compounding, because contributions arrive monthly and a yearly
   figure compounded yearly would quietly overstate what lands. */
function pfGoalCalc(target) {
  const value = pfBookValue(target);
  const goal = Number(pfGoalState.amount) || 0;
  const months = Math.round((Number(pfGoalState.years) || 0) * 12);
  const monthly = Number(pfGoalState.monthly) || 0;
  const rm = Math.pow(1 + (Number(pfGoalState.rate) || 0) / 100, 1 / 12) - 1;
  const growth = months > 0 ? Math.pow(1 + rm, months) : 1;
  const annuity = months > 0 ? (Math.abs(rm) < 1e-9 ? months : (growth - 1) / rm) : 0;
  const projected = value * growth + monthly * annuity;
  const need = goal - value * growth;
  const required = months > 0 && annuity > 0 && need > 0 ? need / annuity : 0;
  return {
    value: value, goal: goal, months: months, monthly: monthly,
    projected: projected, required: required, gap: projected - goal,
    progress: goal > 0 ? (value / goal) * 100 : null,
    onTrack: goal > 0 && projected >= goal
  };
}

/* Amounts are grouped the way the reader writes them; a bare 1000000000 in a
   box is a number you have to count digits in to trust. */
function pfGoalDisplay(key, value) {
  if (key !== 'amount' && key !== 'monthly') return String(value);
  const n = Number(value) || 0;
  return n.toLocaleString(state.lang === 'id' ? 'id-ID' : 'en-US', { maximumFractionDigits: 0 });
}

function pfGoalField(key, label, value) {
  const money = key === 'amount' || key === 'monthly';
  const attrs = money
    ? 'type="text" inputmode="numeric" autocomplete="off" data-pf-money="1"'
    : `type="number" min="0" step="${key === 'years' ? '0.5' : '0.5'}"`;
  return `<label class="pf-goal-field">
      <span>${esc(label)}</span>
      <input ${attrs} value="${esc(pfGoalDisplay(key, value))}" data-pf-goal="${key}">
    </label>`;
}

function pfGoalHtml(target) {
  const p = (I18N[state.lang] || I18N.en).portfolio;
  pfGoalTarget = target;
  const c = pfGoalCalc(target);
  const recent = pfGoalContributions(PF_GOAL_LOOKBACK, target);
  const barW = c.progress == null ? 0 : Math.max(0, Math.min(100, c.progress));
  const money = function (v) { return v == null || !isFinite(v) ? '—' : pfMoney(v, target); };

  const form = `<div class="pf-goal-form">
      ${pfGoalField('amount', p.goalAmount, pfGoalState.amount)}
      ${pfGoalField('years', p.goalYears, pfGoalState.years)}
      ${pfGoalField('monthly', p.goalMonthly, pfGoalState.monthly)}
      ${pfGoalField('rate', p.goalRate, pfGoalState.rate)}
    </div>`;

  if (!c.goal || c.months <= 0) {
    return form + `<div class="pf-empty-sm">${esc(p.goalEmpty)}</div>`;
  }

  const projectedNote = c.gap >= 0
    ? '+' + pfMoney(c.gap, target) + ' ' + p.goalAhead
    : pfMoney(Math.abs(c.gap), target) + ' ' + p.goalShort;

  return form + `<div class="pf-goal-stats">
      <div class="pf-risk-cell">
        <span>${esc(p.goalNow)}</span>
        <strong>${money(c.value)}</strong>
        <em>${esc(p.goalOfGoal.replace('{goal}', money(c.goal)))}</em>
      </div>
      <div class="pf-risk-cell">
        <span>${esc(p.goalProg)}</span>
        <strong>${c.progress == null ? '—' : c.progress.toFixed(1) + '%'}</strong>
        <em>${esc(p.goalInYears.replace('{years}', String(pfGoalState.years)))}</em>
      </div>
      <div class="pf-risk-cell">
        <span>${esc(p.goalProj)}</span>
        <strong class="${c.onTrack ? 'up' : 'down'}">${money(c.projected)}</strong>
        <em>${esc(projectedNote)}</em>
      </div>
      <div class="pf-risk-cell">
        <span>${esc(p.goalNeed)}</span>
        <strong>${money(c.required)}</strong>
        <em>${esc(p.goalYouAdd.replace('{amount}', money(recent.perMonth)))}</em>
      </div>
    </div>
    <div class="pf-goal-bar" aria-hidden="true"><i style="width:${barW.toFixed(1)}%"></i></div>
    <p class="pf-goal-note">${esc(p.goalNote)}</p>`;
}

document.addEventListener('change', function (e) {
  const input = e.target && e.target.closest ? e.target.closest('[data-pf-goal]') : null;
  if (!input) return;
  const key = input.getAttribute('data-pf-goal');
  if (!Object.prototype.hasOwnProperty.call(PF_GOAL_DEFAULT, key)) return;
  const raw = input.hasAttribute('data-pf-money')
    ? Number(String(input.value).replace(/[^\d]/g, ''))
    : Number(input.value);
  if (!isFinite(raw) || raw < 0) return;
  pfGoalState[key] = raw;
  saveJSON(PF_GOAL_KEY, pfGoalState);
  const slot = document.getElementById('pfGoalSlot');
  if (slot) slot.innerHTML = pfGoalHtml(pfGoalTarget);
});
