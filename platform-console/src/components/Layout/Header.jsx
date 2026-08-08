import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Sun, Moon, ChevronDown, LogOut, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Modal from '../ui/Modal';
import { FormField, TextInput } from '../ui/FormField';
import { toast } from '../../lib/toast';

// Mapa estatico de breadcrumbs — toda rota nova adiciona entrada aqui.
const BREADCRUMBS = [
  { prefix: '/clientes/',  label: 'Clientes / Detalhe' },
  { prefix: '/clientes',   label: 'Clientes' },
  { prefix: '/planos',     label: 'Planos' },
  { prefix: '/marketplace', label: 'Marketplace' },
  { prefix: '/dominios',   label: 'Endereços' },
  { prefix: '/flags',      label: 'Feature Flags' },
  { prefix: '/consumo',    label: 'Consumo' },
  { prefix: '/auditoria',  label: 'Auditoria' },
];

export default function Header({ onToggleSidebar }) {
  const location = useLocation();
  const { user, logout, changePassword } = useAuth();
  const { theme, toggle } = useTheme();
  const [userOpen, setUserOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const userRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const crumb = BREADCRUMBS.find((b) => location.pathname.startsWith(b.prefix))?.label || 'Console';

  return (
    <header
      className="flex items-center gap-3 px-3 md:px-5 shrink-0"
      style={{
        backgroundColor: 'var(--ap-header)',
        borderBottom: '1px solid var(--ap-border)',
        paddingTop: 'calc(0.625rem + env(safe-area-inset-top))',
        paddingBottom: '0.625rem',
      }}
    >
      <button
        onClick={onToggleSidebar}
        className="btn-ghost p-2 min-w-[44px] min-h-[44px] justify-center md:min-w-0 md:min-h-0"
        aria-label="Alternar menu"
      >
        <Menu size={18} />
      </button>

      <p className="hidden md:block text-sm font-medium truncate" style={{ color: 'var(--ap-text-3)' }}>
        {crumb}
      </p>

      <div className="flex-1" />

      <span className="hidden md:inline-flex badge-purple">Operação</span>

      <button
        onClick={toggle}
        className="btn-ghost p-2 min-w-[44px] min-h-[44px] justify-center md:min-w-0 md:min-h-0"
        title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        aria-label="Alternar tema"
      >
        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </button>

      <div className="relative" ref={userRef}>
        <button
          onClick={() => setUserOpen((o) => !o)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors min-h-[44px] md:min-h-0"
          style={{ color: 'var(--ap-text-2)' }}
          aria-label="Menu do usuário"
        >
          <div className="w-8 h-8 rounded-full bg-brand/15 flex items-center justify-center shrink-0">
            <ShieldCheck size={15} className="text-brand" />
          </div>
          <span className="hidden md:block max-w-[140px] truncate text-sm font-medium">
            {user?.name || user?.email}
          </span>
          <ChevronDown size={14} style={{ color: 'var(--ap-text-4)' }} />
        </button>
        {userOpen && (
          <div
            className="absolute right-0 mt-1.5 w-56 rounded-xl shadow-xl z-50 overflow-hidden py-1.5"
            style={{ backgroundColor: 'var(--ap-surface)', border: '1px solid var(--ap-border)' }}
          >
            <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--ap-border)' }}>
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--ap-text-1)' }}>{user?.name || '—'}</p>
              <p className="text-xs truncate" style={{ color: 'var(--ap-text-4)' }}>{user?.email}</p>
            </div>
            <button
              onClick={() => { setUserOpen(false); setPwdOpen(true); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-brand/10"
              style={{ color: 'var(--ap-text-2)' }}
            >
              <KeyRound size={15} /> Trocar senha
            </button>
            <button
              onClick={logout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-red-500/10 text-red-500"
            >
              <LogOut size={15} /> Sair
            </button>
          </div>
        )}
      </div>

      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} changePassword={changePassword} />
    </header>
  );
}

function ChangePasswordModal({ open, onClose, changePassword }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setCurrent(''); setNext(''); setConfirm(''); }
  }, [open]);

  async function handleSave() {
    if (!current) { toast.error('Informe a senha atual.'); return; }
    if (!next || next.length < 8) { toast.error('A nova senha deve ter pelo menos 8 caracteres.'); return; }
    if (next !== confirm) { toast.error('A confirmação não confere com a nova senha.'); return; }
    setSaving(true);
    try {
      await changePassword(current, next);
      toast.success('Senha alterada com sucesso.');
      onClose();
    } catch (err) {
      toast.error(err.message || 'Erro ao trocar a senha');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Trocar senha"
      size="sm"
      dismissable={!saving}
      footer={
        <>
          <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 size={14} className="animate-spin" />} Salvar
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <FormField label="Senha atual" required>
          <TextInput type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </FormField>
        <FormField label="Nova senha" required hint="Mínimo de 8 caracteres.">
          <TextInput type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        </FormField>
        <FormField label="Confirmar nova senha" required>
          <TextInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </FormField>
      </div>
    </Modal>
  );
}
