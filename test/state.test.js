import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CURRENCIES, defaultState, normalize } from '../web/js/state.js';

test('anything that is not an object gives the default state', () => {
  for (const raw of [null, undefined, 5, 'x', []]) {
    const state = normalize(raw);
    assert.equal(state.currency, 'EUR');
    assert.deepEqual(state.services, []);
  }
});

test('a saved state survives normalisation unchanged', () => {
  const saved = {
    v: 1,
    currency: 'USD',
    services: [{ id: 'a', ref: 'nextcloud', name: 'Files', note: 'Family photos and documents', amount: 10, period: 'year', since: '2026-03', until: '', changes: [{ month: '2026-09', amount: 12 }] }],
    others: [{ id: 'b', ref: '', name: 'Domain', note: '', amount: 12, period: 'year', since: '', until: '2027-01', changes: [] }],
    power: { watts: 15, hoursPerDay: 12, pricePerKwh: 0.3, changes: [{ month: '2026-07', amount: 0.28 }] },
    hardware: { months: 24, since: '2026-02', purchases: [{ id: 'p', name: 'Mini PC', note: '', cost: 250, month: '2026-02' }] },
  };
  assert.deepEqual(normalize(saved), saved);
});

test('unknown currencies fall back to EUR', () => {
  assert.equal(normalize({ currency: 'XXX' }).currency, 'EUR');
  assert.ok(CURRENCIES.includes(defaultState().currency));
});

test('negative and non-numeric amounts are replaced', () => {
  const state = normalize({
    services: [{ name: 'x', amount: -4, period: 'month' }, { name: 'y', amount: 'abc', period: 'week' }],
    power: { watts: -1, hoursPerDay: 99, pricePerKwh: 'nope' },
    hardware: { months: 'x', since: 'soon', purchases: [{ cost: -5, month: 'soon' }] },
  });
  assert.equal(state.services[0].amount, 0);
  assert.equal(state.services[1].amount, 0);
  assert.equal(state.services[1].period, 'month');
  assert.equal(state.power.watts, defaultState().power.watts);
  assert.equal(state.power.hoursPerDay, 24);
  assert.equal(state.power.pricePerKwh, defaultState().power.pricePerKwh);
  assert.equal(state.hardware.purchases[0].cost, 0);
  assert.equal(state.hardware.purchases[0].month, '');
  assert.equal(state.hardware.months, defaultState().hardware.months);
  assert.equal(state.hardware.since, '');
});

test('lists are capped and names are trimmed to a safe length', () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ name: 'n'.repeat(500), amount: i, period: 'month' }));
  const state = normalize({ services: many });
  assert.equal(state.services.length, 100);
  assert.equal(state.services[0].name.length, 80);
  assert.ok(state.services.every((s) => s.id));
});

test('non-object list entries are dropped', () => {
  const state = normalize({ services: [null, 3, 'x', { name: 'ok', amount: 1 }] });
  assert.equal(state.services.length, 1);
});

test('notes are optional and capped', () => {
  const state = normalize({ services: [{ name: 'a', amount: 1 }, { name: 'b', note: 'x'.repeat(500), amount: 1 }, { name: 'c', note: 7, amount: 1 }] });
  assert.equal(state.services[0].note, '');
  assert.equal(state.services[1].note.length, 200);
  assert.equal(state.services[2].note, '');
});

test('items keep valid start and end months and drop invalid ones', async () => {
  const { normalize } = await import('../web/js/state.js');
  const state = normalize({ services: [{ name: 'a', since: '2026-03', until: '2026-13' }] });
  assert.equal(state.services[0].since, '2026-03');
  assert.equal(state.services[0].until, '');
});

test('a single hardware cost from before 0.5.0 becomes one purchase in the start month', () => {
  const state = normalize({ hardware: { cost: 300, months: 36, since: '2026-01' } });
  assert.equal(state.hardware.purchases.length, 1);
  assert.equal(state.hardware.purchases[0].cost, 300);
  assert.equal(state.hardware.purchases[0].month, '2026-01');
  assert.equal('cost' in state.hardware, false);
  assert.deepEqual(normalize({ hardware: { cost: 0 } }).hardware.purchases, []);
});

test('price changes without a valid month are dropped', () => {
  const state = normalize({ services: [{ name: 'a', changes: [{ month: 'x', amount: 3 }, { month: '2026-05', amount: -1 }, 'no'] }] });
  assert.deepEqual(state.services[0].changes, [{ month: '2026-05', amount: 0 }]);
});
