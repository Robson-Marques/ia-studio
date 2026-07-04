import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api, {
  getToken, setToken, getStoredUser, setStoredUser, clearAuth,
  extractErrorMessage,
} from '../lib/api';

// AuthContext do Console do SaaS.
//
// Mesmo endpoint de login do painel (/auth/login), mas o Console e restrito
// a operadores da plataforma: se `user.is_platform_admin` for falso, o login
// e recusado localmente ("Acesso restrito à operação") e nada e persistido.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]         = useState(() => getStoredUser());
  const [token, setTokenState]  = useState(() => getToken());
  const [loading, setLoading]   = useState(false);
  const [checking, setChecking] = useState(true);

  // Ao iniciar, se ha token salvo, valida chamando /auth/me.
  useEffect(() => {
    let alive = true;
    async function validate() {
      if (!token) { setChecking(false); return; }
      try {
        const { data } = await api.get('/auth/me');
        if (!alive) return;
        const u = data?.user || data;
        if (!u?.is_platform_admin) {
          // Token de usuario comum nao serve no Console.
          clearAuth();
          setUser(null);
          setTokenState('');
          return;
        }
        setUser(u);
        setStoredUser(u);
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
      if (!u?.is_platform_admin) {
        throw new Error('Acesso restrito à operação');
      }
      setToken(accessToken);
      setTokenState(accessToken);
      setUser(u);
      setStoredUser(u);
      return u;
    } catch (err) {
      if (err?.message === 'Acesso restrito à operação') throw err;
      throw new Error(extractErrorMessage(err, 'Credenciais inválidas'));
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
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
    user, token, loading, checking,
    isAuthenticated: Boolean(token && user),
    login, logout, changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>');
  return ctx;
}
