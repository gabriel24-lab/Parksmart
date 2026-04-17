// api.js  —  Cliente API compartido por todos los HTML
// ─────────────────────────────────────────────────────────────────────
//  ⚠️  IMPORTANTE: reemplaza la URL de abajo con la URL real de Render
//     una vez que hayas desplegado el backend.
//     Ejemplo: 'https://parqueadero-api.onrender.com/api'
// ─────────────────────────────────────────────────────────────────────
const API = 'https://parksmart-ggt8.onrender.com';

// ── Tokens ────────────────────────────────────────────────────────────
const Auth = {
  save(data) {
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    localStorage.setItem('user', JSON.stringify(data.user));
  },
  getToken() { return localStorage.getItem('access_token'); },
  getRefreshToken() { return localStorage.getItem('refresh_token'); },
  getUser() { const u = localStorage.getItem('user'); return u ? JSON.parse(u) : null; },
  clear() { localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token'); localStorage.removeItem('user'); },
  isLogged() { return !!this.getToken(); },
};

// ── Fetch con token automático y refresh ─────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = Auth.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  if (options.body instanceof FormData) delete headers['Content-Type'];

  let res = await fetch(`${API}${endpoint}`, { ...options, headers });

  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${Auth.getToken()}`;
      res = await fetch(`${API}${endpoint}`, { ...options, headers });
    } else {
      Auth.clear();
      window.location.href = 'login.html';
      return;
    }
  }

  return res;
}

async function tryRefresh() {
  const rt = Auth.getRefreshToken();
  if (!rt) return false;
  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    return true;
  } catch { return false; }
}

// ── Helpers ───────────────────────────────────────────────────────────
async function apiGet(endpoint) {
  const res = await apiFetch(endpoint);
  if (!res) return { ok: false, message: 'Sesión expirada.' };
  return res.json();
}

async function apiPost(endpoint, body) {
  const res = await apiFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res) return { ok: false, message: 'Sesión expirada.' };
  return res.json();
}

async function apiPut(endpoint, body) {
  const res = await apiFetch(endpoint, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res) return { ok: false, message: 'Sesión expirada.' };
  return res.json();
}

async function apiDelete(endpoint) {
  const res = await apiFetch(endpoint, { method: 'DELETE' });
  if (!res) return { ok: false, message: 'Sesión expirada.' };
  return res.json();
}

async function apiPostForm(endpoint, formData) {
  const res = await apiFetch(endpoint, { method: 'POST', body: formData });
  if (!res) return { ok: false, message: 'Sesión expirada.' };
  return res.json();
}
