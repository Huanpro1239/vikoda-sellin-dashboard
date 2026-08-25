const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const webRoot = path.resolve(__dirname, '..');
const appSource = fs.readFileSync(path.join(webRoot, 'js', 'app.js'), 'utf8');
const chartsSource = fs.readFileSync(path.join(webRoot, 'js', 'charts.js'), 'utf8');
const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');

function createAppHarness(asOfDate = '2026-08-15') {
  const dateInputs = {
    filter_start_date: { value: '' },
    filter_end_date: { value: '' },
  };
  const dateRangeCalls = [];
  const context = {
    console,
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById(id) {
        return dateInputs[id] || null;
      },
      createElement() {
        return { value: '', textContent: '' };
      },
      querySelectorAll() {
        return [];
      },
    },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    window: {
      dataEngine: {
        metadata: { as_of_date: asOfDate },
        setDateRange(...args) {
          dateRangeCalls.push(args);
        },
      },
    },
    setTimeout,
    clearTimeout,
  };
  vm.createContext(context);
  vm.runInContext(appSource, context);
  return { app: context.window.app, context, dateInputs, dateRangeCalls };
}

test('month selection uses a valid month end and caps the current month at as-of date', () => {
  const { app, dateInputs, dateRangeCalls } = createAppHarness();

  app.setMonthPeriod('2026-08');
  assert.equal(dateInputs.filter_end_date.value, '2026-08-15');
  assert.deepEqual(dateRangeCalls.at(-1), ['2026-08-01', '2026-08-15', 'mtd']);

  app.setMonthPeriod('2026-02');
  assert.equal(dateInputs.filter_end_date.value, '2026-02-28');
  assert.deepEqual(dateRangeCalls.at(-1), ['2026-02-01', '2026-02-28', 'mtd']);
});

test('month selector is generated from available fact months', () => {
  const { app, context } = createAppHarness();
  context.window.dataEngine.facts = [
    ['2025-01-03'],
    ['2026-07-10'],
    ['2026-08-15'],
    ['invalid'],
  ];
  const select = {
    children: [],
    replaceChildren() { this.children = []; },
    appendChild(child) { this.children.push(child); },
  };

  app.populateMonthOptions(select);

  assert.deepEqual(select.children.map((option) => option.value), ['', '2026-08', '2026-07', '2025-01']);
  assert.match(select.children[1].textContent, /Mới nhất/);
  assert.doesNotMatch(html, /<option value="2026-/);
});

test('period labels are derived from the loaded data window', () => {
  const { app, context } = createAppHarness('2027-02-14');
  context.window.dataEngine.facts = [['2025-01-03'], ['2027-02-14']];
  const buttons = [
    { dataset: {}, value: '', getAttribute: (key) => (key === 'data-quick' ? 'mtd' : null) },
    { dataset: {}, value: '', getAttribute: (key) => (key === 'data-quick' ? 'qtd' : null) },
    { dataset: {}, value: '', getAttribute: (key) => (key === 'data-quick' ? 'ytd' : null) },
    { dataset: {}, value: '', getAttribute: (key) => (key === 'data-quick' ? 'all' : null) },
  ];
  context.document.querySelectorAll = (selector) => (
    selector === '.quick-btn[data-quick]' ? buttons : []
  );

  app.updatePeriodLabels();

  assert.deepEqual(buttons.map((button) => button.textContent), [
    'MTD (T2)',
    'QTD (Q1)',
    'YTD (2027)',
    'Tất cả (2025–2027)',
  ]);
  assert.doesNotMatch(html, /Tháng 8\/2026|Q3 · Q4|AOP 2026|2025-2026/);
});

test('all-period shortcut starts at the earliest available fact date', () => {
  const { app, context, dateRangeCalls } = createAppHarness();
  context.window.dataEngine.facts = [
    ['2024-03-05'],
    ['2025-01-10'],
    ['2026-08-15'],
  ];

  app.setQuickPeriod('all');

  assert.deepEqual(dateRangeCalls.at(-1), ['2024-03-05', '2026-08-15', 'all']);
  assert.doesNotMatch(appSource, /start\s*=\s*['"]2025-01-01['"]/);
});

test('HTML escaping neutralizes stored markup before table rendering', () => {
  const { app } = createAppHarness();
  assert.equal(
    app.escapeHTML('<img src=x onerror="alert(1)"> & test'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; test',
  );
  assert.match(appSource, /escapeHTML\(r\.custName\)/);
  assert.match(chartsSource, /escapeHTML\(c\.name\)/);
  assert.match(chartsSource, /escapeHTML\(m\.decision\)/);
});

test('markup has no inline JavaScript handlers and permits browser zoom', () => {
  assert.doesNotMatch(html, /\son(?:click|change|input|submit)\s*=/i);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i);
  assert.match(html, /aria-modal="true"/);
});
