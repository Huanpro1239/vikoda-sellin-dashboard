'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..', '..');
const jsDir = path.join(projectRoot, 'web', 'js');
const jsFiles = fs.readdirSync(jsDir)
  .filter((name) => name.endsWith('.js'))
  .sort()
  .map((name) => path.join(jsDir, name));

if (jsFiles.length === 0) {
  console.error('No dashboard JavaScript files were found under web/js.');
  process.exit(1);
}

for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`JavaScript syntax: PASS (${jsFiles.length} files)`);
