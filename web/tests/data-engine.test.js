'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { VikodaDataEngine } = require('../js/data-engine.js');

const MILLION = 1_000_000;

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function makeEngine() {
  const engine = new VikodaDataEngine();
  engine.metadata = {
    as_of_date: '2027-02-14',
    source_latest_date: '2027-02-14',
    current_year: 2027,
    through_month: 2,
  };
  engine.customers = {
    C_GT: {
      name: 'Khách hàng GT',
      channel: 'GT',
      type: 'NPP',
      mien: 'Miền Bắc',
      vung: 'Bắc 1',
    },
    C_MT: {
      name: 'Khách hàng MT',
      channel: 'MT',
      type: 'SIÊU THỊ',
      system_mt: 'Chuỗi thử nghiệm',
      mien: 'MT',
      vung: 'MT',
    },
  };
  engine.products = {
    P_DT: {
      name: 'Đảnh Thạnh thử nghiệm',
      group: 'Khoáng ngọt Đảnh Thạnh',
      unit: 'Két',
      is_vikoda: false,
      is_kdt: false,
    },
    P_VK: {
      name: 'Vikoda thử nghiệm',
      group: 'Khoáng kiềm Vikoda',
      unit: 'Thùng',
      is_vikoda: true,
      is_kdt: false,
    },
  };
  engine.territories = {
    T_GT: { mien: 'Miền Bắc', vung: 'Bắc 1' },
    T_MT: { mien: 'MT', vung: 'MT' },
  };

  engine.facts = [];
  for (let day = 1; day <= 31; day += 1) {
    engine.facts.push([isoDate(2027, 1, day), 'C_GT', 'P_DT', 'T_GT', MILLION, 1, 1, 0]);
  }
  for (let day = 1; day <= 14; day += 1) {
    engine.facts.push([isoDate(2027, 2, day), 'C_GT', 'P_DT', 'T_GT', MILLION, 1, 1, 0]);
    engine.facts.push([isoDate(2027, 2, day), 'C_MT', 'P_VK', 'T_MT', 2 * MILLION, 1, 1, 0]);
  }

  const daysByMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  engine.targets = daysByMonth.map((days, index) => [
    `2027${String(index + 1).padStart(2, '0')}`,
    'T_GT',
    'C_GT',
    days * MILLION,
    0,
  ]);
  engine.targets.push(['202702', 'T_MT', 'C_MT', 84 * MILLION, 84 * MILLION]);

  engine.filters = {
    ...engine.filters,
    startDate: '2027-02-01',
    endDate: '2027-02-14',
    periodMode: 'mtd',
    channel: 'GT',
  };
  return engine;
}

test('KPI uses full-month target while daily proration stays explicit', () => {
  const engine = makeEngine();
  const targets = engine.getFilteredTargets();
  const proratedTargets = engine.getFilteredTargets(null, { prorate: true });

  assert.equal(targets.length, 1);
  assert.equal(targets[0][3], 28 * MILLION);
  assert.equal(proratedTargets[0][3], 14 * MILLION);

  const summary = engine.getSummaryKPIs();
  assert.equal(summary.actualMillion, 14);
  assert.equal(summary.targetMillion, 28);
  assert.equal(summary.attainment, 50);
});

test('data date bounds expose fact-derived start and metadata-controlled end', () => {
  const engine = makeEngine();
  const bounds = engine.getDataDateRange();

  assert.deepEqual(bounds, {
    minDate: '2027-01-01',
    maxDate: '2027-02-14',
    minMonth: '2027-01',
    maxMonth: '2027-02',
    availableMonths: ['2027-01', '2027-02'],
  });
});

test('monthly trend applies all active dimensions and normalizes Đảnh Thạnh aliases', () => {
  const engine = makeEngine();
  engine.filters.productGroup = 'Đảnh Thạnh';
  const trend = engine.getMonthlyTrend();

  assert.deepEqual(trend.actualSeries.slice(0, 3), [31, 14, 0]);
  assert.deepEqual(trend.targetSeries.slice(0, 3), [31, 28, 31]);

  engine.filters.productGroup = 'Khoáng ngọt Đảnh Thạnh';
  assert.equal(engine.getFilteredFacts().length, 14);
});

test('forecast horizons use metadata date, active filters, and observed run rate', () => {
  const engine = makeEngine();
  const month = engine.getExecutiveForecastByHorizon('month');
  const quarter = engine.getExecutiveForecastByHorizon('quarter');
  const year = engine.getExecutiveForecastByHorizon('year');

  assert.equal(month.title, 'Tháng 2/2027 (MTD)');
  assert.equal(month.actual, 14);
  assert.equal(month.target, 28);
  assert.equal(month.forecast, 28);
  assert.equal(month.remainingDays, 14);
  assert.equal(month.probabilityOfHit, 99.9);

  assert.equal(quarter.title, 'Quý 1/2027');
  assert.equal(quarter.forecast, 90);
  assert.equal(quarter.target, 90);
  assert.equal(year.title, 'Cả Năm 2027 (Kế hoạch AOP)');
  assert.equal(year.forecast, 365);
  assert.equal(year.target, 365);

  engine.filters.channel = 'MT';
  const filteredMonth = engine.getExecutiveForecastByHorizon('month');
  assert.equal(filteredMonth.actual, 28);
  assert.equal(filteredMonth.forecast, 56);
  assert.equal(filteredMonth.target, 84);
  assert.equal(filteredMonth.probabilityOfHit, 0.1);
});

test('quarter/year charts and CEO memos contain only derived, current-period values', () => {
  const engine = makeEngine();
  const quarterChart = engine.getForecastHorizonChartData('quarter');
  const yearChart = engine.getForecastHorizonChartData('year');
  const memos = JSON.stringify([
    ...engine.getCEODecisionMemo('month'),
    ...engine.getCEODecisionMemo('quarter'),
    ...engine.getCEODecisionMemo('year'),
  ]);

  assert.deepEqual(quarterChart.labels, ['Tháng 1', 'Tháng 2 (Hiện tại)', 'Tháng 3 (Dự báo)']);
  assert.deepEqual(quarterChart.forecastSeries, [31, 28, 31]);
  assert.equal(yearChart.labels.length, 12);
  assert.equal(yearChart.labels[1], 'Tháng 2 (Hiện tại)');
  assert.equal(yearChart.labels[7], 'Tháng 8 (Dự báo)');

  for (const staleClaim of ['Tháng 8/2026', 'Quý 3/2026', '589 Tỷ', '528 Tỷ', '53.2 Tỷ', '1,809', '14 NPP']) {
    assert.equal(memos.includes(staleClaim), false, `memo still contains: ${staleClaim}`);
  }
  assert.equal(memos.includes('2027'), true);
  assert.equal(memos.includes('99.9%'), true);
});
