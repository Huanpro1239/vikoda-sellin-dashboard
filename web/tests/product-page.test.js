'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('product trend uses an explicit full-width grid contract', () => {
  const css = read('web/css/reference-fidelity-v4.css');
  const js = read('web/js/reference-fidelity-v4.js');

  assert.match(js, /firstGrid\?\.classList\.add\('reference-product-trend-grid'\)/);
  assert.match(js, /trendCard\?\.classList\.add\('reference-product-trend-card'\)/);
  assert.match(css, /#view_page_03 > \.reference-product-trend-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)\s*!important/s);
  assert.doesNotMatch(css, /#view_page_03 > \.charts-grid-2:first-of-type/);
});

test('product trend provides more room and larger labels for high values', () => {
  const css = read('web/css/reference-fidelity-v4.css');
  const js = read('web/js/reference-fidelity-v4.js');

  assert.match(css, /#view_page_03 #chart_p3_trend\s*\{\s*height:\s*300px/);
  assert.match(js, /const isProductTrend = chartId === 'chart_p3_trend'/);
  assert.match(js, /const valueLabelFontSize = isProductTrend \? 10 : 8\.5/);
  assert.match(js, /containLabel:\s*true/);
  assert.match(js, /position:\s*isProductTrend \? 'insideTop' : 'top'/);
  assert.match(js, /\.\.\.\(isProductTrend \? \{ min: 0 \} : \{\}\)/);
  assert.match(js, /isProductTrend \? fmtCompact\(p\.value\) : fmt\(p\.value\)/);
});

test('product layout assets use a fresh cache version', () => {
  const shell = read('web/js/executive-ui.js');
  const html = read('web/index.html');

  assert.match(shell, /reference-fidelity-v4\.css\?v=4\.2\.0/);
  assert.match(shell, /reference-fidelity-v4\.js\?v=4\.2\.0/);
  assert.match(html, /executive-ui\.js\?v=2\.6\.0/);
  assert.match(html, /app\.js\?v=2\.5\.0/);
});

test('mobile page changes keep the product header in sync', () => {
  const app = read('web/js/app.js');
  const shell = read('web/js/executive-ui.js');

  assert.match(app, /new CustomEvent\('vikoda:pagechange', \{ detail: \{ pageId \} \}\)/);
  assert.match(shell, /addEventListener\('vikoda:pagechange'/);
  assert.match(shell, /setPageContext\(requestedPage\)/);
});
