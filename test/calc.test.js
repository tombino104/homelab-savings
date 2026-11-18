import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAYS_PER_MONTH, calculate, chartHorizon, kwhPerMonth, projection, monthFromIndex, monthIndex, toMonthly } from '../web/js/calc.js';
import { defaultState } from '../web/js/state.js';

const close = (actual, expected, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} is not close to ${expected}`);

function scenario(overrides = {}) {
  return {
    ...defaultState(),
    power: { watts: 0, hoursPerDay: 24, pricePerKwh: 0 },
    ...overrides,
  };
}

const NOW = new Date(2026, 5, 15);

test('yearly amounts are converted to monthly', () => {
  assert.equal(toMonthly(120, 'year'), 10);
  assert.equal(toMonthly(10, 'month'), 10);
});

test('invalid or negative amounts count as zero', () => {
  assert.equal(toMonthly(-5, 'month'), 0);
  assert.equal(toMonthly('abc', 'month'), 0);
  assert.equal(toMonthly(undefined, 'year'), 0);
  assert.equal(toMonthly(Infinity, 'month'), 0);
});

test('electricity is computed from watts, hours per day and price', () => {
  const kwh = kwhPerMonth({ watts: 100, hoursPerDay: 24 });
  close(kwh, 0.1 * 24 * DAYS_PER_MONTH);
  const result = calculate(scenario({ power: { watts: 100, hoursPerDay: 24, pricePerKwh: 0.2 } }), NOW);
  close(result.electricity, kwh * 0.2);
});

test('hours per day are capped at 24', () => {
  assert.equal(kwhPerMonth({ watts: 100, hoursPerDay: 48 }), kwhPerMonth({ watts: 100, hoursPerDay: 24 }));
});

test('gross savings add monthly and yearly services', () => {
  const result = calculate(scenario({
    services: [
      { amount: 10, period: 'month' },
      { amount: 60, period: 'year' },
    ],
  }), NOW);
  close(result.gross, 15);
  close(result.netMonthly, 15);
  close(result.netYearly, 180);
});

test('other costs are subtracted, yearly ones are spread', () => {
  const result = calculate(scenario({
    services: [{ amount: 30, period: 'month' }],
    others: [{ amount: 12, period: 'year' }, { amount: 4, period: 'month' }],
  }), NOW);
  close(result.other, 5);
  close(result.netMonthly, 25);
});

test('hardware is spread over the chosen months', () => {
  const result = calculate(scenario({
    services: [{ amount: 50, period: 'month' }],
    hardware: { cost: 360, months: 36, since: '' },
  }), NOW);
  close(result.hardware, 10);
  close(result.netMonthly, 40);
});

test('hardware spread has a floor of one month', () => {
  const result = calculate(scenario({ hardware: { cost: 100, months: 0, since: '' } }), NOW);
  assert.equal(result.spreadMonths, 1);
  close(result.hardware, 100);
});

test('the net can be negative', () => {
  const result = calculate(scenario({
    services: [{ amount: 5, period: 'month' }],
    others: [{ amount: 20, period: 'month' }],
  }), NOW);
  close(result.netMonthly, -15);
  close(result.netYearly, -180);
});

test('an empty state gives zeros and no payback', () => {
  const result = calculate(scenario(), NOW);
  assert.equal(result.netMonthly, 0);
  assert.equal(result.payback.status, 'none');
});

test('payback without hardware cost is not applicable', () => {
  const result = calculate(scenario({ services: [{ amount: 10, period: 'month' }] }), NOW);
  assert.deepEqual(result.payback, { status: 'none', months: null, date: null });
});

test('payback never happens when running costs reach the savings', () => {
  const result = calculate(scenario({
    services: [{ amount: 10, period: 'month' }],
    others: [{ amount: 10, period: 'month' }],
    hardware: { cost: 300, months: 36, since: '2026-01' },
  }), NOW);
  assert.deepEqual(result.payback, { status: 'never', months: null, date: null });
});

test('payback months are rounded up and use savings before hardware', () => {
  const result = calculate(scenario({
    services: [{ amount: 40, period: 'month' }],
    others: [{ amount: 10, period: 'month' }],
    hardware: { cost: 310, months: 36, since: '' },
  }), NOW);
  assert.deepEqual(result.payback, { status: 'pending', months: 11, date: null });
});

test('an exact division does not round up', () => {
  const result = calculate(scenario({
    services: [{ amount: 30, period: 'month' }],
    hardware: { cost: 300, months: 36, since: '' },
  }), NOW);
  assert.equal(result.payback.months, 10);
});

test('payback date counts from the purchase month', () => {
  const result = calculate(scenario({
    services: [{ amount: 50, period: 'month' }],
    hardware: { cost: 600, months: 36, since: '2026-03' },
  }), NOW);
  assert.deepEqual(result.payback, { status: 'pending', months: 12, date: '2027-03' });
});

test('payback date crosses the year boundary', () => {
  const result = calculate(scenario({
    services: [{ amount: 50, period: 'month' }],
    hardware: { cost: 250, months: 36, since: '2026-11' },
  }), NOW);
  assert.equal(result.payback.date, '2027-04');
});

test('payback is reached when the break-even month has passed', () => {
  const result = calculate(scenario({
    services: [{ amount: 50, period: 'month' }],
    hardware: { cost: 300, months: 36, since: '2025-01' },
  }), NOW);
  assert.equal(result.payback.status, 'reached');
  assert.equal(result.payback.date, '2025-07');
});

test('payback is reached in the break-even month itself', () => {
  const result = calculate(scenario({
    services: [{ amount: 50, period: 'month' }],
    hardware: { cost: 300, months: 36, since: '2025-12' },
  }), new Date(2026, 5, 1));
  assert.equal(result.payback.status, 'reached');
});

test('an invalid purchase month is ignored', () => {
  const result = calculate(scenario({
    services: [{ amount: 50, period: 'month' }],
    hardware: { cost: 300, months: 36, since: '2026-13' },
  }), NOW);
  assert.equal(result.payback.date, null);
});

test('month helpers round-trip', () => {
  assert.equal(monthIndex('2026-01'), 2026 * 12);
  assert.equal(monthIndex('2026-00'), null);
  assert.equal(monthIndex(''), null);
  assert.equal(monthFromIndex(monthIndex('2026-12') + 1), '2027-01');
});

test('total saved is the monthly savings since the start minus the hardware', () => {
  const result = calculate(scenario({
    services: [{ amount: 50, period: 'month' }],
    hardware: { cost: 300, months: 36, since: '2026-01' },
  }), NOW);
  assert.equal(result.total.status, 'running');
  assert.equal(result.total.months, 5);
  close(result.total.amount, 5 * 50 - 300);
});

test('total saved is the whole hardware cost in the negative in the first month', () => {
  const result = calculate(scenario({
    services: [{ amount: 50, period: 'month' }],
    hardware: { cost: 300, months: 36, since: '2026-06' },
  }), NOW);
  close(result.total.amount, -300);
});

test('total saved crosses zero in the break-even month', () => {
  const result = calculate(scenario({
    services: [{ amount: 50, period: 'month' }],
    hardware: { cost: 300, months: 36, since: '2025-12' },
  }), NOW);
  assert.equal(result.payback.status, 'reached');
  assert.ok(result.total.amount >= 0);
});

test('total saved needs a start month', () => {
  const result = calculate(scenario({ services: [{ amount: 50, period: 'month' }] }), NOW);
  assert.deepEqual(result.total, { status: 'unknown', months: null, amount: null });
});

test('a start month in the future has no total yet', () => {
  const result = calculate(scenario({ hardware: { cost: 0, months: 36, since: '2027-01' } }), NOW);
  assert.equal(result.total.status, 'future');
});

test('total saved can go down when costs exceed savings', () => {
  const result = calculate(scenario({
    services: [{ amount: 5, period: 'month' }],
    others: [{ amount: 15, period: 'month' }],
    hardware: { cost: 0, months: 36, since: '2026-01' },
  }), NOW);
  close(result.total.amount, -50);
});

test('projections count from the start of the setup', () => {
  const result = calculate(scenario({
    services: [{ amount: 40, period: 'month' }],
    hardware: { cost: 300, months: 36, since: '2026-01' },
  }), NOW);
  close(projection(1, result.timeline), 180);
  close(projection(5, result.timeline), 2100);
});

test('a service added later counts only from the month it was added', () => {
  const result = calculate(scenario({
    services: [
      { amount: 50, period: 'month' },
      { amount: 10, period: 'month', since: '2026-04' },
    ],
    hardware: { cost: 0, months: 36, since: '2026-01' },
  }), NOW);
  // January to May: 5 months of the first, April and May of the second.
  close(result.total.amount, 5 * 50 + 2 * 10);
  close(result.gross, 60);
});

test('a service that ended stops counting and is not in the monthly numbers', () => {
  const result = calculate(scenario({
    services: [
      { amount: 50, period: 'month' },
      { amount: 20, period: 'month', until: '2026-02' },
    ],
    hardware: { cost: 0, months: 36, since: '2026-01' },
  }), NOW);
  // The second one counted in January and February only.
  close(result.total.amount, 5 * 50 + 2 * 20);
  close(result.gross, 50);
});

test('a service starting in the future does not count yet', () => {
  const result = calculate(scenario({
    services: [{ amount: 50, period: 'month' }, { amount: 30, period: 'month', since: '2026-09' }],
    hardware: { cost: 0, months: 36, since: '2026-01' },
  }), NOW);
  close(result.gross, 50);
  close(result.total.amount, 250);
});

test('costs added later are subtracted only from then', () => {
  const result = calculate(scenario({
    services: [{ amount: 50, period: 'month' }],
    others: [{ amount: 120, period: 'year', since: '2026-05' }],
    hardware: { cost: 0, months: 36, since: '2026-01' },
  }), NOW);
  close(result.total.amount, 5 * 50 - 1 * 10);
});

test('a service dated before the start counts from the start', () => {
  const result = calculate(scenario({
    services: [{ amount: 50, period: 'month', since: '2020-01' }],
    hardware: { cost: 0, months: 36, since: '2026-01' },
  }), NOW);
  close(result.total.amount, 250);
});

test('without a start month the earliest dated item is the start', () => {
  const result = calculate(scenario({
    services: [{ amount: 50, period: 'month', since: '2026-03' }, { amount: 10, period: 'month', since: '2026-05' }],
  }), NOW);
  assert.equal(result.total.months, 3);
  close(result.total.amount, 3 * 50 + 1 * 10);
});

test('the break-even follows the services as they were added', () => {
  const result = calculate(scenario({
    services: [{ amount: 10, period: 'month' }, { amount: 90, period: 'month', since: '2026-03' }],
    hardware: { cost: 300, months: 36, since: '2026-01' },
  }), NOW);
  // 10 + 10 + 100 + 100 + 100 = 320 >= 300 after 5 months: June 2026.
  assert.deepEqual(result.payback, { status: 'reached', months: 5, date: '2026-06' });
});

test('the chart covers at least a year and the break-even', () => {
  const result = calculate(scenario({
    services: [{ amount: 10, period: 'month' }],
    hardware: { cost: 1000, months: 36, since: '' },
  }), NOW);
  assert.equal(chartHorizon(result, 0), 120);
  assert.equal(chartHorizon(calculate(scenario(), NOW), 0), 12);
});
