'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('overview v8 is loaded after the premium visual layer', () => {
  const shell = read('web/js/executive-ui.js');
  assert.match(shell, /overview-performance-v8\.css\?v=8\.1\.0/);
  assert.match(shell, /overview-performance-v8\.js\?v=8\.1\.0/);
  assert.ok(shell.indexOf('powerbi-premium-v7.css') < shell.indexOf('overview-performance-v8.css'));
});

test('overview v8 keeps a single revenue plot with three visual series', () => {
  const js = read('web/js/overview-performance-v8.js');
  assert.doesNotMatch(js, /xAxisIndex:\s*1|yAxisIndex:\s*1/);
  assert.match(js, /legend:[\s\S]*data:\s*\['Actual', 'Cùng kỳ', 'Target'\]/);
  assert.match(js, /name:\s*'Actual'[\s\S]*type:\s*'bar'/);
  assert.match(js, /name:\s*'Cùng kỳ'[\s\S]*type:\s*'bar'/);
  assert.match(js, /name:\s*'Target'[\s\S]*type:\s*'line'/);
  assert.doesNotMatch(js, /name:\s*'% đạt Target'[\s\S]*type:\s*'line'/);
  assert.doesNotMatch(js, /name:\s*'% Growth'[\s\S]*type:\s*'line'/);
});

test('overview v8 surfaces attainment on Actual and ratios in the tooltip', () => {
  const js = read('web/js/overview-performance-v8.js');
  const css = read('web/css/overview-performance-v8.css');
  assert.match(js, /state = attained >= 100 \? 'good' : attained >= 85 \? 'warn' : 'bad'/);
  assert.match(js, /% đạt Target/);
  assert.match(js, /Tăng trưởng/);
  assert.match(js, /formatter:\s*'Kế hoạch'/);
  assert.match(js, /title\.textContent = 'Hiệu quả Sell-In theo tháng'/);
  assert.match(js, /Chạm hoặc rê để xem tỷ lệ/);
  assert.match(css, /#view_page_01 #chart_p1_trend\s*\{[^}]*height:\s*360px\s*!important/s);
});
