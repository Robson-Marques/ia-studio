import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AppShell, Badge, DSIcon, ConfirmDialog } from '@studio-ux-ds/react';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { usePermissions } from '../../hooks/usePermissions';
import { getNotificationsInbox } from '../../services/automation';

// Layout — casca principal do painel do cliente. Adota o AppShell do Studio UX
// (passo 2 da expansão de adoção, 2026-07-24). Substitui a dupla Sidebar+Header
// legada — que vive no histórico do git, não em arquivo `.legacy` ao lado.
// O piloto isolado /studio-ux-demo continua funcionando dentro desta
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
//   * Os ícones vêm todos do catálogo curado do DS (`DSIcon`), cada item do menu
//     declarando o seu glifo. Não há mais tradução "por proximidade" de outra
//     biblioteca — e desde a v0.10.22 nenhum arquivo do painel importa ícone de
//     fora: o catálogo cobre navegação, ação, dados, status e mídia/gravação.
//   * Multi-tenant branding não existe hoje na plataforma — quando existir, o
//     Customize/AppShell aceitará accent/tema por organização.


// Estrutura do menu. Cada item declara **o glifo do DS direto** (`icon`), não um
// nome de outra biblioteca traduzido por um mapa.
//
// O mapa `LUCIDE_TO_DS` que existia aqui era a causa do menu inteiro parecer
// igual: ele traduzia "por proximidade semântica" e, como o catálogo não tinha
// vocabulário de navegação, quase tudo caía em `file` ou `settings` — 12 e 9
// itens com o mesmo desenho, de 30. Indireção que degrada em silêncio é pior que
// nenhuma: ninguém escreveu "use uma folha de papel para Custos", o mapa decidiu.
//
// **Regra: um conceito de menu, um glifo.** As duas repetições que sobraram são
// deliberadas — `bot` em Assistentes e Atendimento por IA (é o mesmo assistente,
// visto de dois lugares) e `file` nos dois Templates (é o mesmo tipo de coisa).
// Qualquer outra repetição significa glifo faltando no DS, e o lugar de resolver
// é lá (o catálogo ganhou 26 na v1.2.39 por causa deste menu).
//
// Cada nível é `{ label, icon, path?, perm?, children? }`. `perm` string ou array (OR).
const NAV = [
  { label: 'Dashboard', icon: 'dashboard', path: '/' },
  {
    label: 'IA Studio', icon: 'spark',
    children: [
      { label: 'Assistentes',       icon: 'bot',          path: '/ia/agentes',              perm: 'ai.agents.read' },
      { label: 'Atendimento por IA', icon: 'bot',          path: '/whatsapp/atendimento-ia', perm: 'automation.workflows.read' },
      { label: 'Conhecimento',      icon: 'book',         path: '/ia/conhecimento',         perm: 'ai.knowledge.read' },
      { label: 'Pendências',     icon: 'check-circle', path: '/ia/aprovacoes',   perm: 'ai.approvals.read' },
      { label: 'Análise de atendimento', icon: 'search', path: '/ia/analise',    perm: 'ai.analysis.read' },
      { label: 'Custos',         icon: 'coin',         path: '/ia/custos',       perm: 'ai.costs.read' },
      { label: 'Ajustes gerais', icon: 'sliders',      path: '/ia/ajustes',      perm: ['ai.tools.read', 'ai.memory.read'] },
    ],
  },
  {
    label: 'ISP (Provedores)', icon: 'network',
    children: [
      { label: 'Incidentes',          icon: 'radio',  path: '/isp/incidentes',       perm: 'isp.incidents.read' },
      { label: 'Abertura de chamado', icon: 'ticket', path: '/isp/abertura-chamado', perm: 'isp.incidents.read' },
    ],
  },
  {
    label: 'Automação', icon: 'workflow',
    children: [
      { label: 'Fluxos',        icon: 'git-branch', path: '/automacao/fluxos',        perm: 'automation.workflows.read' },
      { label: 'Agendamentos',  icon: 'calendar',   path: '/automacao/agendamentos',  perm: 'automation.workflows.read' },
      { label: 'Templates',     icon: 'file',       path: '/automacao/templates',     perm: 'automation.templates.read' },
      { label: 'Monitoramento', icon: 'activity',   path: '/automacao/monitoramento', perm: ['automation.executions.read', 'automation.events.read', 'automation.notifications.read'] },
    ],
  },
  {
    label: 'WhatsApp', icon: 'message',
    children: [
      {
        label: 'Conversas', icon: 'messages', path: '/whatsapp/conversas',
        perm: ['comm.whatsapp.view.assigned', 'comm.whatsapp.view.unassigned', 'comm.whatsapp.view.team', 'comm.whatsapp.view.all'],
      },
      { label: 'Templates',       icon: 'file',    path: '/whatsapp/templates', perm: 'comm.whatsapp.templates.read' },
      { label: 'Equipes e Filas', icon: 'list',    path: '/whatsapp/equipes',   perm: 'comm.whatsapp.teams.read' },
      { label: 'Números',         icon: 'phone',   path: '/whatsapp/numeros',   perm: 'comm.whatsapp.numbers.read' },
    ],
  },
  {
    label: 'Integrações', icon: 'grid',
    children: [
      { label: 'Marketplace',       icon: 'store', path: '/integracoes/marketplace', perm: 'integrations.marketplace.read' },
      { label: 'Conexões',          icon: 'plug',  path: '/integracoes/conexoes',    perm: 'integrations.connections.read' },
      { label: 'Cofre de segredos', icon: 'lock',  path: '/integracoes/segredos',    perm: 'integrations.secrets.read' },
    ],
  },
  {
    label: 'Recursos', icon: 'database',
    children: [
      { label: 'Mapeamentos', icon: 'layers',  path: '/recursos/mapeamentos', perm: 'resource.mappings.read' },
      { label: 'Explorador',  icon: 'compass', path: '/recursos/explorer',    perm: 'resource.explore.read' },
    ],
  },
  {
    label: 'Desenvolvedor', icon: 'terminal',
    children: [
      { label: 'Bancada de testes', icon: 'code', path: '/desenvolvedor/console',  perm: 'devtools.use' },
      { label: 'Chaves de API',     icon: 'key',  path: '/desenvolvedor/api-keys', perm: 'developer.apikeys.read' },
    ],
  },
  {
    label: 'Configurações', icon: 'settings',
    children: [
      { label: 'Pessoas e convites',      icon: 'users',       path: '/usuarios',    perm: 'core.users.read' },
      { label: 'Perfis de acesso',        icon: 'shield',      path: '/perfis',      perm: 'core.profiles.read' },
      { label: 'Workspaces e ambientes',  icon: 'boxes',       path: '/workspaces',  perm: 'core.workspaces.read' },
      { label: 'Auditoria',               icon: 'history',     path: '/auditoria',   perm: 'core.audit.read' },
      { label: 'Minha conta',             icon: 'credit-card', path: '/minha-conta' },
    ],
  },
];


// Mapa estático de breadcrumbs — reflete o legado; nova rota adiciona entrada aqui.
const BREADCRUMBS = {
  '/':            'Dashboard',
  '/usuarios':    'Configurações / Pessoas e convites',
  '/perfis':      'Configurações / Perfis de acesso',
  '/workspaces':  'Configurações / Workspaces e ambientes',
  '/auditoria':   'Configurações / Auditoria',
  '/minha-conta': 'Configurações / Minha conta',
  '/conta/senha': 'Configurações / Trocar senha',
  '/integracoes/marketplace': 'Integrações / Marketplace',
  '/integracoes/conexoes':    'Integrações / Conexões',
  '/integracoes/segredos':    'Integrações / Cofre de segredos',
  '/whatsapp/conversas': 'WhatsApp / Conversas',
  '/whatsapp/templates': 'WhatsApp / Templates',
  '/whatsapp/equipes':   'WhatsApp / Equipes e Filas',
  '/whatsapp/numeros':   'WhatsApp / Números',
  '/isp/abertura-chamado': 'ISP / Abertura de chamado',
  '/isp/incidentes':       'ISP / Incidentes',
  '/whatsapp/atendimento-ia': 'IA Studio / Atendimento por IA',
  '/automacao/fluxos':         'Automação / Fluxos',
  '/automacao/agendamentos':   'Automação / Agendamentos',
  '/automacao/templates':      'Automação / Templates',
  '/automacao/monitoramento':  'Automação / Monitoramento',
  '/ia/agentes':      'IA Studio / Assistentes',
  '/ia/conhecimento': 'IA Studio / Conhecimento',
  '/ia/aprovacoes':   'IA Studio / Pendências',
  '/ia/analise':      'IA Studio / Análise de atendimento',
  '/ia/custos':       'IA Studio / Custos',
  '/ia/ajustes':      'IA Studio / Ajustes gerais',
  '/recursos/mapeamentos':  'Recursos / Mapeamentos',
  '/recursos/explorer':     'Recursos / Explorador',
  '/desenvolvedor/console': 'Desenvolvedor / Bancada de testes',
  '/desenvolvedor/api-keys':'Desenvolvedor / Chaves de API',
  '/studio-ux-demo':        'Studio UX (piloto)',
};

// Rotas com parâmetro (:id) não cabem no mapa estático acima. Lista ordenada de
// padrões — o PRIMEIRO que casar ganha, então padrões mais específicos vêm
// antes. Substituiu os ternários encadeados que estavam crescendo aqui.
const BREADCRUMB_PATTERNS = [
  [/^\/ia\/ferramentas\/tool\/nova$/,              'IA Studio / Habilidades / Nova'],
  [/^\/ia\/ferramentas\/tool\/[^/]+\/editar$/,     'IA Studio / Habilidades / Editar'],
  [/^\/ia\/memoria\/perfis\/nova$/,                'IA Studio / Memória / Novo perfil'],
  [/^\/ia\/memoria\/perfis\/[^/]+\/editar$/,       'IA Studio / Memória / Editar perfil'],
  [/^\/ia\/memoria\/[^/]+$/,                       'IA Studio / Memória / Entradas'],
  [/^\/ia\/aprovacoes\/politicas\/nova$/,          'IA Studio / Pendências / Nova política'],
  [/^\/ia\/aprovacoes\/[^/]+$/,                    'IA Studio / Pendências / Detalhe'],
  [/^\/isp\/incidentes\/novo$/,                    'ISP / Incidentes / Novo'],
  [/^\/isp\/incidentes\/[^/]+$/,                   'ISP / Incidentes / Detalhe'],
  [/^\/ia\/agentes\/nova$/,                        'IA Studio / Assistentes / Novo'],
  [/^\/ia\/agentes\/importar$/,                    'IA Studio / Assistentes / Importar'],
  [/^\/ia\/agentes\/[^/]+$/,                       'IA Studio / Assistentes / Editar'],
  [/^\/ia\/conhecimento\/nova$/,                   'IA Studio / Conhecimento / Nova base'],
  [/^\/ia\/conhecimento\/[^/]+\/documentos\/novo$/,'IA Studio / Conhecimento / Novo documento'],
  [/^\/ia\/conhecimento\/[^/]+$/,                  'IA Studio / Conhecimento / Base'],
  [/^\/perfis\/novo$/,                            'Configurações / Perfis de acesso / Novo'],
  [/^\/perfis\/[^/]+$/,                           'Configurações / Perfis de acesso / Detalhe'],
  [/^\/recursos\/mapeamentos\/novo$/,              'Recursos / Mapeamentos / Novo'],
  [/^\/recursos\/mapeamentos\/[^/]+$/,             'Recursos / Mapeamentos / Editar'],
  [/^\/integracoes\/conexoes\/nova$/,              'Integrações / Conexões / Nova'],
  [/^\/integracoes\/conexoes\/[^/]+\/editar$/,     'Integrações / Conexões / Editar'],
  [/^\/integracoes\/conexoes\/[^/]+$/,             'Integrações / Conexões / Detalhe'],
  [/^\/whatsapp\/templates\/novo$/,                'WhatsApp / Templates / Novo'],
  [/^\/whatsapp\/equipes\/nova$/,                  'WhatsApp / Equipes e Filas / Nova equipe'],
  [/^\/whatsapp\/equipes\/[^/]+$/,                 'WhatsApp / Equipes e Filas / Equipe'],
  [/^\/whatsapp\/filas\/nova$/,                    'WhatsApp / Equipes e Filas / Nova fila'],
  [/^\/whatsapp\/filas\/[^/]+$/,                   'WhatsApp / Equipes e Filas / Fila'],
  [/^\/automacao\/fluxos\/novo$/,                  'Automação / Fluxos / Novo'],
  [/^\/automacao\/fluxos\/importar$/,              'Automação / Fluxos / Importar'],
  [/^\/automacao\/fluxos\/[^/]+\/lista$/,          'Automação / Fluxos / Passos'],
  [/^\/automacao\/fluxos\/[^/]+/,                  'Automação / Fluxos / Editor'],
  [/^\/automacao\/execucoes\/[^/]+$/,              'Automação / Execuções / Detalhe'],
  [/^\/automacao\/calendarios\/novo$/,             'Automação / Agendamentos / Novo calendário'],
  [/^\/automacao\/calendarios\/[^/]+$/,            'Automação / Agendamentos / Calendário'],
  [/^\/automacao\/templates\/novo$/,               'Automação / Templates / Novo'],
  [/^\/automacao\/templates\/[^/]+$/,              'Automação / Templates / Editar'],
];

function resolveCrumb(pathname) {
  if (BREADCRUMBS[pathname]) return BREADCRUMBS[pathname];
  const hit = BREADCRUMB_PATTERNS.find(([re]) => re.test(pathname));
  return hit ? hit[1] : 'IA Studio';
}

/**
 * Monta o breadcrumb NAVEGÁVEL: `[{ label, href? }]`.
 *
 * Até a v0.10.2 os itens iam sem `href`, e o `Breadcrumb` do DS só vira link
 * quando tem `href` — ou seja, o caminho no topo era **texto decorativo**. Isso
 * passou despercebido porque toda tela tinha um botão "Voltar" próprio; quando
 * uma passou a confiar no breadcrumb (o editor de passos, v0.10.2), a tela ficou
 * sem saída nenhuma.
 *
 * Como o `href` é descoberto: para cada item que não é o último, procura-se — do
 * prefixo mais longo do pathname para o mais curto — aquele cujo crumb resolvido
 * seja exatamente o caminho até aquele item. Assim o link sai do MESMO mapa que
 * escreve o rótulo, sem uma segunda tabela de path para manter em sincronia (que
 * divergiria na primeira rota nova).
 *
 * O último item nunca é link: é a página onde já se está.
 */
// Rotas que recebem a área de conteúdo inteira (sem padding, sem rolagem de
// página). Lista curta e deliberada: o padrão é a tela viver com o espaçamento da
// casca, e a exceção precisa de motivo — rolagem interna própria em mais de uma
// coluna. Hoje só a conversa do WhatsApp; o canvas de fluxo é candidato, mas ele
// já resolve a altura por conta e entra em outra frente.
const FULL_BLEED_PATHS = ['/whatsapp/conversas'];

function buildBreadcrumb(pathname) {
  const labels = resolveCrumb(pathname).split(' / ');
  const segs = pathname.split('/').filter(Boolean);
  const prefixes = segs.map((_, i) => `/${segs.slice(0, i + 1).join('/')}`);

  return labels.map((label, i) => {
    if (i === labels.length - 1) return { label };
    const alvo = labels.slice(0, i + 1).join(' / ');
    for (let p = prefixes.length - 1; p >= 0; p -= 1) {
      if (prefixes[p] === pathname) continue;
      if (resolveCrumb(prefixes[p]) === alvo) return { label, href: prefixes[p] };
    }
    return { label };
  });
}

// `tone` direto (papel semântico do DS), não nome de cor: é o mesmo caminho de
// saída da ponte `lib/tone.js` que as telas já seguem.
const ENV_BADGE = {
  PRODUCTION:  { label: 'Produção',        tone: 'success' },
  STAGING:     { label: 'Homologação',     tone: 'warning' },
  DEVELOPMENT: { label: 'Desenvolvimento', tone: 'info' },
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
  const [confirmarSaida, setConfirmarSaida] = useState(false);
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
            icon: item.icon,
            label: item.label,
            href: item.path,
            active: item.path === '/' ? location.pathname === '/' : location.pathname.startsWith(item.path),
            onClick: (e) => { e?.preventDefault?.(); navigate(item.path); },
          };
        }
        const children = item.children
          .filter((c) => canAny(c.perm))
          .map((c) => ({
            icon: c.icon,
            label: c.label,
            href: c.path,
            active: location.pathname.startsWith(c.path),
            onClick: (e) => { e?.preventDefault?.(); navigate(c.path); },
          }));
        if (!children.length) return null;
        return {
          group: item.label,
          icon: item.icon,
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

  const breadcrumb = buildBreadcrumb(location.pathname);

  const envInfo = environment
    ? (ENV_BADGE[environment.kind] || { label: environment.name || environment.kind, tone: 'neutral' })
    : null;

  // Workspace picker + badge de ambiente — vive no topbarContext do AppShell.
  // O menu abre via Portal (fora do container com overflow: hidden do AppShell).
  const topbarContext = workspaces.length > 0 ? (
    <button
      ref={wsButtonRef}
      onClick={toggleWsMenu}
      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm transition-colors min-h-[36px]"
      style={{ border: '1px solid var(--su-border-default)', color: 'var(--su-text-secondary)', backgroundColor: 'var(--su-surface-sunken)' }}
      title="Selecionar workspace"
    >
      <span className="max-w-[140px] md:max-w-[200px] truncate font-medium">
        {workspace?.name || 'Workspace'}
      </span>
      {envInfo && <Badge tone={envInfo.tone}>{envInfo.label}</Badge>}
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
        backgroundColor: 'var(--su-surface-raised)',
        border: '1px solid var(--su-border-default)',
      }}
    >
      <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--su-text-muted)' }}>
        Workspaces
      </p>
      <div className="max-h-72 overflow-y-auto pb-2">
        {workspaces.map((w) => (
          <div key={w.id}>
            <button
              onClick={() => { selectWorkspace(w.id); setWsOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2"
              style={{
                color: w.id === workspace?.id ? 'var(--su-action)' : 'var(--su-text-secondary)',
                backgroundColor: w.id === workspace?.id ? 'var(--su-surface-sunken)' : 'transparent',
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
                        border: '1px solid var(--su-border-default)',
                        backgroundColor: on ? 'var(--su-surface-sunken)' : 'transparent',
                        color: on ? 'var(--su-text-primary)' : 'var(--su-text-muted)',
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

  // A marca é o **mesmo símbolo do favicon** (a faísca de 4 pontas), agora como
  // glifo do DS (`spark`, v1.2.39) — então ela herda o accent do tema em vez de
  // carregar um hex. Até aqui havia TRÊS representações diferentes do produto: um
  // `·` (ponto tipográfico) aqui, um raio no login e a faísca no favicon. Marca é
  // uma coisa, em um lugar: quem mudar, muda nos três.
  const brand = (
    <div className="flex items-center gap-2.5">
      <div
        className="flex items-center justify-center shrink-0"
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: 'var(--su-action-tint)', color: 'var(--su-action)',
        }}
      >
        <DSIcon name="spark" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold leading-tight truncate" style={{ color: 'var(--su-text-primary)' }}>IA Studio</p>
        <p className="text-[10px] leading-tight" style={{ color: 'var(--su-text-muted)' }}>Painel do Cliente</p>
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
        // Sem isto o clique no caminho recarregaria a aplicação inteira (o
        // Breadcrumb do DS usa <a href> de verdade, de propósito — ctrl+clique
        // abre em outra aba). Aqui o clique simples vira navegação do router.
        onBreadcrumbNavigate={(href) => navigate(href)}
        // Telas de trabalho contínuo recebem a área de conteúdo inteira, sem
        // espaçamento e sem rolagem de página: a conversa tem rolagem própria em
        // duas colunas e precisa da altura toda. Antes disso a tela calculava
        // `100dvh - 8.5rem` à mão — número que erra sempre que a barra de cima
        // muda de altura, e erra diferente no mobile.
        fullBleed={FULL_BLEED_PATHS.some((p) => location.pathname.startsWith(p))}
        topbarContext={topbarContext}
        user={userForShell}
        userMenuItems={userMenuItems}
        onNotifications={() => navigate('/automacao/monitoramento?tab=notificacoes')}
        notifications={unread}
        customize
        onLogout={() => setConfirmarSaida(true)}
      >
        <Outlet />
      </AppShell>
      {workspaceMenu}

      {/* Sair encerra a sessão de verdade — e vivia num item de menu que fecha no
          clique, ao lado de "Minha conta" e "Trocar senha". Um clique errado
          derrubava a sessão de quem estava no meio de um cadastro. Confirmar é o
          mínimo (é a mesma régua das outras ações que perdem trabalho). */}
      <ConfirmDialog
        open={confirmarSaida}
        title="Sair do sistema"
        message="Você vai precisar entrar de novo com e-mail e senha. Se estava preenchendo alguma coisa, o que não foi salvo se perde."
        confirmLabel="Sair"
        onClose={() => setConfirmarSaida(false)}
        onConfirm={logout}
      />
    </>
  );
}
