export const DAYS_PER_MONTH = 365.25 / 12;
const MAX_MONTHS = 1200;

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
    .reduce((total, item) => total + toMonthly(item.amount, item.period), 0);
}

export function kwhPerMonth(power) {
  const watts = positive(power?.watts);
  const hours = Math.min(positive(power?.hoursPerDay), 24);
  return (watts / 1000) * hours * DAYS_PER_MONTH;
}

// The month the homelab started: the one entered, or else the earliest start
// month of any service or cost. Null when nothing is dated.
export function startMonth(state) {
  const explicit = monthIndex(state.hardware?.since);
  if (explicit !== null) return explicit;
  const dated = [...(state.services || []), ...(state.others || [])]
    .map((item) => monthIndex(item.since))
    .filter((value) => value !== null);
  return dated.length ? Math.min(...dated) : null;
}

// Money kept after `k` whole months since the start: each service counts only
// for the months it was in use, each cost only for the months it was paid,
// electricity for every month, and the whole hardware cost is paid upfront.
// Without a start month there is no history, so today's numbers are used for
// every month.
export function makeTimeline(state, now = new Date()) {
  const current = now.getFullYear() * 12 + now.getMonth();
  const start = startMonth(state);
  const hardwareCost = positive(state.hardware?.cost);
  const electricity = kwhPerMonth(state.power) * positive(state.power?.pricePerKwh);

  if (start === null) {
    const rate = sumMonthly(state.services, current) - sumMonthly(state.others, current) - electricity;
    return { start: null, current, at: (k) => k * rate - hardwareCost };
  }

  const span = (item, sign) => {
    const since = monthIndex(item.since);
    const until = monthIndex(item.until);
    return {
      from: Math.max(since ?? start, start) - start,
      to: until === null ? Infinity : until - start + 1,
      monthly: sign * toMonthly(item.amount, item.period),
    };
  };
  const spans = [
    ...(state.services || []).map((item) => span(item, 1)),
    ...(state.others || []).map((item) => span(item, -1)),
  ];

  const at = (k) => spans.reduce(
    (total, s) => total + s.monthly * Math.max(0, Math.min(k, s.to) - s.from),
    -electricity * k - hardwareCost,
  );
  return { start, current, at };
}

export function calculate(state, now = new Date()) {
  const month = now.getFullYear() * 12 + now.getMonth();
  const gross = sumMonthly(state.services, month);
  const kwh = kwhPerMonth(state.power);
  const electricity = kwh * positive(state.power?.pricePerKwh);
  const other = sumMonthly(state.others, month);
  const running = electricity + other;

  const hardwareCost = positive(state.hardware?.cost);
  const spreadMonths = Math.max(1, Math.round(positive(state.hardware?.months)));
  const hardware = hardwareCost / spreadMonths;

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
  };
}

function payback(hardwareCost, netBeforeHardware, { start, current, at }) {
  if (hardwareCost <= 0) return { status: 'none', months: null, date: null };

  if (start === null) {
    if (netBeforeHardware <= 0) return { status: 'never', months: null, date: null };
    const months = Math.max(1, Math.ceil(hardwareCost / netBeforeHardware - 1e-9));
    return { status: 'pending', months, date: null };
  }

  for (let k = 1; k <= MAX_MONTHS; k++) {
    if (at(k) >= -1e-9) {
      const end = start + k;
      return { status: current >= end ? 'reached' : 'pending', months: k, date: monthFromIndex(end) };
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
