'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('mobile V6 assets are wired into the dashboard shell', () => {
  const shell = read('web/js/executive-ui.js');
  assert.match(shell, /css\/mobile-v6\.css\?v=6\.1\.0/);
  assert.match(shell, /js\/mobile-v6\.js\?v=6\.0\.0/);
});

test('mobile V6 CSS covers phone layout and iPhone safe areas', () => {
  const css = read('web/css/mobile-v6.css');
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.mobile-bottom-nav/);
  assert.match(css, /\.mobile-filter-backdrop/);
  assert.match(css, /\.mobile-chart-scroll/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /min-height:\s*44px/);
});

test('mobile V6 JavaScript exposes all six dashboard pages', () => {
  const js = read('web/js/mobile-v6.js');
  for (const page of ['page_01', 'page_04', 'page_02', 'page_05', 'page_03', 'page_06']) {
    assert.match(js, new RegExp(page));
  }
  assert.match(js, /orientationchange/);
  assert.match(js, /resizeAll/);
  assert.match(js, /mobile_filter_backdrop/);
});

test('release syntax checks automatically cover every dashboard JavaScript file', () => {
  const pkg = JSON.parse(read('package.json'));
  const checker = read('web/tests/check-js-syntax.js');

  assert.equal(pkg.scripts['check:web'], 'node web/tests/check-js-syntax.js');
  assert.match(checker, /web['"], ['"]js/);
  assert.match(checker, /endsWith\(['"]\.js['"]\)/);
  assert.ok(fs.existsSync(path.join(root, 'web', 'js', 'mobile-v6.js')));
});
