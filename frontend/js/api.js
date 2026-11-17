// Shared API client for every NovaWorks page.
// Login sets an httpOnly cookie, so every request uses credentials: 'include'.
//
// API base URL:
//   - Served by the backend (http://localhost:4000)   -> '/api' (same origin, recommended)
//   - Served by Live Server / another local port      -> 'http://localhost:4000/api'
//   - Deployed separately: set window.NOVA_API_URL before this script loads,
//     e.g. <script>window.NOVA_API_URL = 'https://your-api.onrender.com/api'</script>
(function () {
  function defaultApiUrl() {
    if (window.NOVA_API_URL) return window.NOVA_API_URL.replace(/\/$/, '');
    const { protocol, hostname, port } = window.location;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    if (protocol === 'file:' || (isLocal && port !== '4000')) return 'http://localhost:4000/api';
    return '/api';
  }

  const API_URL = defaultApiUrl();

  class ApiError extends Error {
    constructor(message, status, data) {
      super(message);
      this.status = status;
      this.data = data;
    }
  }

  // fetch wrapper: JSON in/out, cookie included, 401 -> back to login.
  async function api(path, { method = 'GET', body, redirectOn401 = true } = {}) {
    let res;
    try {
      res = await fetch(API_URL + path, {
        method,
        credentials: 'include',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(`Can't reach the server at ${API_URL}. Is the backend running?`, 0, null);
    }

    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }

    if (res.status === 401 && redirectOn401) {
      goToLogin();
      throw new ApiError((data && data.error) || 'Not logged in', 401, data);
    }
    if (!res.ok) {
      throw new ApiError((data && (data.error || data.message)) || `Request failed (${res.status})`, res.status, data);
    }
    return data;
  }

  function goToLogin() {
    if (!/index\.html$|\/$/.test(window.location.pathname)) window.location.href = 'index.html';
  }

  // Landing page per role: agents start on My Tasks, everyone else on Projects.
  function homeFor(user) {
    return user.role === 'AGENT' ? 'workspace.html' : 'dashboard.html';
  }

  // Use at the top of every protected page. Redirects to login if there's no session.
  async function requireUser() {
    const { user } = await api('/auth/me');
    setupHeader(user);
    return user;
  }

  async function logout() {
    try { await api('/auth/logout', { method: 'POST', redirectOn401: false }); } catch { /* ignore */ }
    window.location.href = 'index.html';
  }

  const ROLE_LABELS = { ADMIN: 'Admin', MANAGER: 'Manager', AGENT: 'Agent' };
  function roleLabel(role) { return ROLE_LABELS[role] || role; }

  function initials(name) {
    return String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  }

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function hours(n) {
    const num = Number(n) || 0;
    return `${Number.isInteger(num) ? num : num.toFixed(1)} hrs`;
  }

  // Fills the shared header: role badge, avatar initials, logout.
  function setupHeader(user) {
    document.querySelectorAll('[data-role-badge]').forEach((el) => { el.textContent = roleLabel(user.role); });
    document.querySelectorAll('[data-user-avatar]').forEach((el) => {
      el.title = `${user.name} (${roleLabel(user.role)})`;
      el.innerHTML = `<span class="text-on-primary font-label-sm text-label-sm font-bold">${esc(initials(user.name))}</span>`;
    });
    document.querySelectorAll('[data-logout]').forEach((el) => {
      el.addEventListener('click', (e) => { e.preventDefault(); logout(); });
    });
  }

  // Simple full-width message box (errors, empty states).
  function messageBox(text, tone = 'neutral') {
    const cls = tone === 'error'
      ? 'bg-error-container text-on-error-container'
      : 'bg-surface-container-low text-secondary';
    return `<div class="col-span-full rounded-xl px-space-lg py-space-xl text-center font-body-md text-body-md ${cls}">${esc(text)}</div>`;
  }

  window.Nova = { API_URL, api, ApiError, requireUser, logout, homeFor, roleLabel, initials, esc, hours, messageBox };
})();
