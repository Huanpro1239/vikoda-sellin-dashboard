'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { VikodaDataEngine } = require('../js/data-engine.js');
const { SmartSlicerController } = require('../js/smart-slicers.js');

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
    P_VK430: { code: 'VK430', name: 'Vikoda 430ml', short_name: 'Vikoda 430ml', group: 'Khoáng kiềm Vikoda', unit: 'Thùng' },
    P_VK15: { code: 'VK15', name: 'Vikoda 1.5L', short_name: 'Vikoda 1.5L', group: 'Khoáng kiềm Vikoda', unit: 'Thùng' },
    P_DT: { code: 'DT430', name: 'Đảnh Thạnh 430ml', short_name: 'Đảnh Thạnh 430ml', group: 'Khoáng ngọt Đảnh Thạnh', unit: 'Thùng' },
  };
  engine.facts = [
    ['2026-08-01', 'C_HN', 'P_VK430', '', 100, 1, 1, 0],
    ['2026-08-02', 'C_HCM', 'P_DT', '', 200, 1, 1, 0],
  ];
  engine.filters.startDate = '2026-08-01';
  engine.filters.endDate = '2026-08-31';
  return engine;
}

function makeDocument() {
  return {
    body: { dataset: {} },
    head: null,
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; },
    createElement() { return {}; },
  };
}

function install(engine = makeEngine()) {
  const app = {
    syncBusinessFilterControls() {},
    initSidebarDropdowns() {},
    updateFilterPillsUI() {},
  };
  const controller = new SmartSlicerController(engine, app, makeDocument());
  controller.install();
  return { controller, engine, app };
}

test('region cross-filter infers its parent miền and changing miền removes an invalid child region', () => {
  const { engine } = install();

  engine.setFilter('vung', 'TP.HCM');
  assert.equal(engine.filters.vung, 'TP.HCM');
  assert.equal(engine.filters.mien, 'Miền Nam');

  engine.setFilter('mien', 'Miền Bắc');
  assert.equal(engine.filters.mien, 'Miền Bắc');
  assert.equal(engine.filters.vung, null);
});

test('clearing miền clears its child vùng so the hierarchy cannot become contradictory', () => {
  const { engine } = install();
  engine.setFilter('vung', 'Hà Nội');
  assert.equal(engine.filters.mien, 'Miền Bắc');

  engine.setFilter('mien', '');
  assert.equal(engine.filters.mien, null);
  assert.equal(engine.filters.vung, null);
});

test('geography matching is unicode/whitespace tolerant while preserving display labels', () => {
  const { controller } = install();
  assert.deepEqual(controller.getRegionsForMien('  Miền Bắc  '), ['Hà Nội', 'Tây Bắc']);
  assert.equal(controller.getMienForRegion(' TP.HCM '), 'Miền Nam');
});

test('SKU selection infers its product group and group changes discard an incompatible SKU', () => {
  const { engine, controller } = install();

  engine.setFilter('productKey', 'P_VK430');
  assert.equal(engine.filters.productKey, 'P_VK430');
  assert.equal(engine.filters.productGroup, 'Khoáng kiềm Vikoda');
  assert.deepEqual(controller.getProductKeysForGroup('Khoáng kiềm Vikoda'), ['P_VK15', 'P_VK430']);

  engine.setFilter('productGroup', 'Đảnh Thạnh');
  assert.equal(engine.filters.productGroup, 'Đảnh Thạnh');
  assert.equal(engine.filters.productKey, null);
});

test('productKey participates in the canonical fact filter contract', () => {
  const { engine } = install();
  engine.setFilter('productKey', 'P_VK430');

  assert.equal(engine.matchesFactDimensionFilters(engine.facts[0]), true);
  assert.equal(engine.matchesFactDimensionFilters(engine.facts[1]), false);
});
