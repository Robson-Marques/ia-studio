import axios from 'axios';

// Cliente HTTP central do platform-console (Console do SaaS — operação).
//
//   - baseURL /api/v1; endpoints do console vivem sob /console/*.
//   - Token JWT persistido em localStorage.iastudio_console_token (chave
//     propria, separada do painel do cliente).
//   - 401 → limpa storage e volta pro /login.

export const TOKEN_KEY = 'iastudio_console_token';
export const USER_KEY  = 'iastudio_console_user';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else       localStorage.removeItem(TOKEN_KEY);
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function setStoredUser(user) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else      localStorage.removeItem(USER_KEY);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      clearAuth();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

// Helper que extrai mensagem legivel de erros do NestJS.
export function extractErrorMessage(err, fallback = 'Erro inesperado') {
  const data = err?.response?.data;
  if (!data) return err?.message || fallback;
  if (typeof data === 'string') return data;
  if (Array.isArray(data.message)) return data.message.join(', ');
  return data.message || data.error || fallback;
}

// Normaliza respostas de listagem: aceita array puro ou { items, total }.
export function normalizeList(data) {
  if (Array.isArray(data)) return { items: data, total: data.length };
  return { items: data?.items || data?.data || [], total: data?.total ?? (data?.items || data?.data || []).length };
}

export default api;
