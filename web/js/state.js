export const CURRENCIES = [
  'EUR', 'USD', 'GBP', 'CHF', 'CAD', 'AUD', 'NZD', 'JPY',
  'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'BRL', 'INR', 'MXN',
];

const MAX_ITEMS = 100;
const MAX_NAME = 80;
const MAX_VALUE = 1e9;

export function defaultState() {
  return {
    v: 1,
    currency: 'EUR',
    services: [],
    others: [],
    power: { watts: 30, hoursPerDay: 24, pricePerKwh: 0.25 },
    hardware: { cost: 0, months: 36, since: '' },
  };
}

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const amount = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, MAX_VALUE) : fallback;
};

const text = (value) => (typeof value === 'string' ? value.slice(0, MAX_NAME) : '');

function items(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_ITEMS).filter((x) => x && typeof x === 'object').map((x) => ({
    id: text(x.id) || uid(),
    ref: text(x.ref),
    name: text(x.name),
    amount: amount(x.amount),
    period: x.period === 'year' ? 'year' : 'month',
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
    },
    hardware: {
      cost: amount(hardware.cost),
      months: amount(hardware.months, base.hardware.months),
      since: /^\d{4}-(0[1-9]|1[0-2])$/.test(hardware.since) ? hardware.since : '',
    },
  };
}
