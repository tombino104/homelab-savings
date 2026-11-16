export const DAYS_PER_MONTH = 365.25 / 12;

const positive = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function toMonthly(amount, period) {
  const value = positive(amount);
  return period === 'year' ? value / 12 : value;
}

function sumMonthly(items) {
  return (items || []).reduce((total, item) => total + toMonthly(item.amount, item.period), 0);
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

export function kwhPerMonth(power) {
  const watts = positive(power?.watts);
  const hours = Math.min(positive(power?.hoursPerDay), 24);
  return (watts / 1000) * hours * DAYS_PER_MONTH;
}

export function calculate(state, now = new Date()) {
  const gross = sumMonthly(state.services);
  const kwh = kwhPerMonth(state.power);
  const electricity = kwh * positive(state.power?.pricePerKwh);
  const other = sumMonthly(state.others);
  const running = electricity + other;

  const hardwareCost = positive(state.hardware?.cost);
  const spreadMonths = Math.max(1, Math.round(positive(state.hardware?.months)));
  const hardware = hardwareCost / spreadMonths;

  const netBeforeHardware = gross - running;
  const net = netBeforeHardware - hardware;

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
    payback: payback(hardwareCost, netBeforeHardware, state.hardware?.since, now),
    total: total(hardwareCost, netBeforeHardware, state.hardware?.since, now),
  };
}

// Money kept so far: what the setup saved each month since it started, minus the
// whole hardware cost. It assumes today's numbers held the whole time, and counts
// whole months, like the break-even date does.
export function cumulative(months, netBeforeHardware, hardwareCost) {
  return months * netBeforeHardware - hardwareCost;
}

function total(hardwareCost, netBeforeHardware, since, now) {
  const start = monthIndex(since);
  if (start === null) return { status: 'unknown', months: null, amount: null };
  const current = now.getFullYear() * 12 + now.getMonth();
  if (current < start) return { status: 'future', months: 0, amount: null };
  const months = current - start;
  return { status: 'running', months, amount: cumulative(months, netBeforeHardware, hardwareCost) };
}

export function projection(years, netBeforeHardware, hardwareCost) {
  return cumulative(years * 12, netBeforeHardware, hardwareCost);
}

// Points of the cumulative curve, month 0 to `horizon`, for the chart.
export function chartHorizon(result, elapsed) {
  const wanted = [12, Math.ceil((elapsed || 0) * 1.5)];
  if (result.payback.months) wanted.push(Math.ceil(result.payback.months * 1.25));
  return Math.min(120, Math.max(...wanted));
}

function payback(hardwareCost, netBeforeHardware, since, now) {
  if (hardwareCost <= 0) return { status: 'none', months: null, date: null };
  if (netBeforeHardware <= 0) return { status: 'never', months: null, date: null };

  const months = Math.max(1, Math.ceil(hardwareCost / netBeforeHardware - 1e-9));
  const start = monthIndex(since);
  if (start === null) return { status: 'pending', months, date: null };

  const end = start + months;
  const current = now.getFullYear() * 12 + now.getMonth();
  return {
    status: current >= end ? 'reached' : 'pending',
    months,
    date: monthFromIndex(end),
  };
}
