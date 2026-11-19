export const CURRENCIES = [
  'EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'NZD', 'JPY',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'BRL', 'INR', 'MXN',
];

const MAX_ITEMS = 100;
const MAX_NAME = 80;
const MAX_NOTE = 200;
const MAX_VALUE = 1e9;
const MAX_CHANGES = 50;

export function defaultState() {
  return {
    v: 1,
    currency: 'EUR',
    services: [],
    others: [],
    power: { watts: 30, hoursPerDay: 24, pricePerKwh: 0.25, changes: [] },
    hardware: { months: 36, since: '', purchases: [] },
  };
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const amount = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, MAX_VALUE) : fallback;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const month = (value) => (typeof value === 'string' && MONTH.test(value) ? value : '');

const text = (value) => (typeof value === 'string' ? value.slice(0, MAX_NAME) : '');

// Price changes: from `month` on, the price is `amount` (same billing period).
function changes(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_CHANGES).filter((x) => x && typeof x === 'object' && month(x.month))
    .map((x) => ({ month: x.month, amount: amount(x.amount) }));
}

function purchases(hardware) {
  if (Array.isArray(hardware.purchases)) {
    return hardware.purchases.slice(0, MAX_ITEMS).filter((x) => x && typeof x === 'object').map((x) => ({
      id: text(x.id) || uid(),
      name: text(x.name),
      note: typeof x.note === 'string' ? x.note.slice(0, MAX_NOTE) : '',
      cost: amount(x.cost),
      month: month(x.month),
    }));
  }
  // Before 0.5.0 there was a single hardware cost, bought in the start month.
  const cost = amount(hardware.cost);
  return cost > 0 ? [{ id: uid(), name: '', note: '', cost, month: month(hardware.since) }] : [];
}

function items(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_ITEMS).filter((x) => x && typeof x === 'object').map((x) => ({
    id: text(x.id) || uid(),
    ref: text(x.ref),
    name: text(x.name),
    note: typeof x.note === 'string' ? x.note.slice(0, MAX_NOTE) : '',
    amount: amount(x.amount),
    period: x.period === 'year' ? 'year' : 'month',
    since: month(x.since),
    until: month(x.until),
    changes: changes(x.changes),
  }));
}

export function normalize(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const power = raw.power || {};
  const hardware = raw.hardware || {};
  return {
    v: 1,
    currency: CURRENCIES.includes(raw.currency) ? raw.currency : base.currency,
    services: items(raw.services),
    others: items(raw.others),
    power: {
      watts: amount(power.watts, base.power.watts),
      hoursPerDay: Math.min(amount(power.hoursPerDay, base.power.hoursPerDay), 24),
      pricePerKwh: amount(power.pricePerKwh, base.power.pricePerKwh),
      changes: changes(power.changes),
    },
    hardware: {
      months: amount(hardware.months, base.hardware.months),
      since: month(hardware.since),
      purchases: purchases(hardware),
    },
  };
}
