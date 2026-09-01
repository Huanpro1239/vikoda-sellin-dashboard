'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  PageScopedFilterController,
  PAGE_LABELS,
} = require('../js/page-scoped-filters-v7.js');

function makeEngine() {
  const listeners = [];
  return {
    raw: {},
    filters: {
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      periodMode: 'mtd',
      channel: null,
      mien: null,
      vung: null,
      productGroup: null,
      productKey: null,
      search: '',
    },
    subscribe(callback) { listeners.push(callback); },
    notify() { listeners.forEach((callback) => callback(this.filters)); },
  };
}

function makeDocument() {
  const elements = {};
  const selectors = {};
  const makeClassList = () => ({ toggle() {} });

  elements.filter_start_date = { value: '' };
  elements.filter_end_date = { value: '' };
  elements.select_month = { value: '' };

  selectors['.business-filter-header > span'] = { textContent: '' };
  selectors['.filter-feedback-label'] = { textContent: '' };

  return {
    body: { dataset: {} },
    getElementById(id) { return elements[id] || null; },
    querySelector(selector) { return selectors[selector] || null; },
    querySelectorAll(selector) {
      if (selector === '.quick-btn[data-quick]') {
        return ['mtd', 'qtd', 'ytd', 'all'].map((mode) => ({
          classList: makeClassList(),
          getAttribute(name) { return name === 'data-quick' ? mode : null; },
          setAttribute() {},
        }));
      }
      return [];
    },
    createElement() { return null; },
  };
}

function makeApp() {
  return {
    activePage: 'page_01',
    switches: [],
    syncBusinessFilterControls() {},
    updateFilterPillsUI() {},
    switchPage(pageId) {
      this.activePage = pageId;
      this.switches.push(pageId);
    },
  };
}

function install() {
  const engine = makeEngine();
  const app = makeApp();
  const doc = makeDocument();
  const controller = new PageScopedFilterController(engine, app, doc);
  controller.install();
  return { engine, app, doc, controller };
}

test('business slicers are isolated per report page and restored on return', () => {
  const { engine, app } = install();

  engine.filters.channel = 'GT';
  engine.filters.mien = 'Miền Bắc';
  engine.filters.vung = 'Hà Nội';
  engine.notify();

  app.switchPage('page_04');
  assert.equal(engine.filters.channel, null);
  assert.equal(engine.filters.mien, null);
  assert.equal(engine.filters.vung, null);

  engine.filters.channel = 'MT';
  engine.filters.mien = 'Miền Nam';
  engine.filters.vung = 'TP.HCM';
  engine.notify();

  app.switchPage('page_01');
  assert.equal(engine.filters.channel, 'GT');
  assert.equal(engine.filters.mien, 'Miền Bắc');
  assert.equal(engine.filters.vung, 'Hà Nội');

  app.switchPage('page_04');
  assert.equal(engine.filters.channel, 'MT');
  assert.equal(engine.filters.mien, 'Miền Nam');
  assert.equal(engine.filters.vung, 'TP.HCM');
});

test('date period is page-scoped instead of leaking to other report pages', () => {
  const { engine, app } = install();

  engine.filters.startDate = '2026-01-01';
  engine.filters.endDate = '2026-08-31';
  engine.filters.periodMode = 'ytd';
  engine.notify();

  app.switchPage('page_03');
  assert.equal(engine.filters.startDate, '2026-08-01');
  assert.equal(engine.filters.endDate, '2026-08-31');
  assert.equal(engine.filters.periodMode, 'mtd');

  engine.filters.startDate = '2026-07-01';
  engine.filters.endDate = '2026-08-31';
  engine.filters.periodMode = 'custom';
  engine.notify();

  app.switchPage('page_01');
  assert.equal(engine.filters.startDate, '2026-01-01');
  assert.equal(engine.filters.endDate, '2026-08-31');
  assert.equal(engine.filters.periodMode, 'ytd');
});

test('page scope labels clearly describe one-page-only behavior', () => {
  assert.equal(PAGE_LABELS.page_01, 'Tổng quan');
  assert.equal(PAGE_LABELS.page_04, 'Vùng - Miền');
  assert.equal(PAGE_LABELS.page_03, 'Sản phẩm');
});

test('executive shell loads the premium theme and page-scoped controller', () => {
  const executiveSource = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'executive-ui.js'), 'utf8');
  const premiumCss = fs.readFileSync(path.resolve(__dirname, '..', 'css', 'powerbi-premium-v7.css'), 'utf8');

  assert.match(executiveSource, /powerbi-premium-v7\.css/);
  assert.match(executiveSource, /page-scoped-filters-v7\.js/);
  assert.match(premiumCss, /page-filter-scope-chip/);
  assert.match(premiumCss, /executive-kpi-card::before/);
  assert.match(premiumCss, /background:\s*var\(--pbi-surface\)/);
});
