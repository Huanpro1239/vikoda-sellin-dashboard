'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('overview v8 is loaded after the premium visual layer', () => {
  const shell = read('web/js/executive-ui.js');
  assert.match(shell, /overview-performance-v8\.css\?v=8\.0\.0/);
  assert.match(shell, /overview-performance-v8\.js\?v=8\.0\.0/);
  assert.ok(shell.indexOf('powerbi-premium-v7.css') < shell.indexOf('overview-performance-v8.css'));
});

test('overview v8 separates revenue and percent metrics into synchronized grids', () => {
  const js = read('web/js/overview-performance-v8.js');
  assert.match(js, /axisPointer:\s*\{\s*link:\s*\[\{\s*xAxisIndex:\s*\[0, 1\]/s);
  assert.match(js, /grid:\s*\[\s*\{[^}]*height:\s*'51%'/s);
  assert.match(js, /\{\s*left:\s*66,\s*right:\s*24,\s*top:\s*'70%'/s);
  assert.match(js, /name:\s*'Actual'[\s\S]*type:\s*'bar'[\s\S]*xAxisIndex:\s*0[\s\S]*yAxisIndex:\s*0/);
  assert.match(js, /name:\s*'Cùng kỳ'[\s\S]*type:\s*'bar'/);
  assert.match(js, /name:\s*'Target'[\s\S]*type:\s*'line'[\s\S]*yAxisIndex:\s*0/);
  assert.match(js, /name:\s*'% đạt Target'[\s\S]*xAxisIndex:\s*1[\s\S]*yAxisIndex:\s*1/);
  assert.match(js, /name:\s*'% Growth'[\s\S]*xAxisIndex:\s*1[\s\S]*yAxisIndex:\s*1/);
});

test('overview v8 removes label clutter and marks the remaining plan window', () => {
  const js = read('web/js/overview-performance-v8.js');
  const css = read('web/css/overview-performance-v8.css');
  assert.match(js, /params\.dataIndex === latestIndex/);
  assert.match(js, /formatter:\s*'Kế hoạch còn lại'/);
  assert.match(js, /data:\s*\[\{\s*yAxis:\s*100\s*\}\]/);
  assert.match(js, /min:\s*0,/);
  assert.match(js, /title\.textContent = 'Hiệu quả Sell-In theo tháng'/);
  assert.match(css, /#view_page_01 #chart_p1_trend\s*\{[^}]*height:\s*430px\s*!important/s);
});
