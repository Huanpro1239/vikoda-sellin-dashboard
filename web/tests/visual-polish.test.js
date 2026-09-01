'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const webRoot = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const executiveSource = fs.readFileSync(path.join(webRoot, 'js', 'executive-ui.js'), 'utf8');
const polishCss = fs.readFileSync(path.join(webRoot, 'css', 'vikoda-polish-v9.css'), 'utf8');

function cssBlockAfter(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `Missing CSS marker: ${marker}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(open + 1, index);
  }
  throw new Error(`Unclosed CSS block: ${marker}`);
}

function minHeightFor(source, selector) {
  let result = 0;
  for (const match of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(',').map((value) => value.trim());
    if (!selectors.includes(selector)) continue;
    const height = match[2].match(/min-height:\s*(\d+(?:\.\d+)?)px\s*!important/);
    if (height) result = Number(height[1]);
  }
  return result;
}

function runExecutiveLoader() {
  const appended = [];
  const document = {
    readyState: 'complete',
    title: '',
    body: { dataset: {} },
    head: {
      appendChild(node) {
        appended.push(node);
      },
    },
    createElement(tagName) {
      return {
        tagName,
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = String(value);
        },
      };
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    getElementById() { return null; },
    addEventListener() {},
  };
  const context = {
    document,
    window: { setTimeout() {} },
    setTimeout() {},
  };
  vm.createContext(context);
  vm.runInContext(executiveSource, context);
  return appended;
}

test('visual loader applies the fresh polish stylesheet after every legacy layer', () => {
  const nodes = runExecutiveLoader();
  const stylesheets = nodes.filter((node) => node.tagName === 'link');

  assert.equal(stylesheets.at(-1).href, 'css/vikoda-polish-v9.css?v=9.0.0');
  assert.equal(stylesheets.at(-2).href, 'css/mobile-v6.css?v=6.1.0');
  assert.match(html, /js\/executive-ui\.js\?v=2\.9\.0/);
  assert.match(html, /js\/app\.js\?v=2\.9\.0/);
});

test('visual loader publishes the renamed overview script with a new cache version', () => {
  const scripts = runExecutiveLoader().filter((node) => node.tagName === 'script');
  const fidelityScript = scripts.find((node) => node.attributes['data-vikoda-reference-fidelity']);

  assert.equal(fidelityScript.src, 'js/reference-fidelity-v4.js?v=4.4.0');
});

test('final mobile cascade keeps every primary touch target at least 44px tall', () => {
  const mobileCss = cssBlockAfter(polishCss, '@media (max-width: 900px)');
  const selectors = [
    '.reference-dashboard-v3 .nav-item',
    '.reference-dashboard-v3 .filter-select',
    '.reference-dashboard-v3 .date-input',
    '.reference-dashboard-v3 .quick-date-pills .quick-btn',
    '.reference-dashboard-v3 .filter-feedback-bar .btn-clear-all',
    '.reference-dashboard-v3 .remove-pill',
    '.reference-dashboard-v3 .btn-mobile-filter',
    '.reference-dashboard-v3 #btn_toggle_business_filters',
  ];

  selectors.forEach((selector) => {
    assert.ok(minHeightFor(mobileCss, selector) >= 44, `${selector} must remain a 44px touch target`);
  });
});
