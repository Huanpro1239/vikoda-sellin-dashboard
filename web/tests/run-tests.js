'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const testFiles = fs.readdirSync(__dirname)
  .filter((name) => name.endsWith('.test.js'))
  .sort()
  .map((name) => path.join(__dirname, name));

if (testFiles.length === 0) {
  console.error('No web regression tests were found.');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: path.resolve(__dirname, '..', '..'),
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status === null ? 1 : result.status);
