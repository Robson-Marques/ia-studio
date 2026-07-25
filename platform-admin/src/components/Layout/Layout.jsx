import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AppShell } from '@studio-ux-ds/react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { usePermissions } from '../../hooks/usePermissions';
import { Badge } from '../ui/Table';
import { getNotificationsInbox } from '../../services/automation';

// Layout — casca principal do painel do cliente. Adota o AppShell do Studio UX
// (passo 2 da expansão de adoção, 2026-07-24). Substitui a dupla Sidebar+Header
// legada (preservadas em Layout.legacy / Sidebar.legacy / Header.legacy para
// rollback). O piloto isolado /studio-ux-demo continua funcionando dentro desta
// casca — o tema DS já vive lá.
//
// Slots do AppShell usados:
//   brand           — logo "IA Studio · Painel do Cliente"
//   nav             — sections com groups do menu (idêntico ao legado, agora no formato do DS)
//   version         — "vX.Y.Z" no rodapé da sidebar (passivo, apenas indicativo)
//   breadcrumb      — array [{label, href?}] derivado do path
//   topbarContext   — seletor de workspace + badge de ambiente
//   user            — { name, initials, email }
//   userMenuItems   — Minha conta + Trocar senha + Sair (o Claro/Escuro e Personalizar
//                     são adicionados automaticamente pelo AppShell)
//   onNotifications — navega direto para /automacao/notificacoes (ADR: sinal
//                     acionável, sem duplicar dropdown do sino antigo)
//   notifications   — contador de não-lidas (polling 30s, mesma fonte do sino legado)
//   customize=true  — liga o painel Personalizar embutido (Drawer com Customize)
//   onLogout        — logout do AuthContext
//
// Observações:
//   * DSIcon do @studio-ux-ds/icons tem biblioteca curada — usamos nomes semanticamente
//     próximos aos ícones lucide-react do legado. Ícones sem equivalente exato caem
//     em fallbacks razoáveis (documentado no ADR).
//   * Multi-tenant branding não existe hoje na plataforma — quando existir, o
//     Customize/AppShell aceitará accent/tema por organização.

// Mapa de ícones: lucide-react → nomes DSIcon (Studio UX curados).
// Escolha por proximidade semântica; o DSIcon tem ALIASES próprios pra alguns.
const LUCIDE_TO_DS = {
  LayoutDashboard: 'dashboard',
  BrainCircuit: 'settings',
  Bot: 'user',
  BookOpen: 'file',
  Brain: 'settings',
  Wrench: 'settings',
  ShieldCheck: 'lock',
  DollarSign: 'file',
  Network: 'settings',
  Radio: 'bell',
  Workflow: 'settings',
  GitBranch: 'chart-bar',
  CalendarClock: 'calendar',
  Activity: 'chart-bar',
  FileText: 'file',
  Zap: 'check',
  Bell: 'bell',
  MessageCircle: 'message',
  ListOrdered: 'menu',
  Phone: 'phone',
  Plug: 'settings',
  Blocks: 'file',
  KeyRound: 'lock',
  Database: 'file',
  Boxes: 'file',
  Compass: 'search',
  Terminal: 'file',
  Code: 'file',
  Settings: 'settings',
  Users: 'users',
  ScrollText: 'file',
  CreditCard: 'file',
};

// Estrutura do menu — idêntica ao legado, mas apenas com o nome do ícone (string).
// Cada nível é `{ label, iconKey, path?, perm?, children? }`. `perm` string ou array (OR).
const NAV = [
  { label: 'Dashboard', iconKey: 'LayoutDashboard', path: '/' },
  {
    label: 'IA Studio', iconKey: 'BrainCircuit',
    children: [
      { label: 'Assistentes',   iconKey: 'Bot',        path: '/ia/agentes',      perm: 'ai.agents.read' },
      { label: 'Conhecimento',  iconKey: 'BookOpen',   path: '/ia/conhecimento', perm: 'ai.knowledge.read' },
      { label: 'Memória',       iconKey: 'Brain',      path: '/ia/memoria',      perm: 'ai.memory.read' },
      { label: 'Habilidades',   iconKey: 'Wrench',     path: '/ia/ferramentas',  perm: 'ai.tools.read' },
      { label: 'Pendências',    iconKey: 'ShieldCheck', path: '/ia/aprovacoes',   perm: 'ai.approvals.read' },
      { label: 'Custos',        iconKey: 'DollarSign', path: '/ia/custos',       perm: 'ai.costs.read' },
    ],
  },
  {
    label: 'ISP (Provedores)', iconKey: 'Network',
    children: [
      { label: 'Incidentes', iconKey: 'Radio', path: '/isp/incidentes', perm: 'isp.incidents.read' },
      { label: 'Abertura de chamado', iconKey: 'Wrench', path: '/isp/abertura-chamado', perm: 'isp.incidents.read' },
    ],
  },
  {
    label: 'Automação', iconKey: 'Workflow',
    children: [
      { label: 'Fluxos',        iconKey: 'GitBranch',     path: '/automacao/fluxos',        perm: 'automation.workflows.read' },
      { label: 'Agendamentos',  iconKey: 'CalendarClock', path: '/automacao/agendamentos',  perm: 'automation.workflows.read' },
      { label: 'Execuções',     iconKey: 'Activity',      path: '/automacao/execucoes',     perm: 'automation.executions.read' },
      { label: 'Templates',     iconKey: 'FileText',      path: '/automacao/templates',     perm: 'automation.templates.read' },
      { label: 'Eventos',       iconKey: 'Zap',           path: '/automacao/eventos',       perm: 'automation.events.read' },
      { label: 'Notificações',  iconKey: 'Bell',          path: '/automacao/notificacoes',  perm: 'automation.notifications.read' },
    ],
  },
  {
    label: 'WhatsApp', iconKey: 'MessageCircle',
    children: [
      {
        label: 'Conversas', iconKey: 'MessageCircle', path: '/whatsapp/conversas',
        perm: ['comm.whatsapp.view.assigned', 'comm.whatsapp.view.unassigned', 'comm.whatsapp.view.team', 'comm.whatsapp.view.all'],
      },
      { label: 'Atendimento por IA', iconKey: 'Bot',       path: '/whatsapp/atendimento-ia', perm: 'automation.workflows.read' },
      { label: 'Templates',       iconKey: 'FileText',    path: '/whatsapp/templates', perm: 'comm.whatsapp.templates.read' },
      { label: 'Equipes e Filas', iconKey: 'ListOrdered', path: '/whatsapp/equipes',   perm: 'comm.whatsapp.teams.read' },
      { label: 'Números',         iconKey: 'Phone',       path: '/whatsapp/numeros',   perm: 'comm.whatsapp.numbers.read' },
    ],
  },
  {
    label: 'Integrações', iconKey: 'Plug',
    children: [
      { label: 'Marketplace',       iconKey: 'Blocks',  path: '/integracoes/marketplace', perm: 'integrations.marketplace.read' },
      { label: 'Conexões',          iconKey: 'Plug',    path: '/integracoes/conexoes',    perm: 'integrations.connections.read' },
      { label: 'Cofre de Segredos', iconKey: 'KeyRound', path: '/integracoes/segredos',   perm: 'integrations.secrets.read' },
    ],
  },
  {
    label: 'Recursos', iconKey: 'Database',
    children: [
      { label: 'Mapeamentos', iconKey: 'Boxes',   path: '/recursos/mapeamentos', perm: 'resource.mappings.read' },
      { label: 'Explorer',    iconKey: 'Compass', path: '/recursos/explorer',    perm: 'resource.explore.read' },
    ],
  },
  {
    label: 'Desenvolvedor', iconKey: 'Terminal',
    children: [
      { label: 'Console',   iconKey: 'Code',     path: '/desenvolvedor/console',  perm: 'devtools.use' },
      { label: 'API Keys',  iconKey: 'KeyRound', path: '/desenvolvedor/api-keys', perm: 'developer.apikeys.read' },
    ],
  },
  {
    label: 'Configurações', iconKey: 'Settings',
    children: [
      { label: 'Usuários e Convites',     iconKey: 'Users',       path: '/usuarios',    perm: 'core.users.read' },
      { label: 'Perfis de Acesso',        iconKey: 'ShieldCheck', path: '/perfis',      perm: 'core.profiles.read' },
      { label: 'Workspaces e Ambientes',  iconKey: 'Boxes',       path: '/workspaces',  perm: 'core.workspaces.read' },
      { label: 'Auditoria',               iconKey: 'ScrollText',  path: '/auditoria',   perm: 'core.audit.read' },
      { label: 'Minha Conta',             iconKey: 'CreditCard',  path: '/minha-conta' },
    ],
  },
];

// Mapa estático de breadcrumbs — reflete o legado; nova rota adiciona entrada aqui.
const BREADCRUMBS = {
  '/':            'Dashboard',
  '/usuarios':    'Configurações / Usuários e Convites',
  '/perfis':      'Configurações / Perfis de Acesso',
  '/workspaces':  'Configurações / Workspaces e Ambientes',
  '/auditoria':   'Configurações / Auditoria',
  '/minha-conta': 'Configurações / Minha Conta',
  '/conta/senha': 'Configurações / Trocar senha',
  '/integracoes/marketplace': 'Integrações / Marketplace',
  '/integracoes/conexoes':    'Integrações / Conexões',
  '/integracoes/segredos':    'Integrações / Cofre de Segredos',
  '/whatsapp/conversas': 'WhatsApp / Conversas',
  '/whatsapp/templates': 'WhatsApp / Templates',
  '/whatsapp/equipes':   'WhatsApp / Equipes e Filas',
  '/whatsapp/numeros':   'WhatsApp / Números',
  '/isp/abertura-chamado': 'ISP / Abertura de chamado',
  '/isp/incidentes':       'ISP / Incidentes',
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
  '/recursos/mapeamentos':  'Recursos / Mapeamentos',
  '/recursos/explorer':     'Recursos / Explorer',
  '/desenvolvedor/console': 'Desenvolvedor / Console',
  '/desenvolvedor/api-keys':'Desenvolvedor / API Keys',
  '/studio-ux-demo':        'Studio UX (piloto)',
};

const ENV_BADGE = {
  PRODUCTION:  { label: 'Produção',        variant: 'green' },
  STAGING:     { label: 'Homologação',     variant: 'yellow' },
  DEVELOPMENT: { label: 'Desenvolvimento', variant: 'blue' },
};

// Hook — contador de notificações não-lidas. Polling 30s (mesma frequência do
// sino legado). Silencia erros: polling não pode virar chuva de toast.
function useNotificationsUnread() {
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const data = await getNotificationsInbox(1);
        if (alive) setUnread(data?.unread || 0);
      } catch {
        /* silencioso */
      }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return unread;
}

function initialsOf(nameOrEmail) {
  if (!nameOrEmail) return '?';
  const parts = String(nameOrEmail).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { can } = usePermissions();
  const { workspaces, workspace, environment, selectWorkspace, selectEnvironment } = useWorkspace();
  const unread = useNotificationsUnread();
  const [wsOpen, setWsOpen] = useState(false);
  // Ref no botão do picker + posição fixa do dropdown. O AppShell tem
  // `overflow: hidden` nos ancestrais (.su-appshell, .su-appshell__main),
  // o que corta qualquer dropdown `position: absolute`. Solução: renderizar
  // o menu via createPortal no <body>, com posição fixed calculada a partir
  // do getBoundingClientRect do botão.
  const wsButtonRef = useRef(null);
  const [wsMenuPos, setWsMenuPos] = useState(null);
  function toggleWsMenu() {
    if (wsOpen) { setWsOpen(false); return; }
    const rect = wsButtonRef.current?.getBoundingClientRect();
    if (rect) setWsMenuPos({ top: rect.bottom + 6, left: rect.left });
    setWsOpen(true);
  }

  // Constrói `nav` no formato do AppShell (sections + items; grupo colapsável).
  // Filtragem por permissão: item sem perm sempre aparece; item com perm só se
  // `can(perm)` (string ou array = OR).
  const nav = useMemo(() => {
    const canAny = (perm) => !perm || (Array.isArray(perm) ? perm.some((p) => can(p)) : can(perm));
    const items = NAV
      .map((item) => {
        if (!item.children) {
          if (!canAny(item.perm)) return null;
          return {
            icon: LUCIDE_TO_DS[item.iconKey] || 'help',
            label: item.label,
            href: item.path,
            active: item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path),
            onClick: (e) => { e?.preventDefault?.(); navigate(item.path); },
          };
        }
        const children = item.children
          .filter((c) => canAny(c.perm))
          .map((c) => ({
            icon: LUCIDE_TO_DS[c.iconKey] || 'help',
            label: c.label,
            href: c.path,
            active: location.pathname.startsWith(c.path),
            onClick: (e) => { e?.preventDefault?.(); navigate(c.path); },
          }));
        if (!children.length) return null;
        return {
          group: item.label,
          icon: LUCIDE_TO_DS[item.iconKey] || 'help',
          items: children,
        };
      })
      .filter(Boolean);
    return items;
  }, [location.pathname, can, navigate]);

  // Fecha o dropdown de workspace ao clicar fora. Como o menu agora vive num
  // portal (fora do container do botão), o teste "clicou fora" precisa
  // verificar TANTO o botão QUANTO o próprio menu — se o target não estiver
  // dentro de nenhum dos dois, fecha.
  useEffect(() => {
    if (!wsOpen) return;
    function onDoc(e) {
      const btn = wsButtonRef.current;
      const menu = document.getElementById('ws-picker-menu');
      const inside = (btn && btn.contains(e.target)) || (menu && menu.contains(e.target));
      if (!inside) setWsOpen(false);
    }
    // Fecha também em scroll/resize (posição do fixed pode ficar deslocada).
    function onWinChange() { setWsOpen(false); }
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onWinChange, true);
    window.addEventListener('resize', onWinChange);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onWinChange, true);
      window.removeEventListener('resize', onWinChange);
    };
  }, [wsOpen]);

  const crumb = BREADCRUMBS[location.pathname]
    || (location.pathname.startsWith('/automacao/fluxos/') ? 'Automação / Fluxos / Editor'
      : (location.pathname === '/ia/ferramentas/tool/nova' ? 'IA Studio / Habilidades / Nova'
        : (location.pathname.match(/^\/ia\/ferramentas\/tool\/[^/]+\/editar$/) ? 'IA Studio / Habilidades / Editar'
          : 'IA Studio')));
  const breadcrumb = crumb.split(' / ').map((label) => ({ label }));

  const envInfo = environment
    ? (ENV_BADGE[environment.kind] || { label: environment.name || environment.kind, variant: 'gray' })
    : null;

  // Workspace picker + badge de ambiente — vive no topbarContext do AppShell.
  // O menu abre via Portal (fora do container com overflow: hidden do AppShell).
  const topbarContext = workspaces.length > 0 ? (
    <button
      ref={wsButtonRef}
      onClick={toggleWsMenu}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors min-h-[36px]"
      style={{ border: '1px solid var(--ap-border)', color: 'var(--ap-text-2)', backgroundColor: 'var(--ap-surface-2)' }}
      title="Selecionar workspace"
    >
      <span className="max-w-[140px] md:max-w-[200px] truncate font-medium">
        {workspace?.name || 'Workspace'}
      </span>
      {envInfo && <Badge variant={envInfo.variant}>{envInfo.label}</Badge>}
    </button>
  ) : null;

  // Menu do picker — renderizado via Portal para escapar do overflow: hidden
  // do AppShell. Posição fixed calculada em toggleWsMenu().
  const workspaceMenu = wsOpen && wsMenuPos && workspaces.length > 0 ? createPortal(
    <div
      id="ws-picker-menu"
      className="w-72 rounded-xl shadow-xl overflow-hidden"
      style={{
        position: 'fixed',
        top: wsMenuPos.top,
        left: wsMenuPos.left,
        zIndex: 1000,
        backgroundColor: 'var(--ap-surface)',
        border: '1px solid var(--ap-border)',
      }}
    >
      <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--ap-text-5)' }}>
        Workspaces
      </p>
      <div className="max-h-72 overflow-y-auto pb-2">
        {workspaces.map((w) => (
          <div key={w.id}>
            <button
              onClick={() => { selectWorkspace(w.id); setWsOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2"
              style={{
                color: w.id === workspace?.id ? 'var(--ap-accent)' : 'var(--ap-text-2)',
                backgroundColor: w.id === workspace?.id ? 'var(--ap-surface-3)' : 'transparent',
              }}
            >
              <span className="flex-1 truncate font-medium">{w.name}</span>
            </button>
            {w.id === workspace?.id && (w.environments || []).length > 0 && (
              <div className="pl-4 pr-3 pb-1 flex flex-wrap gap-1">
                {w.environments.map((e) => {
                  const info = ENV_BADGE[e.kind] || { label: e.name || e.kind, variant: 'gray' };
                  const on = e.id === environment?.id;
                  return (
                    <button
                      key={e.id}
                      onClick={() => { selectEnvironment(e.id); setWsOpen(false); }}
                      className="text-[11px] px-2 py-1 rounded-md transition-colors"
                      style={{
                        border: '1px solid var(--ap-border)',
                        backgroundColor: on ? 'var(--ap-surface-3)' : 'transparent',
                        color: on ? 'var(--ap-text-1)' : 'var(--ap-text-4)',
                        fontWeight: on ? 600 : 400,
                      }}
                    >
                      {info.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  ) : null;

  const userForShell = {
    name: user?.name || user?.email || 'Conta',
    initials: initialsOf(user?.name || user?.email),
    email: user?.email,
  };

  const userMenuItems = [
    { icon: 'user', label: 'Minha conta', onClick: () => navigate('/minha-conta') },
    { icon: 'lock', label: 'Trocar senha', onClick: () => navigate('/conta/senha') },
  ];

  const brand = (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-brand/15 flex items-center justify-center shrink-0">
        <span className="text-brand text-lg font-bold" aria-hidden>·</span>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold leading-tight truncate" style={{ color: 'var(--ap-text-1)' }}>IA Studio</p>
        <p className="text-[10px] leading-tight" style={{ color: 'var(--ap-text-5)' }}>Painel do Cliente</p>
      </div>
    </div>
  );

  return (
    <>
      <AppShell
        brand={brand}
        nav={nav}
        version={`v${typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'}`}
        breadcrumb={breadcrumb}
        topbarContext={topbarContext}
        user={userForShell}
        userMenuItems={userMenuItems}
        onNotifications={() => navigate('/automacao/notificacoes')}
        notifications={unread}
        customize
        onLogout={logout}
      >
        <Outlet />
      </AppShell>
      {workspaceMenu}
    </>
  );
}
