'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { VikodaDataEngine } = require('../js/data-engine.js');
const { SmartSlicerController } = require('../js/smart-slicers.js');
const { ChannelGeographyFacetController } = require('../js/channel-geography-facets.js');

function makeEngine() {
  const engine = new VikodaDataEngine();
  engine.raw = {};
  engine.metadata = { as_of_date: '2026-08-31' };
  engine.customers = {
    C_GT_HN: { channel: 'GT', mien: 'Miền Bắc', vung: 'Hà Nội' },
    C_GT_DNB: { channel: 'GT', mien: 'Miền Nam', vung: 'Đông Nam Bộ' },
    C_MT_HCM: { channel: 'MT', mien: 'Miền Nam', vung: 'TP.HCM' },
    C_KA_TB: { channel: 'KA', mien: 'Miền Bắc', vung: 'Tây Bắc' },
  };
  engine.territories = {};
  engine.products = {
    P_VK: { code: 'VK430', name: 'Vikoda 430ml', group: 'Khoáng kiềm Vikoda', unit: 'Thùng' },
    P_DT: { code: 'DT430', name: 'Đảnh Thạnh 430ml', group: 'Khoáng ngọt Đảnh Thạnh', unit: 'Thùng' },
  };
  engine.facts = [
    ['2026-08-01', 'C_GT_HN', 'P_VK', '', 100, 1, 1, 0],
    ['2026-08-02', 'C_GT_DNB', 'P_DT', '', 100, 1, 1, 0],
    ['2026-08-03', 'C_MT_HCM', 'P_DT', '', 100, 1, 1, 0],
    ['2026-08-04', 'C_KA_TB', 'P_VK', '', 100, 1, 1, 0],
  ];
  engine.filters.startDate = '2026-08-01';
  engine.filters.endDate = '2026-08-31';
  return engine;
}

function makeHarness() {
  const engine = makeEngine();
  const elements = {
    select_mien: { value: '', values: [], disabled: false },
    select_vung: { value: '', values: [], disabled: false },
  };
  const doc = {
    body: { dataset: {} },
    head: null,
    addEventListener() {},
    getElementById(id) { return elements[id] || null; },
    querySelectorAll() { return []; },
    createElement() { return {}; },
  };
  const app = {
    syncBusinessFilterControls() {},
    initSidebarDropdowns() {},
    updateFilterPillsUI() {},
    replaceBusinessFilterOptions(select, values, _label, selectedValue = '') {
      select.values = [...values];
      select.value = values.includes(selectedValue) ? selectedValue : '';
    },
  };

  new SmartSlicerController(engine, app, doc).install();
  const facets = new ChannelGeographyFacetController(engine, app, doc).install();
  return { engine, app, elements, facets };
}

test('channel facets expose only miền and vùng with eligible facts', () => {
  const { engine, facets } = makeHarness();

  engine.setFilter('channel', 'GT');
  assert.deepEqual(facets.getAvailableMiens(), ['Miền Bắc', 'Miền Nam']);
  assert.deepEqual(facets.getAvailableRegions('Miền Bắc'), ['Hà Nội']);
  assert.deepEqual(facets.getAvailableRegions('Miền Nam'), ['Đông Nam Bộ']);

  engine.setFilter('channel', 'MT');
  assert.deepEqual(facets.getAvailableMiens(), ['Miền Nam']);
  assert.deepEqual(facets.getAvailableRegions(), ['TP.HCM']);
});

test('changing channel clears stale miền/vùng selections that are not available in the new channel', () => {
  const { engine } = makeHarness();

  engine.setFilter('channel', 'GT');
  engine.setFilter('vung', 'Hà Nội');
  assert.equal(engine.filters.mien, 'Miền Bắc');
  assert.equal(engine.filters.vung, 'Hà Nội');

  engine.setFilter('channel', 'MT');
  assert.equal(engine.filters.mien, null);
  assert.equal(engine.filters.vung, null);
});

test('region cross-filter cannot inject a region outside the selected channel', () => {
  const { engine } = makeHarness();

  engine.setFilter('channel', 'GT');
  engine.setFilter('vung', 'TP.HCM');
  assert.equal(engine.filters.vung, null);
  assert.equal(engine.filters.mien, null);

  engine.setFilter('channel', 'MT');
  engine.setFilter('vung', 'TP.HCM');
  assert.equal(engine.filters.vung, 'TP.HCM');
  assert.equal(engine.filters.mien, 'Miền Nam');
});

test('geography facets also respect active product filters', () => {
  const { engine, facets } = makeHarness();

  engine.setFilter('channel', 'GT');
  engine.setFilter('productKey', 'P_VK');
  assert.deepEqual(facets.getAvailableMiens(), ['Miền Bắc']);
  assert.deepEqual(facets.getAvailableRegions(), ['Hà Nội']);
});

test('UI miền/vùng option lists are rebuilt when channel changes', () => {
  const { engine, app, elements } = makeHarness();

  engine.setFilter('channel', 'GT');
  app.syncBusinessFilterControls();
  assert.deepEqual(elements.select_mien.values, ['Miền Bắc', 'Miền Nam']);
  assert.deepEqual(elements.select_vung.values, ['Đông Nam Bộ', 'Hà Nội']);

  engine.setFilter('channel', 'MT');
  app.syncBusinessFilterControls();
  assert.deepEqual(elements.select_mien.values, ['Miền Nam']);
  assert.deepEqual(elements.select_vung.values, ['TP.HCM']);
});
