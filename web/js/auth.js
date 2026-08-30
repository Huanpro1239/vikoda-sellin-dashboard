/**
 * VIKODA WEB DASHBOARD - OPTIONAL CLIENT-SIDE ACCESS GATE
 *
 * This is a UX gate only, not a security boundary. GitHub Pages is public static
 * hosting and the deployed dashboard payload must be treated as publicly readable.
 * The gate stays open unless a local/custom build injects VIKODA_ACCESS_GATE_HASH.
 */

class VikodaAuth {
  constructor(options = {}) {
    const browserWindow = typeof window !== 'undefined' ? window : null;

    this.PASSWORD_HASH = options.passwordHash
      || (browserWindow && browserWindow.VIKODA_ACCESS_GATE_HASH)
      || '';
    this.STORAGE_KEY = 'vikoda_auth_session';
    this.SESSION_VERSION = 2;
    this.SESSION_TTL_MS = 8 * 60 * 60 * 1000;
    this.REMEMBER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

    this.localStore = options.localStore || (browserWindow && browserWindow.localStorage) || null;
    this.sessionStore = options.sessionStore || (browserWindow && browserWindow.sessionStorage) || null;
    this.cryptoProvider = options.cryptoProvider || globalThis.crypto;
    this.now = options.now || (() => Date.now());
    this.reload = options.reload || (() => {
      if (browserWindow && browserWindow.location) browserWindow.location.reload();
    });
  }

  isConfigured() {
    return typeof this.PASSWORD_HASH === 'string' && /^[a-f0-9]{64}$/i.test(this.PASSWORD_HASH);
  }

  async sha256(message) {
    if (!this.cryptoProvider || !this.cryptoProvider.subtle) {
      throw new Error('Web Crypto API is unavailable.');
    }
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await this.cryptoProvider.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  hashesEqual(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
    let mismatch = 0;
    for (let i = 0; i < left.length; i += 1) {
      mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
    }
    return mismatch === 0;
  }

  clearSessions() {
    if (this.localStore) this.localStore.removeItem(this.STORAGE_KEY);
    if (this.sessionStore) this.sessionStore.removeItem(this.STORAGE_KEY);
  }

  readValidSession(store) {
    if (!store) return false;
    const raw = store.getItem(this.STORAGE_KEY);
    if (!raw) return false;

    try {
      const session = JSON.parse(raw);
      const valid = session
        && session.version === this.SESSION_VERSION
        && Number.isFinite(session.expiresAt)
        && session.expiresAt > this.now();
      if (valid) return true;
    } catch (_) {
      // Malformed or legacy sessions are invalidated below.
    }

    store.removeItem(this.STORAGE_KEY);
    return false;
  }

  isAuthenticated() {
    if (!this.isConfigured()) return true;
    return this.readValidSession(this.sessionStore) || this.readValidSession(this.localStore);
  }

  async login(password, rememberMe = false) {
    if (!this.isConfigured()) return true;

    const candidate = typeof password === 'string' ? password.trim() : '';
    if (!candidate) return false;

    const hash = await this.sha256(candidate);
    if (!this.hashesEqual(hash, this.PASSWORD_HASH)) return false;

    const now = this.now();
    const ttl = rememberMe ? this.REMEMBER_TTL_MS : this.SESSION_TTL_MS;
    const session = JSON.stringify({
      version: this.SESSION_VERSION,
      issuedAt: now,
      expiresAt: now + ttl,
    });

    this.clearSessions();
    const targetStore = rememberMe ? this.localStore : this.sessionStore;
    if (!targetStore) return false;
    targetStore.setItem(this.STORAGE_KEY, session);
    return true;
  }

  logout({ reload = true } = {}) {
    this.clearSessions();
    if (reload) this.reload();
  }
}

if (typeof window !== 'undefined') {
  window.VikodaAuth = VikodaAuth;
  window.auth = new VikodaAuth();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VikodaAuth };
}
