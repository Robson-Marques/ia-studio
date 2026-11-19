import axios from 'axios';

// Cliente HTTP central do platform-admin (Painel do Cliente).
//
//   - baseURL /api/v1 (proxy do Vite em dev; nginx em producao).
//   - Token JWT persistido em localStorage.iastudio_token.
//   - Interceptor de request injeta somente Authorization: Bearer.
//   - Interceptor de response redireciona para /login em 401 e limpa storage.

export const TOKEN_KEY     = 'iastudio_token';
export const USER_KEY      = 'iastudio_user';

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
      // Evita loop caso a propria tela de login retorne 401. Rotas publicas
      // (aceite de convite) tambem nao devem redirecionar.
      const path = window.location.pathname;
      if (!path.startsWith('/login') && !path.startsWith('/convite')) {
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

export default api;
