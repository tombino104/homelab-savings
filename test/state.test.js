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
    services: [{ id: 'a', ref: 'nextcloud', name: 'Files', note: 'Family photos and documents', amount: 10, period: 'year' }],
    others: [{ id: 'b', ref: '', name: 'Domain', note: '', amount: 12, period: 'year' }],
    power: { watts: 15, hoursPerDay: 12, pricePerKwh: 0.3 },
    hardware: { cost: 250, months: 24, since: '2026-02' },
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
    hardware: { cost: -5, months: 'x', since: 'soon' },
  });
  assert.equal(state.services[0].amount, 0);
  assert.equal(state.services[1].amount, 0);
  assert.equal(state.services[1].period, 'month');
  assert.equal(state.power.watts, defaultState().power.watts);
  assert.equal(state.power.hoursPerDay, 24);
  assert.equal(state.power.pricePerKwh, defaultState().power.pricePerKwh);
  assert.equal(state.hardware.cost, 0);
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
