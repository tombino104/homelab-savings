import {
  calculate, chartHorizon, currentMonth, isActive, isEnded, monthIndex, priceAt, priceEntry, projection, toMonthly,
} from './calc.js';
import { drawChart } from './chart.js';
import { CATALOG } from './catalog.js';
import { CURRENCIES, defaultState, normalize, uid } from './state.js';
import { createSaver, loadPrefs, loadState, savePrefs } from './storage.js';
import * as i18n from './i18n.js';

const { t } = i18n;
const $ = (selector) => document.querySelector(selector);
const TABS = ['summary', 'services', 'costs', 'settings'];
const SEARCH_FROM = 8;

let state = defaultState();
let prefs = {};
let saver;
let filter = '';
const open = new Set();

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

const money = (value) => i18n.money(value, state.currency);
const nowIndex = () => monthIndex(currentMonth());

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

/* Tabs */

function showTab(name) {
  const tab = TABS.includes(name) ? name : 'summary';
  document.querySelectorAll('[data-tab]').forEach((button) => {
    const selected = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll('[data-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tab;
  });
  if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
  prefs.tab = tab;
  savePrefs(prefs);
}

function wireTabs() {
  const buttons = [...document.querySelectorAll('[data-tab]')];
  buttons.forEach((button, index) => {
    button.onclick = () => showTab(button.dataset.tab);
    button.onkeydown = (event) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
      if (!step) return;
      const next = buttons[(index + step + buttons.length) % buttons.length];
      showTab(next.dataset.tab);
      next.focus();
    };
  });
  addEventListener('hashchange', () => showTab(location.hash.slice(1)));
}

/* Rows */

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

function badges(item) {
  const parts = [];
  if (item.note) parts.push(item.note);
  if (item.since) parts.push(t('badge.since', { date: i18n.monthLabel(item.since) }));
  if (item.until) parts.push(t('badge.until', { date: i18n.monthLabel(item.until) }));
  const latest = (item.changes || []).map((c) => c.month).sort().pop();
  if (latest) parts.push(t('badge.price', { date: i18n.monthLabel(latest) }));
  return parts.join(' · ');
}

// Editing a month only updates the row in place: moving it between the lists
// waits until its details are closed, so the field keeps the focus.
function monthField(item, key, label, hint, node) {
  const input = el('input', { type: 'month', value: item[key] || '' });
  input.oninput = () => {
    item[key] = /^\d{4}-\d{2}$/.test(input.value) ? input.value : '';
    node.querySelector('.meta').textContent = badges(item);
    node.classList.toggle('ended', isEnded(item, nowIndex()));
    changed();
  };
  return el('label', {}, el('span', {}, label), input, el('small', { className: 'muted' }, hint));
}

// Several inputs can show the same price: the row shows today's price, the
// details show each price over time. Editing one refreshes the others.
function priceGroup() {
  const inputs = [];
  const sync = () => {
    for (const { input, get } of inputs) {
      if (document.activeElement !== input) input.value = get() || '';
    }
  };
  const bind = (input, get, set) => {
    input.value = get() || '';
    input.oninput = () => {
      set(Math.max(0, parseFloat(input.value) || 0));
      sync();
      changed();
    };
    inputs.push({ input, get });
    return input;
  };
  const input = (get, set, label) => bind(el('input', {
    type: 'number', min: '0', step: 'any', inputMode: 'decimal', placeholder: '0', 'aria-label': label,
  }), get, set);
  return { bind, input, sync };
}

// Today's price of `owner` (a service, a cost or the electricity), wherever it
// is kept: the starting price or the latest change.
function nowPrice(owner, key = 'amount') {
  return {
    get: () => {
      const { target, key: field } = priceEntry(owner, nowIndex(), key);
      return target[field];
    },
    set: (value) => {
      const { target, key: field } = priceEntry(owner, nowIndex(), key);
      target[field] = value;
    },
  };
}

function priceChanges(owner, key, group, onListChange, onMonthChange) {
  owner.changes ||= [];
  owner.changes.sort((a, b) => a.month.localeCompare(b.month));
  const rows = [el('div', { className: 'change' },
    el('span', { className: 'muted' }, t('price.start')),
    group.input(() => owner[key], (value) => { owner[key] = value; }, t('price.start')),
    el('span'))];
  for (const change of owner.changes) {
    const month = el('input', { type: 'month', value: change.month, 'aria-label': t('price.from') });
    month.oninput = () => {
      if (!/^\d{4}-\d{2}$/.test(month.value)) return;
      change.month = month.value;
      group.sync();
      onMonthChange?.();
      changed();
    };
    const remove = el('button', {
      type: 'button', className: 'icon', title: t('price.remove'), 'aria-label': t('price.remove'),
    }, '×');
    remove.onclick = () => {
      owner.changes = owner.changes.filter((c) => c !== change);
      onListChange();
      changed();
    };
    rows.push(el('div', { className: 'change' },
      month,
      group.input(() => change.amount, (value) => { change.amount = value; }, t('field.price')),
      remove));
  }
  const add = el('button', { type: 'button' }, t('price.add'));
  add.onclick = () => {
    const month = currentMonth();
    if (!owner.changes.some((c) => c.month === month)) {
      owner.changes.push({ month, amount: priceAt(owner, nowIndex(), key) });
    }
    onListChange();
    changed();
  };
  return el('div', { className: 'changes' }, ...rows, el('div', { className: 'actions' }, add));
}

function hasHistory(item) {
  const since = monthIndex(item.since);
  return since === null || since < nowIndex();
}

function row(kind, item) {
  const expanded = open.has(item.id);
  const name = el('input', {
    type: 'text', className: 'name', value: item.name, maxLength: 80,
    placeholder: t('field.name'), 'aria-label': t('field.name'),
  });
  name.oninput = () => {
    item.name = name.value;
    saver.schedule();
  };
  const group = priceGroup();
  const today = nowPrice(item);
  const price = group.input(today.get, today.set, t('field.price'));
  const toggle = el('button', {
    type: 'button', className: 'icon toggle', title: t('action.details'),
    'aria-label': t('action.details'), 'aria-expanded': String(expanded),
  }, '▾');
  toggle.onclick = () => {
    if (open.has(item.id)) open.delete(item.id);
    else open.add(item.id);
    renderLists();
  };

  const node = el('div', { className: `row${expanded ? ' open' : ''}${isEnded(item, nowIndex()) ? ' ended' : ''}` },
    el('div', { className: 'title' }, name, el('span', { className: 'meta muted' }, badges(item))),
    price, periodSelect(item), toggle);

  if (expanded) {
    const note = el('input', {
      type: 'text', value: item.note || '', maxLength: 200, placeholder: t('field.note'),
    });
    note.oninput = () => {
      item.note = note.value;
      node.querySelector('.meta').textContent = badges(item);
      saver.schedule();
    };
    const remove = el('button', { type: 'button', className: 'danger' }, t('action.remove'));
    remove.onclick = () => {
      if (hasHistory(item) && !confirm(t('action.removeConfirm'))) return;
      state[kind] = state[kind].filter((x) => x.id !== item.id);
      open.delete(item.id);
      renderLists();
      changed();
    };
    node.append(el('div', { className: 'details' },
      el('label', { className: 'wide' }, el('span', {}, t('field.note')), note),
      monthField(item, 'since', t('field.since'), t('field.sinceHint'), node),
      monthField(item, 'until', t('field.until'), t('field.untilHint'), node),
      el('div', { className: 'wide price-history' },
        el('span', { className: 'label' }, t('price.title')),
        el('small', { className: 'muted' }, t('price.hint')),
        priceChanges(item, 'amount', group, renderLists, () => {
          node.querySelector('.meta').textContent = badges(item);
        })),
      el('div', { className: 'wide end' }, remove)));
  }
  return node;
}

function renderList(kind) {
  const month = nowIndex();
  const container = $(`#${kind}`);
  const query = kind === 'services' ? filter.trim().toLocaleLowerCase() : '';
  const matches = state[kind].filter((item) => !query
    || `${item.name} ${item.note}`.toLocaleLowerCase().includes(query));
  const current = matches.filter((item) => !isEnded(item, month));
  const ended = matches.filter((item) => isEnded(item, month));

  const children = [];
  if (current.length) children.push(el('div', { className: 'rows' }, ...current.map((item) => row(kind, item))));
  if (ended.length) {
    const group = el('details', { className: 'ended-group' },
      el('summary', {}, t('list.ended', { n: ended.length })),
      el('div', { className: 'rows' }, ...ended.map((item) => row(kind, item))));
    group.open = ended.some((item) => open.has(item.id)) || Boolean(query);
    children.push(group);
  }
  if (!state[kind].length) children.push(el('p', { className: 'empty muted' }, t(`${kind}.empty`)));
  else if (!matches.length) children.push(el('p', { className: 'empty muted' }, t('services.noMatch')));
  container.replaceChildren(...children);
  renderListSummary(kind);
}

function renderListSummary(kind) {
  const month = nowIndex();
  const active = state[kind].filter((item) => isActive(item, month));
  const monthly = active.reduce((sum, item) => sum + toMonthly(item.amount, item.period), 0);
  $(`#${kind}-summary`).textContent = state[kind].length
    ? i18n.plural('list.summary', active.length, { amount: money(monthly) })
    : '';
  if (kind === 'services') {
    $('#services-count').textContent = active.length ? String(active.length) : '';
    $('#services-search').hidden = state.services.length < SEARCH_FROM;
  }
}

function renderLists() {
  renderList('services');
  renderList('others');
  renderPurchases();
  renderCatalog();
}

/* Hardware purchases */

function purchaseRow(purchase) {
  const name = el('input', {
    type: 'text', className: 'name', value: purchase.name, maxLength: 80,
    placeholder: t('purchase.name'), 'aria-label': t('purchase.name'),
  });
  name.oninput = () => {
    purchase.name = name.value;
    saver.schedule();
  };
  const cost = el('input', {
    type: 'number', min: '0', step: 'any', inputMode: 'decimal',
    value: purchase.cost || '', placeholder: '0', 'aria-label': t('purchase.cost'),
  });
  cost.oninput = () => {
    purchase.cost = Math.max(0, parseFloat(cost.value) || 0);
    changed();
  };
  const month = el('input', { type: 'month', value: purchase.month || '', 'aria-label': t('purchase.month') });
  month.oninput = () => {
    purchase.month = /^\d{4}-\d{2}$/.test(month.value) ? month.value : '';
    changed();
  };
  const remove = el('button', {
    type: 'button', className: 'icon', title: t('action.remove'), 'aria-label': t('action.remove'),
  }, '×');
  remove.onclick = () => {
    state.hardware.purchases = state.hardware.purchases.filter((p) => p !== purchase);
    renderPurchases();
    changed();
  };
  return el('div', { className: 'row purchase' }, el('div', { className: 'title' }, name), cost, month, remove);
}

function renderPurchases() {
  const { purchases } = state.hardware;
  $('#purchases').replaceChildren(purchases.length
    ? el('div', { className: 'rows' }, ...purchases.map(purchaseRow))
    : el('p', { className: 'empty muted' }, t('hardware.empty')));
  renderPurchaseSummary();
}

function renderPurchaseSummary() {
  const { purchases } = state.hardware;
  const total = purchases.reduce((sum, p) => sum + (p.cost || 0), 0);
  $('#hardware-summary').textContent = purchases.length
    ? i18n.plural('hardware.summary', purchases.length, { amount: money(total) })
    : '';
}

/* Electricity price */

function renderPower() {
  const group = priceGroup();
  const today = nowPrice(state.power, 'pricePerKwh');
  group.bind($('#kwh-price'), today.get, today.set);
  const refresh = () => {
    renderPower();
    $('#power-changes-group').open = true;
  };
  $('#power-changes').replaceChildren(priceChanges(state.power, 'pricePerKwh', group, refresh));
  $('#power-changes-label').textContent = t('power.changes', { n: state.power.changes.length });
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

/* Results */

function render() {
  const result = calculate(state);

  $('#net-month').textContent = money(result.netMonthly);
  $('#sum-net').textContent = money(result.netMonthly);
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
  renderTotal(result);
  renderOverTime(result);
  renderListSummary('services');
  renderListSummary('others');
  renderPurchaseSummary();
  renderRanking(result.contributions);
}

function renderRanking({ perMonth, list }) {
  const card = $('#ranking');
  card.hidden = !list.length;
  if (!list.length) return;
  $('#ranking-hint').textContent = t(perMonth ? 'ranking.hintMonth' : 'ranking.hint');
  const top = list.slice(0, 6);
  const max = top[0].amount;
  const label = (amount) => (perMonth ? t('ranking.perMonth', { amount: money(amount) }) : money(amount));
  $('#ranking-list').replaceChildren(...top.map((entry) => {
    const fill = el('span', { className: 'fill' });
    fill.style.width = `${Math.max(2, (entry.amount / max) * 100)}%`;
    return el('li', {},
      el('span', { className: 'r-name' }, entry.name || t('ranking.unnamed')),
      el('span', { className: 'r-amount' }, label(entry.amount)),
      el('span', { className: 'bar' }, fill));
  }));
  const rest = list.slice(top.length);
  $('#ranking-more').textContent = rest.length
    ? i18n.plural('ranking.more', rest.length, { amount: label(rest.reduce((sum, e) => sum + e.amount, 0)) })
    : '';
}

function renderTotal({ total }) {
  const { status, months, amount } = total;
  const value = status === 'running' ? money(amount) : '-';
  $('#total-amount').textContent = value;
  $('#sum-total').textContent = value;
  $('#total-note').textContent = status === 'running'
    ? i18n.plural('total.running', months)
    : t(status === 'future' ? 'total.future' : 'total.unknown');
}

function renderOverTime(result) {
  const { netBeforeHardware, hardwareCost, timeline } = result;
  const card = $('#over-time');
  const empty = netBeforeHardware === 0 && hardwareCost === 0 && !state.services.length;
  card.hidden = empty;
  if (empty) return;

  const elapsed = result.total.status === 'running' ? result.total.months : null;
  const horizon = chartHorizon(result, elapsed);
  drawChart($('#chart'), {
    at: timeline.at,
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
    el('dd', {}, money(projection(years, timeline))))));
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

/* Preferences */

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
  renderPower();
  render();
}

/* Backup */

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
    open.clear();
    bindInputs();
    renderCurrencies();
    renderLists();
    renderPower();
    changed();
    backupStatus(t('backup.restored'));
  };
}

/* Actions */

function newItem(entry) {
  return {
    id: uid(),
    ref: entry ? entry.id : '',
    name: entry ? t(`catalog.${entry.id}`) : '',
    note: '',
    amount: entry ? entry.monthly : 0,
    period: 'month',
    since: currentMonth(),
    until: '',
    changes: [],
  };
}

function focusLast(kind) {
  const rows = document.querySelectorAll(`#${kind} .rows:first-child .name`);
  rows[rows.length - 1]?.focus();
}

function wireActions() {
  wireTabs();
  wireBackup();
  $('#catalog').onchange = (event) => {
    if (!event.target.value) return;
    state.services.push(newItem(CATALOG.find((c) => c.id === event.target.value)));
    filter = '';
    $('#services-search').value = '';
    renderLists();
    changed();
  };
  $('#add-service').onclick = () => {
    state.services.push(newItem(null));
    filter = '';
    $('#services-search').value = '';
    renderLists();
    changed();
    focusLast('services');
  };
  $('#add-other').onclick = () => {
    state.others.push(newItem(null));
    renderLists();
    changed();
    focusLast('others');
  };
  $('#add-purchase').onclick = () => {
    state.hardware.purchases.push({ id: uid(), name: '', note: '', cost: 0, month: currentMonth() });
    renderPurchases();
    changed();
    [...document.querySelectorAll('#purchases .name')].pop()?.focus();
  };
  $('#services-search').oninput = (event) => {
    filter = event.target.value;
    renderList('services');
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
  showTab(location.hash.slice(1) || prefs.tab);
}

start();
