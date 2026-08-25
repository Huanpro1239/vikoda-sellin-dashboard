'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'staticwebapp.config.json'), 'utf8'));

function routeRule(route) {
  return (config.routes || []).find((item) => item.route === route);
}

test('Azure Static Web Apps protects dashboard and data with vikoda-user role', () => {
  const app = routeRule('/*');
  const data = routeRule('/data/*');
  assert.ok(app);
  assert.ok(data);
  assert.deepEqual(app.allowedRoles, ['vikoda-user']);
  assert.deepEqual(data.allowedRoles, ['vikoda-user']);
});

test('Microsoft Entra auth remains public while GitHub login is blocked', () => {
  const auth = routeRule('/.auth/*');
  const github = routeRule('/.auth/login/github');
  assert.ok(auth);
  assert.ok(auth.allowedRoles.includes('anonymous'));
  assert.equal(github.statusCode, 404);
});

test('unauthorized requests go to the public Microsoft login page', () => {
  assert.equal(config.responseOverrides['401'].statusCode, 302);
  assert.equal(config.responseOverrides['401'].redirect, '/login.html');
  assert.ok(fs.existsSync(path.join(root, 'login.html')));
});
