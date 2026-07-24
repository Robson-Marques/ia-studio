import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sparkles, Loader2 } from 'lucide-react';
import { useToast } from '@studio-ux-ds/react';
import { acceptInvite } from '../services/invites';

// Rota PUBLICA /convite/:token — aceite do convite (nome + senha).
export default function AcceptInvite() {
  const toast = useToast();
  const { token } = useParams();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { toast.error('Informe seu nome.'); return; }
    if (!password || password.length < 8) { toast.error('A senha deve ter pelo menos 8 caracteres.'); return; }
    if (password !== confirm) { toast.error('A confirmação não confere com a senha.'); return; }
    setSaving(true);
    try {
      await acceptInvite(token, { name: name.trim(), password });
      toast.success('Convite aceito! Entre com seu e-mail e a senha criada.');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(err.message || 'Erro ao aceitar o convite');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4" style={{ backgroundColor: 'var(--ap-bg-page)' }}>
      <div className="card w-full max-w-sm p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-brand/15 flex items-center justify-center mb-3">
            <Sparkles size={28} className="text-brand" />
          </div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--ap-text-1)' }}>IA Studio</h1>
          <p className="text-xs mt-1 text-center" style={{ color: 'var(--ap-text-4)' }}>
            Você foi convidado. Complete seu cadastro para acessar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: 'var(--ap-text-2)' }}>Nome completo</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
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
              placeholder="Mínimo de 8 caracteres"
              autoComplete="new-password"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-medium" style={{ color: 'var(--ap-text-2)' }}>Confirmar senha</label>
            <input
              type="password"
              className="input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repita a senha"
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="btn-primary w-full justify-center disabled:opacity-60 min-h-[44px]"
          >
            {saving && <Loader2 size={16} className="animate-spin" />}
            Aceitar convite
          </button>
        </form>
      </div>
    </div>
  );
}
