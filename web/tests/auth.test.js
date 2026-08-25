'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');

const { VikodaAuth } = require('../js/auth.js');

class MemoryStore {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function makeAuth(clock, passwordHash = 'a'.repeat(64)) {
  return new VikodaAuth({
    localStore: new MemoryStore(),
    sessionStore: new MemoryStore(),
    cryptoProvider: webcrypto,
    passwordHash,
    now: () => clock.value,
    reload: () => {},
  });
}

test('unconfigured client gate stays open for the sanitized public build', async () => {
  const clock = { value: 100 };
  const auth = makeAuth(clock, '');

  assert.equal(auth.isConfigured(), false);
  assert.equal(auth.isAuthenticated(), true);
  assert.equal(await auth.login('anything'), true);
  assert.equal(auth.sessionStore.getItem(auth.STORAGE_KEY), null);
});

test('login stores a versioned, expiring session without plaintext credentials', async () => {
  const clock = { value: 1_000_000 };
  const auth = makeAuth(clock);
  auth.PASSWORD_HASH = await auth.sha256('test-only-password');

  assert.equal(await auth.login('wrong-password'), false);
  assert.equal(auth.isAuthenticated(), false);

  assert.equal(await auth.login('test-only-password', false), true);
  const stored = JSON.parse(auth.sessionStore.getItem(auth.STORAGE_KEY));
  assert.equal(stored.version, auth.SESSION_VERSION);
  assert.equal(stored.issuedAt, clock.value);
  assert.equal(stored.expiresAt, clock.value + auth.SESSION_TTL_MS);
  assert.equal(JSON.stringify(stored).includes('test-only-password'), false);
  assert.equal(auth.isAuthenticated(), true);
});

test('expired and legacy sessions are rejected and removed', () => {
  const clock = { value: 5_000 };
  const auth = makeAuth(clock);

  auth.sessionStore.setItem(auth.STORAGE_KEY, 'authenticated');
  assert.equal(auth.isAuthenticated(), false);
  assert.equal(auth.sessionStore.getItem(auth.STORAGE_KEY), null);

  auth.localStore.setItem(auth.STORAGE_KEY, JSON.stringify({
    version: auth.SESSION_VERSION,
    expiresAt: clock.value - 1,
  }));
  assert.equal(auth.isAuthenticated(), false);
  assert.equal(auth.localStore.getItem(auth.STORAGE_KEY), null);
});

test('logout clears both storage scopes', () => {
  const clock = { value: 10_000 };
  const auth = makeAuth(clock);
  auth.localStore.setItem(auth.STORAGE_KEY, '{}');
  auth.sessionStore.setItem(auth.STORAGE_KEY, '{}');

  auth.logout({ reload: false });

  assert.equal(auth.localStore.getItem(auth.STORAGE_KEY), null);
  assert.equal(auth.sessionStore.getItem(auth.STORAGE_KEY), null);
});
