import { calculate, chartHorizon, projection } from './calc.js';
import { drawChart } from './chart.js';
import { CATALOG } from './catalog.js';
import { CURRENCIES, defaultState, normalize, uid } from './state.js';
import { createSaver, loadPrefs, loadState, savePrefs } from './storage.js';
import * as i18n from './i18n.js';

const { t } = i18n;
const $ = (selector) => document.querySelector(selector);

let state = defaultState();
let prefs = {};
let saver;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

function getPath(path) {
  return path.split('.').reduce((obj, key) => obj[key], state);
}

function setPath(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((obj, key) => obj[key], state)[last] = value;
}

function changed() {
  render();
  saver.schedule();
}

function bindInputs() {
  document.querySelectorAll('[data-bind]').forEach((input) => {
    const path = input.dataset.bind;
    input.value = getPath(path) || (input.type === 'number' ? '' : getPath(path));
    input.oninput = () => {
      const value = input.type === 'number' ? Math.max(0, parseFloat(input.value) || 0) : input.value;
      setPath(path, value);
      changed();
    };
  });
}

function periodSelect(item) {
  const select = el('select', { 'aria-label': t('field.period') },
    el('option', { value: 'month' }, t('period.month')),
    el('option', { value: 'year' }, t('period.year')));
  select.value = item.period;
  select.onchange = () => {
    item.period = select.value;
    changed();
  };
  return select;
}

function row(kind, item) {
  const name = el('input', {
    type: 'text', className: 'name', value: item.name, maxLength: 80,
    placeholder: t('field.name'), 'aria-label': t('field.name'),
  });
  name.oninput = () => {
    item.name = name.value;
    saver.schedule();
  };
  const note = el('input', {
    type: 'text', className: 'note', value: item.note || '', maxLength: 200,
    placeholder: t('field.note'), 'aria-label': t('field.note'),
  });
  note.oninput = () => {
    item.note = note.value;
    saver.schedule();
  };
  const price = el('input', {
    type: 'number', min: '0', step: 'any', inputMode: 'decimal',
    value: item.amount || '', placeholder: '0', 'aria-label': t('field.price'),
  });
  price.oninput = () => {
    item.amount = Math.max(0, parseFloat(price.value) || 0);
    changed();
  };
  const remove = el('button', {
    type: 'button', className: 'icon', title: t('action.remove'), 'aria-label': t('action.remove'),
  }, '×');
  remove.onclick = () => {
    state[kind] = state[kind].filter((x) => x.id !== item.id);
    renderLists();
    changed();
  };
  return el('div', { className: 'row' }, el('div', { className: 'title' }, name, note), price, periodSelect(item), remove);
}

function renderLists() {
  for (const kind of ['services', 'others']) {
    const container = $(`#${kind}`);
    container.replaceChildren(...state[kind].map((item) => row(kind, item)));
    if (!state[kind].length) {
      container.append(el('p', { className: 'empty muted' }, t(`${kind}.empty`)));
    }
  }
  renderCatalog();
}

function renderCatalog() {
  const used = new Set(state.services.map((s) => s.ref).filter(Boolean));
  const options = CATALOG
    .filter((entry) => !used.has(entry.id))
    .map((entry) => ({ entry, label: t(`catalog.${entry.id}`) }))
    .sort((a, b) => a.label.localeCompare(b.label, i18n.getLanguage()));
  $('#catalog').replaceChildren(
    el('option', { value: '' }, t('services.catalog')),
    ...options.map(({ entry, label }) => el('option', { value: entry.id }, label)),
  );
}

function renderCurrencies() {
  $('#currency').replaceChildren(...CURRENCIES.map((code) =>
    el('option', { value: code }, `${code} - ${i18n.currencyName(code)}`)));
  $('#currency').value = state.currency;
}

function render() {
  const result = calculate(state);
  const money = (value) => i18n.money(value, state.currency);

  $('#net-month').textContent = money(result.netMonthly);
  $('#net-year').textContent = t('result.perYear', { amount: money(result.netYearly) });
  $('#r-gross').textContent = money(result.gross);
  $('#r-electricity').textContent = money(-result.electricity);
  $('#r-hardware-label').textContent = i18n.plural('result.hardware', result.spreadMonths);
  $('#r-hardware').textContent = money(-result.hardware);
  $('#r-other').textContent = money(-result.other);
  $('#power-note').textContent = t('power.note', {
    kwh: new Intl.NumberFormat(i18n.getLanguage(), { maximumFractionDigits: 1 }).format(result.kwh),
    cost: money(result.electricity),
  });
  $('#payback').textContent = paybackText(result.payback);
  renderTotal(result, money);
  renderOverTime(result, money);
}

function renderTotal({ total }, money) {
  const { status, months, amount } = total;
  $('#total-amount').textContent = status === 'running' ? money(amount) : '-';
  $('#total-note').textContent = status === 'running'
    ? i18n.plural('total.running', months)
    : t(status === 'future' ? 'total.future' : 'total.unknown');
}

function renderOverTime(result, money) {
  const { netBeforeHardware, hardwareCost } = result;
  const card = $('#over-time');
  const empty = netBeforeHardware === 0 && hardwareCost === 0;
  card.hidden = empty;
  if (empty) return;

  const elapsed = result.total.status === 'running' ? result.total.months : null;
  const horizon = chartHorizon(result, elapsed);
  drawChart($('#chart'), {
    netBeforeHardware,
    hardwareCost,
    elapsed,
    horizon,
    breakEven: result.payback.months,
    label: t('chart.label'),
    text: {
      now: t('chart.now'),
      breakEven: t('chart.zero'),
      end: `${horizon} ${t('chart.months')}`,
    },
  });

  $('#projection').replaceChildren(...[1, 3, 5].map((years) => el('div', {},
    el('dt', {}, i18n.plural('projection', years)),
    el('dd', {}, money(projection(years, netBeforeHardware, hardwareCost))))));
}

function paybackText({ status, months, date }) {
  if (status === 'none') return t('payback.none');
  if (status === 'never') return t('payback.never');
  const when = date ? i18n.monthLabel(date) : '';
  if (status === 'reached') return i18n.plural('payback.reached', months, { date: when });
  return i18n.plural(date ? 'payback.pendingDate' : 'payback.pending', months, { date: when });
}

function setSaveStatus(ok) {
  $('#save-status').textContent = ok ? '' : t('footer.saveFailed');
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

function renderLanguages() {
  $('#language').replaceChildren(...Object.entries(i18n.LANGUAGES).map(([code, label]) =>
    el('option', { value: code }, label)));
  $('#language').value = i18n.getLanguage();
}

async function applyLanguage(code) {
  await i18n.setLanguage(code);
  i18n.applyStatic();
  renderLanguages();
  renderCurrencies();
  renderLists();
  render();
}

function addService(entryId) {
  const entry = CATALOG.find((c) => c.id === entryId);
  state.services.push({
    id: uid(),
    ref: entry ? entry.id : '',
    name: entry ? t(`catalog.${entry.id}`) : '',
    note: '',
    amount: entry ? entry.monthly : 0,
    period: 'month',
  });
}

function backupStatus(message) {
  $('#backup-status').textContent = message;
}

function wireBackup() {
  $('#export').onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = el('a', {
      href: URL.createObjectURL(blob),
      download: `homelab-savings-${new Date().toISOString().slice(0, 10)}.json`,
    });
    link.click();
    URL.revokeObjectURL(link.href);
  };
  $('#import').onclick = () => $('#import-file').click();
  $('#import-file').onchange = async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    let raw;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      raw = null;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.v !== 1) {
      backupStatus(t('backup.invalid'));
      return;
    }
    if (!confirm(t('backup.confirm'))) return;
    state = normalize(raw);
    bindInputs();
    renderCurrencies();
    renderLists();
    changed();
    backupStatus(t('backup.restored'));
  };
}

function wireActions() {
  wireBackup();
  $('#catalog').onchange = (event) => {
    if (!event.target.value) return;
    addService(event.target.value);
    renderLists();
    changed();
  };
  $('#add-service').onclick = () => {
    addService('');
    renderLists();
    changed();
    document.querySelectorAll('#services .name')[state.services.length - 1]?.focus();
  };
  $('#add-other').onclick = () => {
    state.others.push({ id: uid(), ref: '', name: '', note: '', amount: 0, period: 'month' });
    renderLists();
    changed();
    document.querySelectorAll('#others .name')[state.others.length - 1]?.focus();
  };
  $('#language').onchange = (event) => {
    prefs.lang = event.target.value;
    savePrefs(prefs);
    applyLanguage(prefs.lang);
  };
  $('#theme').onchange = (event) => {
    prefs.theme = event.target.value;
    savePrefs(prefs);
    applyTheme(prefs.theme);
  };
}

async function start() {
  prefs = loadPrefs();
  applyTheme(prefs.theme);
  $('#theme').value = prefs.theme || 'system';

  const { raw, remote } = await loadState();
  state = normalize(raw);
  saver = createSaver({ remote, getState: () => state, onStatus: setSaveStatus });

  await i18n.setLanguage(i18n.detectLanguage(prefs.lang));
  wireActions();
  bindInputs();
  await applyLanguage(i18n.getLanguage());
}

start();
