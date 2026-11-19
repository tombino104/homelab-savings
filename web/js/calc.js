export const DAYS_PER_MONTH = 365.25 / 12;
const MAX_MONTHS = 1200;
const EPSILON = 1e-9;

const positive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function toMonthly(amount, period) {
  const value = positive(amount);
  return period === 'year' ? value / 12 : value;
}

export function monthIndex(value) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value || '');
  return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : null;
}

export function monthFromIndex(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function currentMonth(now = new Date()) {
  return monthFromIndex(now.getFullYear() * 12 + now.getMonth());
}

/* Prices that change over time */

function sortedChanges(changes) {
  return (changes || [])
    .map((change) => ({ change, month: monthIndex(change.month) }))
    .filter((entry) => entry.month !== null)
    .sort((a, b) => a.month - b.month);
}

// The price entry that applies in `month`: the latest change from that month or
// before, or else the starting price. Returns the object that holds it, so the
// page can edit "the price now" in place. `key` is where the starting price is.
export function priceEntry(owner, month, key = 'amount') {
  let entry = { target: owner, key };
  for (const { change, month: from } of sortedChanges(owner.changes)) {
    if (from <= month) entry = { target: change, key: 'amount' };
  }
  return entry;
}

export function priceAt(owner, month, key = 'amount') {
  const { target, key: field } = priceEntry(owner, month, key);
  return positive(target[field]);
}

export function monthlyAt(item, month) {
  return toMonthly(priceAt(item, month), item.period);
}

/* Services and costs */

// An item counts in a month when it has started (no start month: since the
// beginning) and has not ended yet (the end month is the last one it counts in).
export function isActive(item, month) {
  const since = monthIndex(item.since);
  const until = monthIndex(item.until);
  return (since === null || since <= month) && (until === null || until >= month);
}

export function isEnded(item, month) {
  const until = monthIndex(item.until);
  return until !== null && until < month;
}

function sumMonthly(items, month) {
  return (items || [])
    .filter((item) => isActive(item, month))
    .reduce((total, item) => total + monthlyAt(item, month), 0);
}

export function kwhPerMonth(power) {
  const watts = positive(power?.watts);
  const hours = Math.min(positive(power?.hoursPerDay), 24);
  return (watts / 1000) * hours * DAYS_PER_MONTH;
}

function electricityAt(power, month) {
  return kwhPerMonth(power) * priceAt(power || {}, month, 'pricePerKwh');
}

/* Hardware */

// Each purchase, with its cost and month. Data from before 0.5.0 had a single
// cost bought in the start month.
export function purchasesOf(state) {
  const hardware = state.hardware || {};
  if (Array.isArray(hardware.purchases)) return hardware.purchases;
  const cost = positive(hardware.cost);
  return cost > 0 ? [{ cost, month: hardware.since || '' }] : [];
}

// The month the homelab started: the one entered, or else the earliest month of
// any service, cost or purchase. Null when nothing is dated.
export function startMonth(state) {
  const explicit = monthIndex(state.hardware?.since);
  if (explicit !== null) return explicit;
  const dated = [
    ...[...(state.services || []), ...(state.others || [])].map((item) => monthIndex(item.since)),
    ...purchasesOf(state).map((purchase) => monthIndex(purchase.month)),
  ].filter((value) => value !== null);
  return dated.length ? Math.min(...dated) : null;
}

/* Over time */

// Money kept after `k` whole months since the start. Each service counts for
// the months it was in use, at the price of each month; each cost likewise,
// in the negative; electricity every month; each hardware purchase in full in
// its month. Without a start month there is no history, so today's numbers
// are used for every month and all the hardware is paid at month 0.
export function makeTimeline(state, now = new Date()) {
  const current = now.getFullYear() * 12 + now.getMonth();
  const start = startMonth(state);
  const purchases = purchasesOf(state);

  if (start === null) {
    const hardwareCost = purchases.reduce((sum, p) => sum + positive(p.cost), 0);
    const rate = sumMonthly(state.services, current) - sumMonthly(state.others, current)
      - electricityAt(state.power, current);
    return { start: null, current, at: (k) => k * rate - hardwareCost };
  }

  const offset = (value, fallback) => Math.max(monthIndex(value) ?? fallback, start) - start;
  const flow = new Float64Array(MAX_MONTHS + 1);
  const spans = (items, sign) => {
    for (const item of items || []) {
      const from = offset(item.since, start);
      const until = monthIndex(item.until);
      const to = Math.min(MAX_MONTHS, until === null ? MAX_MONTHS : until - start + 1);
      for (let m = from; m < to; m++) flow[m] += sign * monthlyAt(item, start + m);
    }
  };
  spans(state.services, 1);
  spans(state.others, -1);
  for (let m = 0; m < MAX_MONTHS; m++) flow[m] -= electricityAt(state.power, start + m);

  // cumulative[k]: everything up to the end of month k - 1, and the purchases
  // made up to month k (a purchase is paid at the start of its month).
  const cumulative = new Float64Array(MAX_MONTHS + 1);
  const paid = new Float64Array(MAX_MONTHS + 1);
  for (const purchase of purchases) {
    const at = offset(purchase.month, start);
    if (at <= MAX_MONTHS) paid[at] += positive(purchase.cost);
  }
  let running = 0;
  let hardware = 0;
  for (let k = 0; k <= MAX_MONTHS; k++) {
    if (k > 0) running += flow[k - 1];
    hardware += paid[k];
    cumulative[k] = running - hardware;
  }
  const at = (k) => cumulative[Math.max(0, Math.min(MAX_MONTHS, Math.round(k)))];
  return { start, current, at };
}

export function calculate(state, now = new Date()) {
  const month = now.getFullYear() * 12 + now.getMonth();
  const gross = sumMonthly(state.services, month);
  const kwh = kwhPerMonth(state.power);
  const electricity = electricityAt(state.power, month);
  const other = sumMonthly(state.others, month);
  const running = electricity + other;

  const spreadMonths = Math.max(1, Math.round(positive(state.hardware?.months)));
  const start = startMonth(state);
  const purchases = purchasesOf(state);
  const hardwareCost = purchases.reduce((sum, p) => sum + positive(p.cost), 0);
  // The monthly figure spreads each purchase over the months after it was made.
  const hardware = purchases.reduce((sum, p) => {
    const bought = monthIndex(p.month) ?? start;
    const spreading = bought === null || (bought <= month && month < bought + spreadMonths);
    return spreading ? sum + positive(p.cost) / spreadMonths : sum;
  }, 0);

  const netBeforeHardware = gross - running;
  const net = netBeforeHardware - hardware;
  const timeline = makeTimeline(state, now);

  return {
    gross,
    kwh,
    electricity,
    other,
    hardware,
    spreadMonths,
    netMonthly: net,
    netYearly: net * 12,
    netBeforeHardware,
    hardwareCost,
    timeline,
    payback: payback(hardwareCost, netBeforeHardware, timeline),
    total: total(timeline),
    contributions: contributions(state, timeline),
  };
}

// The break-even: the month from which the money kept stays at zero or above.
// A purchase made later can push it below zero again, and then the break-even
// moves to when it climbs back.
function payback(hardwareCost, netBeforeHardware, { start, current, at }) {
  if (hardwareCost <= 0) return { status: 'none', months: null, date: null };

  if (start === null) {
    if (netBeforeHardware <= 0) return { status: 'never', months: null, date: null };
    const months = Math.max(1, Math.ceil(hardwareCost / netBeforeHardware - EPSILON));
    return { status: 'pending', months, date: null };
  }

  const elapsed = Math.max(0, current - start);
  let streak = null;
  for (let k = 1; k <= MAX_MONTHS; k++) {
    if (at(k) >= -EPSILON) {
      streak ??= k;
      if (k >= elapsed) {
        const end = start + streak;
        return { status: current >= end ? 'reached' : 'pending', months: streak, date: monthFromIndex(end) };
      }
    } else {
      streak = null;
    }
  }
  return { status: 'never', months: null, date: null };
}

function total({ start, current, at }) {
  if (start === null) return { status: 'unknown', months: null, amount: null };
  if (current < start) return { status: 'future', months: 0, amount: null };
  const months = current - start;
  return { status: 'running', months, amount: at(months) };
}

// How much each service has saved so far, largest first. Without a start month
// there is no history, so it is what each one saves per month now.
function contributions(state, { start, current }) {
  const list = (state.services || []).map((item) => {
    let amount = 0;
    if (start === null) {
      amount = isActive(item, current) ? monthlyAt(item, current) : 0;
    } else {
      const from = Math.max(monthIndex(item.since) ?? start, start);
      const until = monthIndex(item.until);
      const to = Math.min(current, until === null ? current : until + 1);
      for (let m = from; m < to; m++) amount += monthlyAt(item, m);
    }
    return { id: item.id, name: item.name, amount };
  });
  return {
    perMonth: start === null,
    list: list.filter((entry) => entry.amount > 0).sort((a, b) => b.amount - a.amount),
  };
}

// What will have been kept after `years` since the start.
export function projection(years, timeline) {
  return timeline.at(years * 12);
}

// How many months the chart shows: at least a year, a bit past today and past
// the break-even.
export function chartHorizon(result, elapsed) {
  const wanted = [12, Math.ceil((elapsed || 0) * 1.5)];
  if (result.payback.months) wanted.push(Math.ceil(result.payback.months * 1.25));
  return Math.min(120, Math.max(...wanted));
}
