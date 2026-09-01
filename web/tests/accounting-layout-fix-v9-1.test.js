'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('layout fix v9.1 loads after accounting v9', () => {
  const shell = read('web/js/executive-ui.js');
  assert.match(shell, /accounting-layout-fix-v9-1\.js\?v=9\.1\.0/);
  assert.ok(shell.indexOf('accounting-charts-v9.js') < shell.indexOf('accounting-layout-fix-v9-1.js'));
});

test('layout fix adds revenue headroom and percent-axis padding', () => {
  const js = read('web/js/accounting-layout-fix-v9-1.js');
  assert.match(js, /Number\(value \|\| 0\) \* 1\.12/);
  assert.match(js, /const pad = Math\.max\(10, range \* 0\.16\)/);
  assert.match(js, /top: Math\.max\(54/);
  assert.match(js, /bottom: Math\.max\(48/);
  assert.match(js, /containLabel: true/);
});

test('layout fix prevents percent labels from colliding with category axis', () => {
  const js = read('web/js/accounting-layout-fix-v9-1.js');
  assert.match(js, /params\.dataIndex !== latestIndex/);
  assert.match(js, /position: 'top'/);
  assert.match(js, /hideOverlap: true/);
});

test('layout fix is presentation only', () => {
  const js = read('web/js/accounting-layout-fix-v9-1.js');
  assert.match(js, /chart\.getOption\?\.\(\)/);
  assert.match(js, /chart\.setOption\(/);
  assert.doesNotMatch(js, /getFilteredFacts\(/);
  assert.doesNotMatch(js, /getLYFilteredFacts\(/);
  assert.doesNotMatch(js, /fact_sell_in/);
  assert.doesNotMatch(js, /fact_target/);
});
