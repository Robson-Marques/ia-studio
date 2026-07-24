// LEGADO (2026-07-24). Preservado para rollback. Só se importa a partir de
// Layout.legacy.jsx. O modal de troca de senha aqui migrou para /conta/senha
// (rota nova) — este arquivo mantém a versão antiga em modal para referência.
import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Menu, Sun, Moon, ChevronDown, LogOut, KeyRound, Boxes, Loader2, User,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import Modal from '../ui/Modal';
import { FormField, TextInput } from '../ui/FormField';
import { Badge } from '../ui/Table';
import NotificationsBell from './NotificationsBell';
import { useToast } from '@studio-ux-ds/react';

const BREADCRUMBS = {
  '/':            'Dashboard',
  '/usuarios':    'Configurações / Usuários e Convites',
  '/perfis':      'Configurações / Perfis de Acesso',
  '/workspaces':  'Configurações / Workspaces e Ambientes',
  '/auditoria':   'Configurações / Auditoria',
  '/minha-conta': 'Configurações / Minha Conta',
  '/integracoes/marketplace': 'Integrações / Marketplace',
  '/integracoes/conexoes':    'Integrações / Conexões',
  '/integracoes/segredos':    'Integrações / Cofre de Segredos',
  '/whatsapp/conversas': 'WhatsApp / Conversas',
  '/whatsapp/templates': 'WhatsApp / Templates',
  '/whatsapp/equipes':   'WhatsApp / Equipes e Filas',
  '/whatsapp/numeros':   'WhatsApp / Números',
  '/isp/abertura-chamado': 'ISP / Abertura de chamado',
  '/whatsapp/atendimento-ia': 'WhatsApp / Atendimento por IA',
  '/automacao/fluxos':       'Automação / Fluxos',
  '/automacao/agendamentos': 'Automação / Agendamentos',
  '/automacao/execucoes':    'Automação / Execuções',
  '/automacao/templates':    'Automação / Templates',
  '/automacao/eventos':      'Automação / Eventos',
  '/automacao/notificacoes': 'Automação / Notificações',
  '/ia/agentes':      'IA Studio / Assistentes',
  '/ia/conhecimento': 'IA Studio / Conhecimento',
  '/ia/memoria':      'IA Studio / Memória',
  '/ia/ferramentas':  'IA Studio / Habilidades',
  '/ia/aprovacoes':   'IA Studio / Pendências',
  '/ia/custos':       'IA Studio / Custos',
};

const ENV_BADGE = {
  PRODUCTION:  { label: 'Produção',        variant: 'green' },
  STAGING:     { label: 'Homologação',     variant: 'yellow' },
  DEVELOPMENT: { label: 'Desenvolvimento', variant: 'blue' },
};

export default function HeaderLegacy({ onToggleSidebar }) {
  const location = useLocation();
  const { user, logout, changePassword } = useAuth();
  const { theme, toggle } = useTheme();
  const { workspaces, workspace, environment, selectWorkspace, selectEnvironment } = useWorkspace();

  const [wsOpen, setWsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const wsRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (wsRef.current && !wsRef.current.contains(e.target)) setWsOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const crumb = BREADCRUMBS[location.pathname]
    || (location.pathname.startsWith('/automacao/fluxos/') ? 'Automação / Fluxos / Editor' : 'IA Studio');
  const envInfo = environment ? (ENV_BADGE[environment.kind] || { label: environment.name || environment.kind, variant: 'gray' }) : null;

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
      <button onClick={onToggleSidebar} className="btn-ghost p-2 min-w-[44px] min-h-[44px] justify-center md:min-w-0 md:min-h-0" aria-label="Alternar menu">
        <Menu size={18} />
      </button>
      <p className="hidden md:block text-sm font-medium truncate" style={{ color: 'var(--ap-text-3)' }}>{crumb}</p>
      <div className="flex-1" />
      {workspaces.length > 0 && (
        <div className="relative" ref={wsRef}>
          <button onClick={() => setWsOpen((o) => !o)} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors min-h-[44px] md:min-h-0" style={{ border: '1px solid var(--ap-border)', color: 'var(--ap-text-2)', backgroundColor: 'var(--ap-surface-2)' }} title="Selecionar workspace">
            <Boxes size={15} className="text-brand shrink-0" />
            <span className="max-w-[120px] md:max-w-[180px] truncate font-medium">{workspace?.name || 'Workspace'}</span>
            {envInfo && <Badge variant={envInfo.variant}>{envInfo.label}</Badge>}
            <ChevronDown size={14} style={{ color: 'var(--ap-text-4)' }} />
          </button>
          {wsOpen && (
            <div className="absolute right-0 mt-1.5 w-72 rounded-xl shadow-xl z-50 overflow-hidden" style={{ backgroundColor: 'var(--ap-surface)', border: '1px solid var(--ap-border)' }}>
              <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ap-text-5)' }}>Workspaces</p>
              <div className="max-h-72 overflow-y-auto pb-2">
                {workspaces.map((w) => (
                  <div key={w.id}>
                    <button onClick={() => { selectWorkspace(w.id); setWsOpen(false); }} className="w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2" style={{ color: w.id === workspace?.id ? 'var(--ap-accent)' : 'var(--ap-text-2)', backgroundColor: w.id === workspace?.id ? 'var(--ap-surface-3)' : 'transparent' }}>
                      <Boxes size={14} className="shrink-0" />
                      <span className="flex-1 truncate font-medium">{w.name}</span>
                    </button>
                    {w.id === workspace?.id && (w.environments || []).length > 0 && (
                      <div className="pl-8 pr-3 pb-1 flex flex-wrap gap-1">
                        {w.environments.map((e) => {
                          const info = ENV_BADGE[e.kind] || { label: e.name || e.kind, variant: 'gray' };
                          const on = e.id === environment?.id;
                          return (
                            <button key={e.id} onClick={() => { selectEnvironment(e.id); setWsOpen(false); }} className="text-[11px] px-2 py-1 rounded-md transition-colors" style={{ border: '1px solid var(--ap-border)', backgroundColor: on ? 'var(--ap-surface-3)' : 'transparent', color: on ? 'var(--ap-text-1)' : 'var(--ap-text-4)', fontWeight: on ? 600 : 400 }}>{info.label}</button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <NotificationsBell />
      <button onClick={toggle} className="btn-ghost p-2 min-w-[44px] min-h-[44px] justify-center md:min-w-0 md:min-h-0" title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'} aria-label="Alternar tema">
        {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      <div className="relative" ref={userRef}>
        <button onClick={() => setUserOpen((o) => !o)} className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors min-h-[44px] md:min-h-0" style={{ color: 'var(--ap-text-2)' }} aria-label="Menu do usuário">
          <div className="w-8 h-8 rounded-full bg-brand/15 flex items-center justify-center shrink-0"><User size={15} className="text-brand" /></div>
          <span className="hidden md:block max-w-[140px] truncate text-sm font-medium">{user?.name || user?.email}</span>
          <ChevronDown size={14} style={{ color: 'var(--ap-text-4)' }} />
        </button>
        {userOpen && (
          <div className="absolute right-0 mt-1.5 w-56 rounded-xl shadow-xl z-50 overflow-hidden py-1.5" style={{ backgroundColor: 'var(--ap-surface)', border: '1px solid var(--ap-border)' }}>
            <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--ap-border)' }}>
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--ap-text-1)' }}>{user?.name || '—'}</p>
              <p className="text-xs truncate" style={{ color: 'var(--ap-text-4)' }}>{user?.email}</p>
            </div>
            <button onClick={() => { setUserOpen(false); setPwdOpen(true); }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-brand/10" style={{ color: 'var(--ap-text-2)' }}>
              <KeyRound size={15} /> Trocar senha
            </button>
            <button onClick={logout} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-red-500/10 text-red-500">
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
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setCurrent(''); setNext(''); setConfirm(''); } }, [open]);
  async function handleSave() {
    if (!current) { toast.error('Informe a senha atual.'); return; }
    if (!next || next.length < 8) { toast.error('A nova senha deve ter pelo menos 8 caracteres.'); return; }
    if (next !== confirm) { toast.error('A confirmação não confere com a nova senha.'); return; }
    setSaving(true);
    try { await changePassword(current, next); toast.success('Senha alterada com sucesso.'); onClose(); }
    catch (err) { toast.error(err.message || 'Erro ao trocar a senha'); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={saving ? undefined : onClose} title="Trocar senha" size="sm" dismissable={!saving}
      footer={<>
        <button className="btn-secondary disabled:opacity-60" onClick={onClose} disabled={saving}>Cancelar</button>
        <button className="btn-primary disabled:opacity-60" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 size={14} className="animate-spin" />} Salvar
        </button>
      </>}
    >
      <div className="space-y-3">
        <FormField label="Senha atual" required><TextInput type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></FormField>
        <FormField label="Nova senha" required hint="Mínimo de 8 caracteres."><TextInput type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></FormField>
        <FormField label="Confirmar nova senha" required><TextInput type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></FormField>
      </div>
    </Modal>
  );
}
