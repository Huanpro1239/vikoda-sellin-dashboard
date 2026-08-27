'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const webRoot = path.resolve(__dirname, '..');
const fidelitySource = fs.readFileSync(
  path.join(webRoot, 'js', 'reference-fidelity-v4.js'),
  'utf8',
);

function renderCustomerPage(customerCount = 15, selectedYear = 2026, fixtureOptions = {}) {
  const options = {};
  const subtitle = { textContent: '' };
  const customerCard = {
    querySelector(selector) {
      return selector === '.chart-subtitle' ? subtitle : null;
    },
  };
  const matrixHost = {
    innerHTML: '',
    closest() { return customerCard; },
  };
  const customerPage = { dataset: { fidelityConfigured: 'true' } };
  const customers = {};
  const facts = [];
  const lyFacts = [];
  const targets = [];

  const insertionOrder = fixtureOptions.insertionOrder || Array.from(
    { length: customerCount },
    (_, index) => index + 1,
  );
  for (const index of insertionOrder) {
    const key = `C${String(index).padStart(2, '0')}`;
    const value = fixtureOptions.equalActual
      ? 1_000_000_000
      : (customerCount - index + 1) * 1_000_000_000;
    customers[key] = { code: key, name: `Khách hàng ${String(index).padStart(2, '0')}` };
    facts.push([`${selectedYear}-01-15`, key, 'P1', '', value, 0, 0, 0]);
    lyFacts.push([`${selectedYear - 1}-01-15`, key, 'P1', '', value / 2, 0, 0, 0]);
    targets.push([`${selectedYear}-01-01`, '', key, value * 1.1]);
  }

  const engine = {
    raw: {},
    metadata: { as_of_date: '2026-08-25' },
    filters: {
      startDate: `${selectedYear}-01-01`,
      endDate: `${selectedYear}-12-31`,
    },
    customers,
    getFilteredFacts(customFilters = null) {
      const filters = customFilters || this.filters;
      return facts.filter((row) => row[0] >= filters.startDate && row[0] <= filters.endDate);
    },
    getLYFilteredFacts() { return lyFacts; },
    getFilteredTargets() { return targets; },
    subscribe() {},
  };
  const charts = {
    engine,
    getOrCreate(id) {
      return { setOption(option) { options[id] = option; } };
    },
    resizeAll() {},
  };
  const context = {
    console,
    document: {
      getElementById(id) {
        if (id === 'view_page_02') return customerPage;
        if (id === 'reference_customer_matrix_wrap') return matrixHost;
        return null;
      },
      querySelector() { return null; },
    },
    window: {
      __vikodaReferenceAnalyticsInstalled: true,
      app: { activePage: 'page_02', render() {} },
      charts,
      dataEngine: engine,
      setTimeout(callback) { callback(); },
    },
  };

  vm.createContext(context);
  vm.runInContext(fidelitySource, context);

  return { matrixHTML: matrixHost.innerHTML, options, subtitle: subtitle.textContent };
}

test('customer 12-month matrix renders every active customer beyond the former Top 12 limit', () => {
  const { matrixHTML } = renderCustomerPage(15);
  const tbody = matrixHTML.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || '';
  const rows = tbody.match(/<tr>/g) || [];

  assert.equal(rows.length, 15);
  assert.match(tbody, /Khách hàng 15/);
});

test('customer 12-month matrix reports the rendered customer count', () => {
  const { subtitle } = renderCustomerPage(15);

  assert.match(subtitle, /15 khách hàng/);
});

test('customer ranking chart remains focused on the Top 12 customers', () => {
  const { options } = renderCustomerPage(15);

  assert.equal(options.chart_p2_channel.series[0].data.length, 12);
  assert.equal(options.chart_p2_system_mt.series[0].data[0].name, 'Top 12 khách hàng');
});

test('customer 12-month matrix follows the year selected in the date filters', () => {
  const { matrixHTML } = renderCustomerPage(15, 2025);

  assert.match(matrixHTML, /T01 2025/);
  assert.doesNotMatch(matrixHTML, /T01 2026/);
});

test('customer matrix uses customer name as a stable tie-breaker for equal Actual values', () => {
  const { matrixHTML } = renderCustomerPage(3, 2026, {
    equalActual: true,
    insertionOrder: [3, 1, 2],
  });
  const tbody = matrixHTML.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] || '';
  const names = [...tbody.matchAll(/<tr><td>[^<]+<\/td><td>([^<]+)<\/td>/g)]
    .map((match) => match[1]);

  assert.deepEqual(names, ['Khách hàng 01', 'Khách hàng 02', 'Khách hàng 03']);
});
