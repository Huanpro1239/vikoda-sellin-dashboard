'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('accounting v9 is loaded after overview v8 as the final visual layer', () => {
  const shell = read('web/js/executive-ui.js');
  assert.match(shell, /accounting-report-v9\.css\?v=9\.0\.0/);
  assert.match(shell, /accounting-charts-v9\.js\?v=9\.0\.0/);
  assert.ok(shell.indexOf('overview-performance-v8.css') < shell.indexOf('accounting-report-v9.css'));
  assert.ok(shell.indexOf('overview-performance-v8.js') < shell.indexOf('accounting-charts-v9.js'));
});

test('accounting v9 uses restrained semantic sales colors and removes gradient dependence', () => {
  const js = read('web/js/accounting-charts-v9.js');
  assert.match(js, /navy:\s*'#183b56'/);
  assert.match(js, /slate:\s*'#a6b2bd'/);
  assert.match(js, /plan:\s*'#b47716'/);
  assert.match(js, /positive:\s*'#1f7a5a'/);
  assert.match(js, /negative:\s*'#b33a3a'/);
  assert.match(js, /cùng kỳ\|last year/);
  assert.match(js, /target\|kế hoạch\|plan/);
  assert.doesNotMatch(js, /LinearGradient/);
});

test('accounting v9 preserves business logic and only restyles existing chart options', () => {
  const js = read('web/js/accounting-charts-v9.js');
  assert.match(js, /chart\.getOption\?\.\(\)/);
  assert.match(js, /chart\.setOption\(patch, false, true\)/);
  assert.match(js, /engine\.subscribe/);
  assert.doesNotMatch(js, /getFilteredFacts\(/);
  assert.doesNotMatch(js, /getLYFilteredFacts\(/);
  assert.doesNotMatch(js, /fact_sell_in/);
  assert.doesNotMatch(js, /fact_target/);
});

test('accounting report css enforces tabular numeric presentation for finance tables and KPI values', () => {
  const css = read('web/css/accounting-report-v9.css');
  assert.match(css, /font-variant-numeric:\s*tabular-nums lining-nums/);
  assert.match(css, /\.data-table \.num/);
  assert.match(css, /--acct-plan:\s*#b47716/);
  assert.match(css, /--acct-negative:\s*#b33a3a/);
  assert.match(css, /\.chart-card-header::before/);
});
