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

function renderOverviewOptions() {
  const options = {};
  const instances = {};
  const textNode = () => ({ textContent: '' });
  const makeCard = () => {
    const title = textNode();
    const subtitle = textNode();
    return {
      title,
      subtitle,
      classList: { add() {} },
      querySelector(selector) {
        if (selector === '.chart-title') return title;
        if (selector === '.chart-subtitle') return subtitle;
        return null;
      },
    };
  };
  const cards = {
    chart_p1_trend: makeCard(),
    chart_p1_channel_mix: makeCard(),
    chart_p1_product_mix: makeCard(),
    chart_p1_waterfall: makeCard(),
  };
  const chartElements = Object.fromEntries(Object.entries(cards).map(([id, card]) => [
    id,
    { closest() { return card; } },
  ]));
  const firstGrid = { style: {} };
  const secondGrid = {
    firstChild: null,
    appendChild() {},
    insertBefore() {},
  };
  const overviewPage = {
    dataset: {},
    querySelector(selector) {
      if (selector === ':scope > .charts-grid-2-1') return firstGrid;
      if (selector === ':scope > .charts-grid-2') return secondGrid;
      return null;
    },
  };
  const customers = {
    C1: { vung: 'Miền Trung 2B' },
    C2: { vung: 'Miền Trung 2A' },
    C3: { vung: 'Miền Trung 1B' },
    C4: { vung: 'Miền Trung 1A' },
    C5: { vung: 'MT' },
    C6: { vung: 'Vùng không thuộc Top 5' },
  };
  const actualByCustomer = {
    C1: 13_439_000_000,
    C2: 11_212_000_000,
    C3: 8_161_000_000,
    C4: 4_525_000_000,
    C5: 3_283_000_000,
    C6: 1_000_000_000,
  };
  const engine = {
    raw: {},
    metadata: { as_of_date: '2026-08-25' },
    customers,
    territories: {},
    products: { P1: { short_name: 'Vikoda' } },
    getMonthlyTrend() {
      return {
        labels: Array.from({ length: 12 }, (_, index) => `T${index + 1}`),
        actualSeries: Array(12).fill(1),
        lySeries: Array(12).fill(1),
        targetSeries: Array(12).fill(1),
      };
    },
    getFilteredFacts() {
      return Object.entries(actualByCustomer).map(([customer, actual]) => [
        '2026-08-01', customer, 'P1', '', actual, 0, 0, 0,
      ]);
    },
    subscribe() {},
  };
  const charts = {
    engine,
    instances,
    getOrCreate(id) {
      if (!instances[id]) {
        instances[id] = {
          setOption(option) { options[id] = option; },
          off() {},
          on() {},
        };
      }
      return instances[id];
    },
    resizeAll() {},
  };
  const context = {
    console,
    document: {
      getElementById(id) {
        if (id === 'view_page_01') return overviewPage;
        return chartElements[id] || null;
      },
      querySelector() { return null; },
    },
    window: {
      __vikodaReferenceAnalyticsInstalled: true,
      app: { activePage: 'page_01', render() {} },
      charts,
      dataEngine: engine,
      setTimeout(callback) { callback(); },
    },
  };
  vm.createContext(context);
  vm.runInContext(fidelitySource, context);
  return {
    trendOption: options.chart_p1_trend,
    regionOption: options.chart_p1_channel_mix,
    titles: Object.fromEntries(Object.entries(cards).map(([id, card]) => [id, card.title.textContent])),
    subtitles: Object.fromEntries(Object.entries(cards).map(([id, card]) => [id, card.subtitle.textContent])),
  };
}

test('Top 5 Vùng keeps complete Y-axis names and exact Actual values visible', () => {
  const { regionOption: option } = renderOverviewOptions();

  assert.ok(option, 'Top 5 Vùng must be rendered');
  assert.deepEqual(
    Array.from(option.yAxis.data),
    ['MT', 'Miền Trung 1A', 'Miền Trung 1B', 'Miền Trung 2A', 'Miền Trung 2B'],
  );
  assert.equal(option.grid.containLabel, true);
  assert.equal(option.yAxis.axisLabel.overflow, 'break');
  assert.equal(option.yAxis.axisLabel.interval, 0);
  assert.equal(option.series[0].label.formatter({ value: 13_439 }), '13.439 tr');
});

test('overview uses concise sentence-case visual titles without report numbering', () => {
  const { titles, subtitles } = renderOverviewOptions();

  assert.equal(titles.chart_p1_trend, 'Hiệu quả Sell-In theo tháng');
  assert.equal(titles.chart_p1_channel_mix, 'Top 5 vùng theo doanh thu');
  assert.equal(titles.chart_p1_product_mix, 'Top 5 nhóm sản phẩm');
  assert.equal(subtitles.chart_p1_trend, 'Actual, cùng kỳ và Target · Chạm hoặc rê để xem tỷ lệ');
});

test('overview monthly chart keeps three visual series and moves performance ratios into labels and tooltip', () => {
  const { trendOption: option } = renderOverviewOptions();

  assert.ok(option, 'Monthly overview chart must be rendered');
  assert.deepEqual(Array.from(option.legend.data), ['Actual', 'Cùng kỳ', 'Target']);
  assert.deepEqual(Array.from(option.series, (series) => series.name), ['Actual', 'Cùng kỳ', 'Target']);
  assert.equal(option.yAxis.length, 1, 'Overview chart should use one revenue scale');
  assert.equal(option.series[2].type, 'line', 'Target should be a light reference line');
  assert.match(option.series[0].label.formatter({ value: 1, dataIndex: 0 }), /100(?:,0)?%/);

  const tooltipHtml = option.tooltip.formatter([
    { name: '1', seriesName: 'Actual', value: 1, marker: '' },
    { name: '1', seriesName: 'Cùng kỳ', value: 1, marker: '' },
    { name: '1', seriesName: 'Target', value: 1, marker: '' },
  ]);
  assert.match(tooltipHtml, /% đạt Target/);
  assert.match(tooltipHtml, /Tăng trưởng/);
});
