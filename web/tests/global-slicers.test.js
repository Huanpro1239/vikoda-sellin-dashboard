'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const { VikodaDataEngine } = require('../js/data-engine.js');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const appSource = read('web/js/app.js');
const executiveSource = read('web/js/executive-ui.js');
const html = read('web/index.html');
const themeCss = read('web/css/vikoda-powerbi-theme.css');
const mobileCss = read('web/css/mobile-v6.css');

function createSelect(id) {
  const listeners = new Map();
  return {
    id,
    value: '',
    children: [],
    dataset: {},
    replaceChildren() {
      this.children = [];
      this.value = '';
    },
    appendChild(child) {
      this.children.push(child);
    },
    addEventListener(type, callback) {
      const callbacks = listeners.get(type) || [];
      callbacks.push(callback);
      listeners.set(type, callbacks);
    },
    dispatchChange(value) {
      this.value = value;
      for (const callback of listeners.get('change') || []) callback({ target: this });
    },
  };
}

function createButton(attributes = {}) {
  const listeners = new Map();
  return {
    attributes: { ...attributes },
    disabled: false,
    textContent: '',
    classList: {
      toggle() {},
    },
    addEventListener(type, callback) {
      const callbacks = listeners.get(type) || [];
      callbacks.push(callback);
      listeners.set(type, callbacks);
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    click() {
      for (const callback of listeners.get('click') || []) callback({ target: this });
    },
  };
}

function createPillsHost() {
  let markup = '';
  let buttons = [];
  const feedbackBar = {
    classes: new Set(),
    classList: {
      toggle(name, force) {
        if (force) feedbackBar.classes.add(name);
        else feedbackBar.classes.delete(name);
      },
      contains(name) {
        return feedbackBar.classes.has(name);
      },
    },
  };
  return {
    get innerHTML() {
      return markup;
    },
    set innerHTML(value) {
      markup = String(value);
      buttons = [...markup.matchAll(/data-key="([^"]+)"/g)]
        .map((match) => createButton({ 'data-key': match[1] }));
    },
    querySelectorAll(selector) {
      return selector === '.remove-pill' ? buttons : [];
    },
    closest(selector) {
      return selector === '.filter-feedback-bar' ? feedbackBar : null;
    },
    feedbackBar,
    buttonFor(key) {
      return buttons.find((button) => button.getAttribute('data-key') === key);
    },
  };
}

function createTextNode() {
  let value = '';
  return {
    writes: 0,
    className: '',
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    offsetWidth: 0,
    get innerText() {
      return value;
    },
    set innerText(next) {
      value = String(next);
      this.writes += 1;
    },
    get textContent() {
      return value;
    },
    set textContent(next) {
      value = String(next);
      this.writes += 1;
    },
  };
}

function makeEngine() {
  const engine = new VikodaDataEngine();
  engine.raw = {};
  engine.metadata = { as_of_date: '2026-08-31' };
  engine.customers = {
    C_HN: { channel: 'GT', mien: 'Miền Bắc', vung: 'Hà Nội' },
    C_TB: { channel: 'KA', mien: 'Miền Bắc', vung: 'Tây Bắc' },
    C_HCM: { channel: 'MT', mien: 'Miền Nam', vung: 'TP.HCM' },
  };
  engine.territories = {
    T_DNB: { mien: 'Miền Nam', vung: 'Đông Nam Bộ' },
    T_TN: { mien: 'Miền Trung', vung: 'Tây Nguyên' },
  };
  engine.products = {
    P_VK: { group: 'Khoáng kiềm Vikoda' },
    P_DT: { group: 'Khoáng ngọt Đảnh Thạnh' },
  };
  return engine;
}

function createHarness(engine = makeEngine()) {
  const elements = {
    select_channel: createSelect('select_channel'),
    select_mien: createSelect('select_mien'),
    select_vung: createSelect('select_vung'),
    select_group: createSelect('select_group'),
    filter_pills_container: createPillsHost(),
    btn_clear_filters: createButton(),
    kpi_actual: createTextNode(),
    kpi_ly: createTextNode(),
    kpi_target: createTextNode(),
    kpi_attainment: createTextNode(),
    kpi_yoy: createTextNode(),
  };
  const context = {
    console,
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById(id) {
        return elements[id] || null;
      },
      createElement() {
        return { value: '', textContent: '' };
      },
      querySelectorAll() {
        return [];
      },
      querySelector() {
        return null;
      },
    },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    window: {
      dataEngine: engine,
      setTimeout,
      clearTimeout,
    },
    setTimeout,
    clearTimeout,
  };
  vm.createContext(context);
  vm.runInContext(appSource, context);
  return { app: context.window.app, context, elements, engine };
}

function optionValues(select) {
  return select.children.map((option) => option.value);
}

test('overview exposes one collapsible global business-filter panel on every page', () => {
  for (const id of ['select_channel', 'select_mien', 'select_vung', 'select_group']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="business_filter_panel"/);
  assert.match(html, /id="btn_toggle_business_filters"[^>]*aria-expanded="true"/);
  assert.doesNotMatch(
    themeCss,
    /body\[data-dashboard-page="page_01"\][\s\S]{0,600}display:\s*none\s*!important/,
  );
});

test('region options cascade from miền and restore the full list when miền is cleared', () => {
  const { app, elements, engine } = createHarness();
  app.initSidebarDropdowns();
  engine.subscribe(() => app.syncBusinessFilterControls());

  elements.select_mien.dispatchChange('Miền Bắc');
  assert.equal(engine.filters.mien, 'Miền Bắc');
  assert.deepEqual(optionValues(elements.select_vung), ['', 'Hà Nội', 'Tây Bắc']);

  elements.select_mien.dispatchChange('');
  assert.equal(engine.filters.mien, null);
  assert.deepEqual(
    optionValues(elements.select_vung),
    ['', 'Đông Nam Bộ', 'Hà Nội', 'Tây Bắc', 'Tây Nguyên', 'TP.HCM'],
  );
});

test('dropdowns, removable pills, and chart-style state changes stay synchronized', () => {
  const { app, elements, engine } = createHarness();
  app.initSidebarDropdowns();
  engine.subscribe(() => {
    app.syncBusinessFilterControls();
    app.updateFilterPillsUI();
  });
  app.updateFilterPillsUI();

  elements.select_channel.dispatchChange('GT');
  assert.equal(engine.filters.channel, 'GT');
  assert.equal(elements.select_channel.value, 'GT');
  assert.match(elements.filter_pills_container.innerHTML, /Kênh: GT/);

  elements.filter_pills_container.buttonFor('channel').click();
  assert.equal(engine.filters.channel, null);
  assert.equal(elements.select_channel.value, '');
  assert.doesNotMatch(elements.filter_pills_container.innerHTML, /Kênh: GT/);

  engine.setFilter('channel', 'MT');
  assert.equal(elements.select_channel.value, 'MT');
  assert.match(elements.filter_pills_container.innerHTML, /Kênh: MT/);

  engine.setFilter('vung', 'Hà Nội');
  assert.equal(elements.select_vung.value, 'Hà Nội');
  assert.match(elements.filter_pills_container.innerHTML, /Vùng: Hà Nội/);

  elements.filter_pills_container.buttonFor('vung').click();
  assert.equal(engine.filters.vung, null);
  assert.equal(elements.select_vung.value, '');
});

test('executive KPIs use one formatter contract and one DOM writer', () => {
  const { formatMillion, formatPercent } = require('../js/formatters.js');
  const engine = makeEngine();
  engine.getSummaryKPIs = () => ({
    actualMillion: 1234.56,
    lyMillion: 1111.44,
    targetMillion: 2000.55,
    attainment: 61.712,
    yoy: 11.11,
  });
  const { app, context, elements } = createHarness(engine);
  context.window.VikodaFormatters = { formatMillion, formatPercent };

  app.updateKPIs();

  assert.equal(elements.kpi_actual.textContent, '1,234.6 tr');
  assert.equal(elements.kpi_ly.textContent, '1,111.4 tr');
  assert.equal(elements.kpi_target.textContent, '2,000.6 tr');
  assert.equal(elements.kpi_attainment.textContent, '61.7%');
  assert.equal(elements.kpi_yoy.textContent, '+11.1%');
  assert.doesNotMatch(executiveSource, /kpi_(?:actual|ly|target|attainment|yoy)/);
});

test('active filter feedback and clear action stay visible on mobile', () => {
  assert.match(html, /class="filter-feedback-bar"/);
  assert.match(html, /id="filter_pills_container"[^>]*aria-label="Bộ lọc đang áp dụng"/);
  assert.match(html, /id="btn_clear_filters"/);
  assert.doesNotMatch(
    mobileCss,
    /\.reference-dashboard-v3 \.filter-pills-bar,[\s\S]{0,180}display:\s*none\s*!important/,
  );
  assert.match(html, /<nav class="nav-menu" aria-label="Trang báo cáo">/);
  assert.match(html, /<nav class="mobile-bottom-nav" aria-label="Trang báo cáo trên di động">/);
});

test('empty filter feedback disables clear and active filters restore it', () => {
  const { app, elements, engine } = createHarness();
  engine.subscribe(() => app.updateFilterPillsUI());

  app.updateFilterPillsUI();
  assert.equal(elements.btn_clear_filters.disabled, true);
  assert.equal(elements.filter_pills_container.feedbackBar.classList.contains('is-empty'), true);
  assert.match(elements.filter_pills_container.innerHTML, /Đang xem toàn bộ dữ liệu/);

  engine.setFilter('channel', 'GT');
  assert.equal(elements.btn_clear_filters.disabled, false);
  assert.equal(elements.filter_pills_container.feedbackBar.classList.contains('is-empty'), false);
});
