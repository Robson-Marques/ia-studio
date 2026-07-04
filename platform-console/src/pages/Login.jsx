import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { TerminalSquare, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from '../lib/toast';

export default function Login() {
  const { login, loading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (isAuthenticated) return <Navigate to="/clientes" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) { toast.error('Informe o e-mail.'); return; }
    if (!password) { toast.error('Informe a senha.'); return; }
    try {
      await login(email.trim(), password);
      navigate('/clientes', { replace: true });
    } catch (err) {
      toast.error(err.message || 'Credenciais inválidas');
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4" style={{ backgroundColor: '#0b1120' }}>
      <div
        className="w-full max-w-sm p-8 rounded-xl shadow-2xl"
        style={{ backgroundColor: '#111a2e', border: '1px solid rgba(51, 65, 85, 0.5)' }}
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-brand/20 flex items-center justify-center mb-3">
            <TerminalSquare size={28} className="text-brand-light" />
          </div>
          <h1 className="text-xl font-bold text-slate-100">IA Studio Console</h1>
          <p className="text-xs mt-1 text-slate-500">Acesso restrito à operação do SaaS</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-300">E-mail</label>
            <input
              type="email"
              className="w-full rounded-lg px-3 py-2 text-sm bg-[#0b1120] border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operacao@iastudio.com"
              autoComplete="email"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-300">Senha</label>
            <input
              type="password"
              className="w-full rounded-lg px-3 py-2 text-sm bg-[#0b1120] border border-slate-700 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand/30"
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
