import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CATALOG } from '../web/js/catalog.js';

const load = (code) => JSON.parse(readFileSync(new URL(`../web/locales/${code}.json`, import.meta.url), 'utf8'));
const en = load('en');
const languages = readdirSync(new URL('../web/locales/', import.meta.url)).map((f) => f.replace('.json', ''));
const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test('every language has exactly the keys of English', () => {
  for (const code of languages) {
    assert.deepEqual(Object.keys(load(code)).sort(), Object.keys(en).sort(), code);
  }
});

test('every translation keeps the placeholders of the English text', () => {
  for (const code of languages) {
    const dict = load(code);
    for (const key of Object.keys(en)) {
      assert.deepEqual(placeholders(dict[key]), placeholders(en[key]), `${code}: ${key}`);
    }
  }
});

test('no translation is empty', () => {
  for (const code of languages) {
    for (const [key, value] of Object.entries(load(code))) {
      assert.ok(value.trim(), `${code}: ${key}`);
    }
  }
});

test('plural keys come in one/other pairs', () => {
  const bases = new Set(Object.keys(en).filter((k) => /\.(one|other)$/.test(k)).map((k) => k.replace(/\.(one|other)$/, '')));
  for (const base of bases) {
    assert.ok(en[`${base}.one`] && en[`${base}.other`], base);
  }
});

test('every catalog entry has a name in every language and a sane price', () => {
  const ids = new Set();
  for (const entry of CATALOG) {
    assert.ok(!ids.has(entry.id), `duplicate ${entry.id}`);
    ids.add(entry.id);
    assert.ok(entry.monthly > 0 && entry.monthly <= 50, entry.id);
    for (const code of languages) {
      assert.ok(load(code)[`catalog.${entry.id}`], `${code}: ${entry.id}`);
    }
  }
});

test('every static label used in the page exists', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  for (const [, key] of html.matchAll(/data-i18n(?:-aria|-placeholder)?="([^"]+)"/g)) {
    assert.ok(en[key], key);
  }
});
