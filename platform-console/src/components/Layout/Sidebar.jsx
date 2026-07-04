import React from 'react';
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import {
  Building2, CreditCard, Flag, Gauge, ScrollText, TerminalSquare, Blocks,
  LayoutDashboard, RefreshCw,
} from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';

// Sidebar do Console — SEMPRE escura (visual distinto do painel do cliente),
// independente do tema claro/escuro do conteudo.
const NAV = [
  { label: 'Dashboard',     icon: LayoutDashboard, path: '/dashboard', perm: 'console.usage.read' },
  { label: 'Clientes',      icon: Building2,  path: '/clientes',  perm: 'console.organizations.read' },
  { label: 'Planos',        icon: CreditCard, path: '/planos',    perm: 'console.plans.read' },
  { label: 'Marketplace',   icon: Blocks,     path: '/marketplace', perm: 'console.marketplace.read' },
  { label: 'Feature Flags', icon: Flag,       path: '/flags',     perm: 'console.flags.read' },
  { label: 'Consumo',       icon: Gauge,      path: '/consumo',   perm: 'console.usage.read' },
  { label: 'Auditoria',     icon: ScrollText, path: '/auditoria', perm: 'console.audit.read' },
  { label: 'Atualização',   icon: RefreshCw,  path: '/atualizacao', perm: 'system.upgrade' },
];

const DARK = {
  bg:      '#0b1120',
  border:  'rgba(51, 65, 85, 0.5)',
  text:    '#94a3b8',
  textDim: '#475569',
  title:   '#e2e8f0',
};

export default function Sidebar({ collapsed, mobileOpen, onCloseMobile }) {
  const { can } = usePermissions();
  const visible = NAV.filter((i) => !i.perm || can(i.perm));

  const content = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div
        className="flex items-center gap-2.5 px-4 shrink-0"
        style={{
          borderBottom: `1px solid ${DARK.border}`,
          paddingTop: 'calc(1rem + env(safe-area-inset-top))',
          paddingBottom: '1rem',
        }}
      >
        <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center shrink-0">
          <TerminalSquare size={18} className="text-brand-light" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight truncate" style={{ color: DARK.title }}>IA Studio</p>
            <p className="text-[10px] leading-tight" style={{ color: DARK.textDim }}>Console da Operação</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
        {visible.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer text-sm font-medium',
              isActive ? 'bg-brand/20 text-brand-light border border-brand/25' : 'hover:bg-white/5',
            )}
            style={({ isActive }) => (isActive ? undefined : { color: DARK.text })}
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Rodape */}
      <div
        className="px-4 py-3 shrink-0 text-[10px]"
        style={{
          borderTop: `1px solid ${DARK.border}`,
          color: DARK.textDim,
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
        }}
      >
        {!collapsed && <span>Console v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'}</span>}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside
        className={clsx(
          'hidden md:flex flex-col shrink-0 transition-all duration-200',
          collapsed ? 'w-[68px]' : 'w-60',
        )}
        style={{ backgroundColor: DARK.bg, borderRight: `1px solid ${DARK.border}` }}
      >
        {content}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-[900]">
          <div
            className="absolute inset-0"
            style={{ backgroundColor: 'rgba(2, 6, 23, 0.55)' }}
            onClick={onCloseMobile}
          />
          <aside
            className="absolute left-0 top-0 h-full w-72 max-w-[85vw] flex flex-col shadow-2xl"
            style={{ backgroundColor: DARK.bg, borderRight: `1px solid ${DARK.border}` }}
          >
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
