export const LANGUAGES = { en: 'English', it: 'Italiano' };

let lang = 'en';
let fallback = {};
let dict = {};

async function fetchLocale(code) {
  const response = await fetch(`locales/${code}.json`);
  if (!response.ok) throw new Error(`locale ${code}`);
  return response.json();
}

export function detectLanguage(stored) {
  if (LANGUAGES[stored]) return stored;
  const preferred = (navigator.languages || [navigator.language || 'en']).map((l) => l.slice(0, 2));
  return preferred.find((code) => LANGUAGES[code]) || 'en';
}

export async function setLanguage(code) {
  lang = LANGUAGES[code] ? code : 'en';
  fallback = fallback.title ? fallback : await fetchLocale('en');
  dict = lang === 'en' ? fallback : await fetchLocale(lang);
  document.documentElement.lang = lang;
  document.title = t('title');
}

export function getLanguage() {
  return lang;
}

export function t(key, vars) {
  const template = dict[key] ?? fallback[key] ?? key;
  return vars ? template.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '') : template;
}

export function plural(key, n, vars) {
  const form = new Intl.PluralRules(lang).select(n) === 'one' ? 'one' : 'other';
  return t(`${key}.${form}`, { n, ...vars });
}

export function money(value, currency) {
  const v = Math.abs(value) < 0.005 ? 0 : value;
  return new Intl.NumberFormat(lang, { style: 'currency', currency }).format(v);
}

export function monthLabel(value) {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

export function currencyName(code) {
  try {
    return new Intl.DisplayNames(lang, { type: 'currency' }).of(code) || code;
  } catch {
    return code;
  }
}

export function applyStatic(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nAria));
  });
}
