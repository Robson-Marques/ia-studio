// LEGADO (2026-07-24). Preservado para rollback. Reproduz exatamente a sidebar
// anterior — só se importa a partir de Layout.legacy.jsx.
import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import {
  LayoutDashboard, Settings, Users, ShieldCheck, Boxes, ScrollText,
  CreditCard, ChevronDown, Sparkles, Blocks, Plug, KeyRound,
  MessageCircle, FileText, Phone, ListOrdered, Workflow, GitBranch,
  CalendarClock, Activity, Zap, Bell,
  BrainCircuit, Bot, BookOpen, Brain, Wrench, DollarSign,
  Radio, Network, Database, Compass, Terminal, Code,
} from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';

const NAV = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  {
    label: 'IA Studio', icon: BrainCircuit,
    children: [
      { label: 'Assistentes',   icon: Bot,        path: '/ia/agentes',      perm: 'ai.agents.read' },
      { label: 'Conhecimento',  icon: BookOpen,   path: '/ia/conhecimento', perm: 'ai.knowledge.read' },
      { label: 'Memória',       icon: Brain,      path: '/ia/memoria',      perm: 'ai.memory.read' },
      { label: 'Habilidades',   icon: Wrench,     path: '/ia/ferramentas',  perm: 'ai.tools.read' },
      { label: 'Pendências',    icon: ShieldCheck, path: '/ia/aprovacoes',   perm: 'ai.approvals.read' },
      { label: 'Custos',        icon: DollarSign, path: '/ia/custos',       perm: 'ai.costs.read' },
    ],
  },
  {
    label: 'ISP (Provedores)', icon: Network,
    children: [
      { label: 'Incidentes', icon: Radio, path: '/isp/incidentes', perm: 'isp.incidents.read' },
      { label: 'Abertura de chamado', icon: Wrench, path: '/isp/abertura-chamado', perm: 'isp.incidents.read' },
    ],
  },
  {
    label: 'Automação', icon: Workflow,
    children: [
      { label: 'Fluxos',        icon: GitBranch,     path: '/automacao/fluxos',        perm: 'automation.workflows.read' },
      { label: 'Agendamentos',  icon: CalendarClock, path: '/automacao/agendamentos',  perm: 'automation.workflows.read' },
      { label: 'Execuções',     icon: Activity,      path: '/automacao/execucoes',     perm: 'automation.executions.read' },
      { label: 'Templates',     icon: FileText,      path: '/automacao/templates',     perm: 'automation.templates.read' },
      { label: 'Eventos',       icon: Zap,           path: '/automacao/eventos',       perm: 'automation.events.read' },
      { label: 'Notificações',  icon: Bell,          path: '/automacao/notificacoes',  perm: 'automation.notifications.read' },
    ],
  },
  {
    label: 'WhatsApp', icon: MessageCircle,
    children: [
      {
        label: 'Conversas', icon: MessageCircle, path: '/whatsapp/conversas',
        perm: ['comm.whatsapp.view.assigned', 'comm.whatsapp.view.unassigned', 'comm.whatsapp.view.team', 'comm.whatsapp.view.all'],
      },
      { label: 'Atendimento por IA', icon: Bot,      path: '/whatsapp/atendimento-ia', perm: 'automation.workflows.read' },
      { label: 'Templates',       icon: FileText,    path: '/whatsapp/templates', perm: 'comm.whatsapp.templates.read' },
      { label: 'Equipes e Filas', icon: ListOrdered, path: '/whatsapp/equipes',   perm: 'comm.whatsapp.teams.read' },
      { label: 'Números',         icon: Phone,       path: '/whatsapp/numeros',   perm: 'comm.whatsapp.numbers.read' },
    ],
  },
  {
    label: 'Integrações', icon: Plug,
    children: [
      { label: 'Marketplace',       icon: Blocks,  path: '/integracoes/marketplace', perm: 'integrations.marketplace.read' },
      { label: 'Conexões',          icon: Plug,    path: '/integracoes/conexoes',    perm: 'integrations.connections.read' },
      { label: 'Cofre de Segredos', icon: KeyRound, path: '/integracoes/segredos',   perm: 'integrations.secrets.read' },
    ],
  },
  {
    label: 'Recursos', icon: Database,
    children: [
      { label: 'Mapeamentos', icon: Boxes,   path: '/recursos/mapeamentos', perm: 'resource.mappings.read' },
      { label: 'Explorer',    icon: Compass, path: '/recursos/explorer',    perm: 'resource.explore.read' },
    ],
  },
  {
    label: 'Desenvolvedor', icon: Terminal,
    children: [
      { label: 'Console',   icon: Code,     path: '/desenvolvedor/console',  perm: 'devtools.use' },
      { label: 'API Keys',  icon: KeyRound, path: '/desenvolvedor/api-keys', perm: 'developer.apikeys.read' },
    ],
  },
  {
    label: 'Configurações', icon: Settings,
    children: [
      { label: 'Usuários e Convites',     icon: Users,       path: '/usuarios',    perm: 'core.users.read' },
      { label: 'Perfis de Acesso',        icon: ShieldCheck, path: '/perfis',      perm: 'core.profiles.read' },
      { label: 'Workspaces e Ambientes',  icon: Boxes,       path: '/workspaces',  perm: 'core.workspaces.read' },
      { label: 'Auditoria',               icon: ScrollText,  path: '/auditoria',   perm: 'core.audit.read' },
      { label: 'Minha Conta',             icon: CreditCard,  path: '/minha-conta' },
    ],
  },
];

export default function SidebarLegacy({ collapsed, mobileOpen, onCloseMobile }) {
  const { can } = usePermissions();
  const location = useLocation();
  const [openGroup, setOpenGroup] = useState(() => {
    const active = NAV.find((i) => i.children?.some((c) => location.pathname.startsWith(c.path)));
    return active ? active.label : null;
  });

  function toggleGroup(label) {
    setOpenGroup((prev) => (prev === label ? null : label));
  }

  const canAny = (perm) => !perm || (Array.isArray(perm) ? perm.some((p) => can(p)) : can(perm));

  const visible = NAV
    .map((item) => {
      if (!item.children) {
        return canAny(item.perm) ? item : null;
      }
      const children = item.children.filter((c) => canAny(c.perm));
      if (!children.length) return null;
      return { ...item, children };
    })
    .filter(Boolean);

  const content = (
    <div className="flex flex-col h-full">
      <div
        className="flex items-center gap-2.5 px-4 shrink-0"
        style={{
          borderBottom: '1px solid var(--ap-border)',
          paddingTop: 'calc(1rem + env(safe-area-inset-top))',
          paddingBottom: '1rem',
        }}
      >
        <div className="w-8 h-8 rounded-lg bg-brand/15 flex items-center justify-center shrink-0">
          <Sparkles size={18} className="text-brand" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight truncate" style={{ color: 'var(--ap-text-1)' }}>IA Studio</p>
            <p className="text-[10px] leading-tight" style={{ color: 'var(--ap-text-5)' }}>Painel do Cliente</p>
          </div>
        )}
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {visible.map((item) => {
          if (!item.children) {
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) => clsx('sidebar-item', isActive && 'active')}
                title={collapsed ? item.label : undefined}
              >
                <item.icon size={18} className="shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          }
          const open = openGroup === item.label;
          const groupActive = item.children.some((c) => location.pathname.startsWith(c.path));
          return (
            <div key={item.label}>
              <button
                type="button"
                onClick={() => toggleGroup(item.label)}
                className={clsx('sidebar-item w-full', groupActive && !open && 'active')}
                title={collapsed ? item.label : undefined}
              >
                <item.icon size={18} className="shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left truncate">{item.label}</span>
                    <ChevronDown size={14} className={clsx('transition-transform', open && 'rotate-180')} />
                  </>
                )}
              </button>
              {open && !collapsed && (
                <div className="mt-0.5 space-y-0.5">
                  {item.children.map((c) => (
                    <NavLink
                      key={c.path}
                      to={c.path}
                      className={({ isActive }) => clsx('sidebar-sub', isActive && 'active')}
                    >
                      <c.icon size={15} className="shrink-0" />
                      <span className="truncate">{c.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div
        className="px-4 py-3 shrink-0 text-[10px]"
        style={{
          borderTop: '1px solid var(--ap-border)',
          color: 'var(--ap-text-5)',
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
        }}
      >
        {!collapsed && <span>IA Studio v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'}</span>}
      </div>
    </div>
  );

  return (
    <>
      <aside
        className={clsx(
          'hidden md:flex flex-col shrink-0 transition-all duration-200',
          collapsed ? 'w-[68px]' : 'w-60',
        )}
        style={{ backgroundColor: 'var(--ap-sidebar)', borderRight: '1px solid var(--ap-border)' }}
      >
        {content}
      </aside>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[900]">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(2, 6, 23, 0.55)' }}
            onClick={onCloseMobile}
          />
          <aside
            className="absolute left-0 top-0 h-full w-72 max-w-[85vw] flex flex-col shadow-2xl"
            style={{ backgroundColor: 'var(--ap-sidebar)', borderRight: '1px solid var(--ap-border)' }}
          >
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
