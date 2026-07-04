import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, {
  getToken, setToken, getStoredUser, setStoredUser, clearAuth,
  extractErrorMessage,
} from '../lib/api';

// AuthContext do Painel do Cliente.
//
// login  → POST /auth/login {email,password} → { token, user }
// me     → GET /auth/me → { user, organization, workspaces, permissions, license }
//
// `me` fica disponivel pro app inteiro (workspaces alimentam o seletor do
// Header; permissions alimentam o usePermissions; license alimenta Dashboard).

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(() => getStoredUser());
  const [token, setTokenState]  = useState(() => getToken());
  const [me, setMe]             = useState(null);
  const [loading, setLoading]   = useState(false);
  const [checking, setChecking] = useState(true);

  const refreshMe = useCallback(async () => {
    const { data } = await api.get('/auth/me');
    setMe(data);
    if (data?.user) {
      setUser(data.user);
      setStoredUser(data.user);
    }
    return data;
  }, []);

  // Ao iniciar, se ha token salvo, valida chamando /auth/me.
  useEffect(() => {
    let alive = true;
    async function validate() {
      if (!token) { setChecking(false); return; }
      try {
        const { data } = await api.get('/auth/me');
        if (!alive) return;
        setMe(data);
        if (data?.user) {
          setUser(data.user);
          setStoredUser(data.user);
        }
      } catch {
        if (!alive) return;
        clearAuth();
        setUser(null);
        setTokenState('');
      } finally {
        if (alive) setChecking(false);
      }
    }
    validate();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      const { token: accessToken, user: u } = data || {};
      if (!accessToken) throw new Error('Resposta de login inválida');
      setToken(accessToken);
      setTokenState(accessToken);
      const finalUser = u || { email };
      setUser(finalUser);
      setStoredUser(finalUser);
      // Carrega o contexto completo (workspaces, permissions, license).
      try { await refreshMe(); } catch { /* nao bloqueia o login */ }
      return finalUser;
    } catch (err) {
      throw new Error(extractErrorMessage(err, 'Credenciais inválidas'));
    } finally {
      setLoading(false);
    }
  }, [refreshMe]);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
    setMe(null);
    setTokenState('');
    window.location.assign('/login');
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });
    } catch (err) {
      throw new Error(extractErrorMessage(err, 'Erro ao trocar a senha'));
    }
  }, []);

  const value = {
    user, token, me, loading, checking,
    isAuthenticated: Boolean(token && user),
    login, logout, refreshMe, changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
