import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { Sparkles, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from '../lib/toast';

export default function Login() {
  const { login, loading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (isAuthenticated) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) { toast.error('Informe o e-mail.'); return; }
    if (!password) { toast.error('Informe a senha.'); return; }
    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      toast.error(err.message || 'Credenciais inválidas');
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4" style={{ backgroundColor: 'var(--ap-bg-page)' }}>
      <div className="card w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand/15 flex items-center justify-center mb-3">
            <Sparkles size={28} className="text-brand" />
          </div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--ap-text-1)' }}>IA Studio</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--ap-text-4)' }}>Painel do Cliente</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: 'var(--ap-text-2)' }}>E-mail</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@empresa.com"
              autoComplete="email"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: 'var(--ap-text-2)' }}>Senha</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full justify-center disabled:opacity-60 min-h-[44px]"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
