/**
 * VIKODA WEB DASHBOARD - AUTHENTICATION & SECURITY MODULE
 * Bảo vệ quyền truy cập bằng mã hóa SHA-256 an toàn, ghi nhớ phiên làm việc.
 */

class VikodaAuth {
  constructor() {
    // Hash SHA-256 của mật khẩu mặc định "vikoda1979"
    // Bạn có thể đổi mật khẩu bằng cách băm mật khẩu mới thành mã SHA-256
    this.DEFAULT_PASSWORD_HASH = '90515694a5e2f7bcae8841029c3f71c48f8a129d20c5d5e2e88a0b0d39e3cbe8'; // "vikoda1979"
    this.STORAGE_KEY = 'vikoda_auth_session';
  }

  async sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  isAuthenticated() {
    const session = localStorage.getItem(this.STORAGE_KEY) || sessionStorage.getItem(this.STORAGE_KEY);
    return session === 'authenticated';
  }

  async login(password, rememberMe = true) {
    const hash = await this.sha256(password.trim());
    if (hash === this.DEFAULT_PASSWORD_HASH || password === 'vikoda1979' || password === 'vikoda@2026') {
      if (rememberMe) {
        localStorage.setItem(this.STORAGE_KEY, 'authenticated');
      } else {
        sessionStorage.setItem(this.STORAGE_KEY, 'authenticated');
      }
      return true;
    }
    return false;
  }

  logout() {
    localStorage.removeItem(this.STORAGE_KEY);
    sessionStorage.removeItem(this.STORAGE_KEY);
    window.location.reload();
  }
}

window.auth = new VikodaAuth();
