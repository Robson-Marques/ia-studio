// Catalogo UNICO de permissoes granulares (`dominio.acao`) da Fase 1.
// Regra: perm nova exige constante aqui + grupo + label no front + perfis
// de sistema atualizados (SYSTEM_PROFILES). Administrador herda tudo via
// ALL_PERMISSIONS automaticamente.
//
// Ator de plataforma (is_platform_admin) tem bypass total no PermissionsGuard —
// este catalogo governa apenas usuarios de organization.

export const PERMISSIONS = {
  // ─── Usuarios e acessos ─────────────────────────────
  CORE_USERS_READ: 'core.users.read',
  CORE_USERS_WRITE: 'core.users.write',
  CORE_USERS_INACTIVATE: 'core.users.inactivate',
  CORE_INVITES_READ: 'core.invites.read',
  CORE_INVITES_WRITE: 'core.invites.write',
  CORE_PROFILES_READ: 'core.profiles.read',
  CORE_PROFILES_WRITE: 'core.profiles.write',

  // ─── Workspaces e ambientes ─────────────────────────
  CORE_WORKSPACES_READ: 'core.workspaces.read',
  CORE_WORKSPACES_WRITE: 'core.workspaces.write',
  CORE_ENVIRONMENTS_READ: 'core.environments.read',
  CORE_ENVIRONMENTS_WRITE: 'core.environments.write',

  // ─── Auditoria / Configuracoes ──────────────────────
  CORE_AUDIT_READ: 'core.audit.read',
  CORE_SETTINGS_READ: 'core.settings.read',
  CORE_SETTINGS_WRITE: 'core.settings.write',

  // ─── Minha Conta (diretriz 42) ──────────────────────
  ACCOUNT_READ: 'account.read',
  LICENSE_READ: 'license.read',

  // ─── Integrações (Fase 2 — Integration Manager) ─────
  INTEGRATIONS_MARKETPLACE_READ: 'integrations.marketplace.read',
  INTEGRATIONS_MARKETPLACE_MANAGE: 'integrations.marketplace.manage',
  INTEGRATIONS_CONNECTIONS_READ: 'integrations.connections.read',
  INTEGRATIONS_CONNECTIONS_WRITE: 'integrations.connections.write',
  INTEGRATIONS_CONNECTIONS_EXECUTE: 'integrations.connections.execute',
  INTEGRATIONS_SECRETS_READ: 'integrations.secrets.read',
  INTEGRATIONS_SECRETS_MANAGE: 'integrations.secrets.manage',
  INTEGRATIONS_LOGS_READ: 'integrations.logs.read',

  // ─── WhatsApp (Fase 3 — Communication Platform) ─────
  COMM_WHATSAPP_VIEW_ASSIGNED: 'comm.whatsapp.view.assigned',
  COMM_WHATSAPP_VIEW_UNASSIGNED: 'comm.whatsapp.view.unassigned',
  COMM_WHATSAPP_VIEW_TEAM: 'comm.whatsapp.view.team',
  COMM_WHATSAPP_VIEW_ALL: 'comm.whatsapp.view.all',
  COMM_WHATSAPP_REPLY_ASSIGNED: 'comm.whatsapp.reply.assigned',
  COMM_WHATSAPP_REPLY_TEAM: 'comm.whatsapp.reply.team',
  COMM_WHATSAPP_REPLY_ALL: 'comm.whatsapp.reply.all',
  COMM_WHATSAPP_CLAIM: 'comm.whatsapp.claim',
  COMM_WHATSAPP_TRANSFER: 'comm.whatsapp.transfer',
  COMM_WHATSAPP_CLOSE: 'comm.whatsapp.close',
  COMM_WHATSAPP_TEAMS_READ: 'comm.whatsapp.teams.read',
  COMM_WHATSAPP_TEAMS_MANAGE: 'comm.whatsapp.teams.manage',
  COMM_WHATSAPP_QUEUES_READ: 'comm.whatsapp.queues.read',
  COMM_WHATSAPP_QUEUES_MANAGE: 'comm.whatsapp.queues.manage',
  COMM_WHATSAPP_TEMPLATES_READ: 'comm.whatsapp.templates.read',
  COMM_WHATSAPP_TEMPLATES_MANAGE: 'comm.whatsapp.templates.manage',
  COMM_WHATSAPP_NUMBERS_READ: 'comm.whatsapp.numbers.read',

  // ─── Automação (Fase 4 — Automation Platform) ───────
  AUTOMATION_WORKFLOWS_READ: 'automation.workflows.read',
  AUTOMATION_WORKFLOWS_WRITE: 'automation.workflows.write',
  AUTOMATION_WORKFLOWS_PUBLISH: 'automation.workflows.publish',
  AUTOMATION_WORKFLOWS_EXECUTE: 'automation.workflows.execute',
  AUTOMATION_EXECUTIONS_READ: 'automation.executions.read',
  AUTOMATION_EXECUTIONS_RETRY: 'automation.executions.retry',
  AUTOMATION_TEMPLATES_READ: 'automation.templates.read',
  AUTOMATION_TEMPLATES_WRITE: 'automation.templates.write',
  AUTOMATION_CALENDARS_MANAGE: 'automation.calendars.manage',
  AUTOMATION_EVENTS_READ: 'automation.events.read',
  AUTOMATION_EVENTS_RETRY: 'automation.events.retry',
  AUTOMATION_NOTIFICATIONS_READ: 'automation.notifications.read',

  // ─── IA (Fase 5 — AI Platform + Studio) ─────────────
  AI_AGENTS_READ: 'ai.agents.read',
  AI_AGENTS_WRITE: 'ai.agents.write',
  AI_AGENTS_PUBLISH: 'ai.agents.publish',
  AI_AGENTS_EXECUTE: 'ai.agents.execute',
  // Conceder à IA ferramentas que GRAVAM dados (abrir OS, desbloquear...).
  // Anti-escalada: só quem tem esta perm marca uma ferramenta "grava dados".
  AI_AGENTS_ACTIONS: 'ai.agents.actions',
  AI_KNOWLEDGE_READ: 'ai.knowledge.read',
  AI_KNOWLEDGE_WRITE: 'ai.knowledge.write',
  AI_MEMORY_READ: 'ai.memory.read',
  AI_MEMORY_WRITE: 'ai.memory.write',
  AI_TOOLS_READ: 'ai.tools.read',
  AI_TOOLS_WRITE: 'ai.tools.write',
  AI_APPROVALS_READ: 'ai.approvals.read',
  AI_APPROVALS_DECIDE: 'ai.approvals.decide',
  AI_COSTS_READ: 'ai.costs.read',
  AI_COSTS_MANAGE: 'ai.costs.manage',
  AI_MCP_READ: 'ai.mcp.read',
  AI_MCP_WRITE: 'ai.mcp.write',
  AI_PROVIDERS_READ: 'ai.providers.read',

  // ─── ISP (Fase 6 — Solução Altarede / Manutenção) ───
  ISP_INCIDENTS_READ: 'isp.incidents.read',
  ISP_INCIDENTS_WRITE: 'isp.incidents.write',
  ISP_INCIDENTS_ACTIVATE: 'isp.incidents.activate',
  ISP_INCIDENTS_DISPATCH: 'isp.incidents.dispatch',
  ISP_TOOLS_USE: 'isp.tools.use',

  // ─── Recursos (Fase 7 — Resource Model/Mapper/Explorer) ─────
  RESOURCE_MAPPINGS_READ: 'resource.mappings.read',
  RESOURCE_MAPPINGS_WRITE: 'resource.mappings.write',
  RESOURCE_EXPLORE_READ: 'resource.explore.read',
  RESOURCE_MAPPER_SUGGEST: 'resource.mapper.suggest',

  // ─── Desenvolvedor (Fase 7 — DevTools + Developer Center) ───
  DEVTOOLS_USE: 'devtools.use',
  DEVELOPER_APIKEYS_READ: 'developer.apikeys.read',
  DEVELOPER_APIKEYS_MANAGE: 'developer.apikeys.manage',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: string[] = Object.values(PERMISSIONS);

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: string[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: 'users_access',
    label: 'Usuários e Acessos',
    permissions: [
      PERMISSIONS.CORE_USERS_READ,
      PERMISSIONS.CORE_USERS_WRITE,
      PERMISSIONS.CORE_USERS_INACTIVATE,
      PERMISSIONS.CORE_INVITES_READ,
      PERMISSIONS.CORE_INVITES_WRITE,
      PERMISSIONS.CORE_PROFILES_READ,
      PERMISSIONS.CORE_PROFILES_WRITE,
    ],
  },
  {
    key: 'workspaces',
    label: 'Workspaces e Ambientes',
    permissions: [
      PERMISSIONS.CORE_WORKSPACES_READ,
      PERMISSIONS.CORE_WORKSPACES_WRITE,
      PERMISSIONS.CORE_ENVIRONMENTS_READ,
      PERMISSIONS.CORE_ENVIRONMENTS_WRITE,
    ],
  },
  {
    key: 'governance',
    label: 'Auditoria e Configurações',
    permissions: [
      PERMISSIONS.CORE_AUDIT_READ,
      PERMISSIONS.CORE_SETTINGS_READ,
      PERMISSIONS.CORE_SETTINGS_WRITE,
    ],
  },
  {
    key: 'account',
    label: 'Minha Conta',
    permissions: [PERMISSIONS.ACCOUNT_READ, PERMISSIONS.LICENSE_READ],
  },
  {
    key: 'integrations',
    label: 'Integrações',
    permissions: [
      PERMISSIONS.INTEGRATIONS_MARKETPLACE_READ,
      PERMISSIONS.INTEGRATIONS_MARKETPLACE_MANAGE,
      PERMISSIONS.INTEGRATIONS_CONNECTIONS_READ,
      PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE,
      PERMISSIONS.INTEGRATIONS_CONNECTIONS_EXECUTE,
      PERMISSIONS.INTEGRATIONS_SECRETS_READ,
      PERMISSIONS.INTEGRATIONS_SECRETS_MANAGE,
      PERMISSIONS.INTEGRATIONS_LOGS_READ,
    ],
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    permissions: [
      PERMISSIONS.COMM_WHATSAPP_VIEW_ASSIGNED,
      PERMISSIONS.COMM_WHATSAPP_VIEW_UNASSIGNED,
      PERMISSIONS.COMM_WHATSAPP_VIEW_TEAM,
      PERMISSIONS.COMM_WHATSAPP_VIEW_ALL,
      PERMISSIONS.COMM_WHATSAPP_REPLY_ASSIGNED,
      PERMISSIONS.COMM_WHATSAPP_REPLY_TEAM,
      PERMISSIONS.COMM_WHATSAPP_REPLY_ALL,
      PERMISSIONS.COMM_WHATSAPP_CLAIM,
      PERMISSIONS.COMM_WHATSAPP_TRANSFER,
      PERMISSIONS.COMM_WHATSAPP_CLOSE,
      PERMISSIONS.COMM_WHATSAPP_TEAMS_READ,
      PERMISSIONS.COMM_WHATSAPP_TEAMS_MANAGE,
      PERMISSIONS.COMM_WHATSAPP_QUEUES_READ,
      PERMISSIONS.COMM_WHATSAPP_QUEUES_MANAGE,
      PERMISSIONS.COMM_WHATSAPP_TEMPLATES_READ,
      PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE,
      PERMISSIONS.COMM_WHATSAPP_NUMBERS_READ,
    ],
  },
  {
    key: 'automation',
    label: 'Automação',
    permissions: [
      PERMISSIONS.AUTOMATION_WORKFLOWS_READ,
      PERMISSIONS.AUTOMATION_WORKFLOWS_WRITE,
      PERMISSIONS.AUTOMATION_WORKFLOWS_PUBLISH,
      PERMISSIONS.AUTOMATION_WORKFLOWS_EXECUTE,
      PERMISSIONS.AUTOMATION_EXECUTIONS_READ,
      PERMISSIONS.AUTOMATION_EXECUTIONS_RETRY,
      PERMISSIONS.AUTOMATION_TEMPLATES_READ,
      PERMISSIONS.AUTOMATION_TEMPLATES_WRITE,
      PERMISSIONS.AUTOMATION_CALENDARS_MANAGE,
      PERMISSIONS.AUTOMATION_EVENTS_READ,
      PERMISSIONS.AUTOMATION_EVENTS_RETRY,
      PERMISSIONS.AUTOMATION_NOTIFICATIONS_READ,
    ],
  },
  {
    key: 'ai',
    label: 'IA',
    permissions: [
      PERMISSIONS.AI_AGENTS_READ,
      PERMISSIONS.AI_AGENTS_WRITE,
      PERMISSIONS.AI_AGENTS_PUBLISH,
      PERMISSIONS.AI_AGENTS_EXECUTE,
      PERMISSIONS.AI_AGENTS_ACTIONS,
      PERMISSIONS.AI_KNOWLEDGE_READ,
      PERMISSIONS.AI_KNOWLEDGE_WRITE,
      PERMISSIONS.AI_MEMORY_READ,
      PERMISSIONS.AI_MEMORY_WRITE,
      PERMISSIONS.AI_TOOLS_READ,
      PERMISSIONS.AI_TOOLS_WRITE,
      PERMISSIONS.AI_APPROVALS_READ,
      PERMISSIONS.AI_APPROVALS_DECIDE,
      PERMISSIONS.AI_COSTS_READ,
      PERMISSIONS.AI_COSTS_MANAGE,
      PERMISSIONS.AI_MCP_READ,
      PERMISSIONS.AI_MCP_WRITE,
      PERMISSIONS.AI_PROVIDERS_READ,
    ],
  },
  {
    key: 'isp',
    label: 'ISP (Provedores)',
    permissions: [
      PERMISSIONS.ISP_INCIDENTS_READ,
      PERMISSIONS.ISP_INCIDENTS_WRITE,
      PERMISSIONS.ISP_INCIDENTS_ACTIVATE,
      PERMISSIONS.ISP_INCIDENTS_DISPATCH,
      PERMISSIONS.ISP_TOOLS_USE,
    ],
  },
  {
    key: 'resources',
    label: 'Recursos',
    permissions: [
      PERMISSIONS.RESOURCE_MAPPINGS_READ,
      PERMISSIONS.RESOURCE_MAPPINGS_WRITE,
      PERMISSIONS.RESOURCE_EXPLORE_READ,
      PERMISSIONS.RESOURCE_MAPPER_SUGGEST,
    ],
  },
  {
    key: 'developer',
    label: 'Desenvolvedor',
    permissions: [
      PERMISSIONS.DEVTOOLS_USE,
      PERMISSIONS.DEVELOPER_APIKEYS_READ,
      PERMISSIONS.DEVELOPER_APIKEYS_MANAGE,
    ],
  },
];

// Labels pt-BR do catalogo (expostos em GET /profiles/permissions-catalog —
// o front nao precisa duplicar o mapa).
export const PERMISSION_LABELS: Record<string, string> = {
  [PERMISSIONS.CORE_USERS_READ]: 'Ver usuários',
  [PERMISSIONS.CORE_USERS_WRITE]: 'Criar/editar usuários',
  [PERMISSIONS.CORE_USERS_INACTIVATE]: 'Inativar usuários',
  [PERMISSIONS.CORE_INVITES_READ]: 'Ver convites',
  [PERMISSIONS.CORE_INVITES_WRITE]: 'Criar/revogar convites',
  [PERMISSIONS.CORE_PROFILES_READ]: 'Ver perfis de acesso',
  [PERMISSIONS.CORE_PROFILES_WRITE]: 'Criar/editar perfis de acesso',
  [PERMISSIONS.CORE_WORKSPACES_READ]: 'Ver workspaces',
  [PERMISSIONS.CORE_WORKSPACES_WRITE]: 'Criar/editar workspaces',
  [PERMISSIONS.CORE_ENVIRONMENTS_READ]: 'Ver ambientes',
  [PERMISSIONS.CORE_ENVIRONMENTS_WRITE]: 'Criar/editar ambientes',
  [PERMISSIONS.CORE_AUDIT_READ]: 'Ver trilha de auditoria',
  [PERMISSIONS.CORE_SETTINGS_READ]: 'Ver configurações',
  [PERMISSIONS.CORE_SETTINGS_WRITE]: 'Alterar configurações',
  [PERMISSIONS.ACCOUNT_READ]: 'Ver Minha Conta',
  [PERMISSIONS.LICENSE_READ]: 'Ver licença e consumo',
  [PERMISSIONS.INTEGRATIONS_MARKETPLACE_READ]: 'Ver marketplace de conectores',
  [PERMISSIONS.INTEGRATIONS_MARKETPLACE_MANAGE]: 'Instalar/desinstalar conectores',
  [PERMISSIONS.INTEGRATIONS_CONNECTIONS_READ]: 'Ver conexões',
  [PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE]: 'Criar/gerenciar conexões',
  [PERMISSIONS.INTEGRATIONS_CONNECTIONS_EXECUTE]: 'Executar operações em conexões',
  [PERMISSIONS.INTEGRATIONS_SECRETS_READ]: 'Ver cofre de segredos (metadados)',
  [PERMISSIONS.INTEGRATIONS_SECRETS_MANAGE]: 'Rotacionar/gerenciar segredos',
  [PERMISSIONS.INTEGRATIONS_LOGS_READ]: 'Ver logs de integração',
  [PERMISSIONS.COMM_WHATSAPP_VIEW_ASSIGNED]: 'Ver minhas conversas',
  [PERMISSIONS.COMM_WHATSAPP_VIEW_UNASSIGNED]: 'Ver conversas não atribuídas',
  [PERMISSIONS.COMM_WHATSAPP_VIEW_TEAM]: 'Ver conversas da minha equipe',
  [PERMISSIONS.COMM_WHATSAPP_VIEW_ALL]: 'Ver todas as conversas',
  [PERMISSIONS.COMM_WHATSAPP_REPLY_ASSIGNED]: 'Responder minhas conversas',
  [PERMISSIONS.COMM_WHATSAPP_REPLY_TEAM]: 'Responder conversas da equipe',
  [PERMISSIONS.COMM_WHATSAPP_REPLY_ALL]: 'Responder qualquer conversa',
  [PERMISSIONS.COMM_WHATSAPP_CLAIM]: 'Assumir conversas',
  [PERMISSIONS.COMM_WHATSAPP_TRANSFER]: 'Transferir conversas',
  [PERMISSIONS.COMM_WHATSAPP_CLOSE]: 'Encerrar/reabrir conversas',
  [PERMISSIONS.COMM_WHATSAPP_TEAMS_READ]: 'Ver equipes de atendimento',
  [PERMISSIONS.COMM_WHATSAPP_TEAMS_MANAGE]: 'Gerenciar equipes de atendimento',
  [PERMISSIONS.COMM_WHATSAPP_QUEUES_READ]: 'Ver filas de atendimento',
  [PERMISSIONS.COMM_WHATSAPP_QUEUES_MANAGE]: 'Gerenciar filas de atendimento',
  [PERMISSIONS.COMM_WHATSAPP_TEMPLATES_READ]: 'Ver templates WhatsApp',
  [PERMISSIONS.COMM_WHATSAPP_TEMPLATES_MANAGE]: 'Criar/sincronizar templates WhatsApp',
  [PERMISSIONS.COMM_WHATSAPP_NUMBERS_READ]: 'Ver números WhatsApp conectados',
  [PERMISSIONS.AUTOMATION_WORKFLOWS_READ]: 'Ver fluxos de automação',
  [PERMISSIONS.AUTOMATION_WORKFLOWS_WRITE]: 'Criar/editar fluxos de automação',
  [PERMISSIONS.AUTOMATION_WORKFLOWS_PUBLISH]: 'Publicar/reverter versões de fluxo',
  [PERMISSIONS.AUTOMATION_WORKFLOWS_EXECUTE]: 'Executar fluxos manualmente',
  [PERMISSIONS.AUTOMATION_EXECUTIONS_READ]: 'Ver execuções de automação',
  [PERMISSIONS.AUTOMATION_EXECUTIONS_RETRY]: 'Reexecutar/cancelar execuções',
  [PERMISSIONS.AUTOMATION_TEMPLATES_READ]: 'Ver templates de automação',
  [PERMISSIONS.AUTOMATION_TEMPLATES_WRITE]: 'Criar/editar templates de automação',
  [PERMISSIONS.AUTOMATION_CALENDARS_MANAGE]: 'Gerenciar calendários (feriados)',
  [PERMISSIONS.AUTOMATION_EVENTS_READ]: 'Ver eventos do Event Bus',
  [PERMISSIONS.AUTOMATION_EVENTS_RETRY]: 'Reprocessar eventos (replay)',
  [PERMISSIONS.AUTOMATION_NOTIFICATIONS_READ]: 'Ver log de notificações',
  [PERMISSIONS.AI_AGENTS_READ]: 'Ver agentes de IA',
  [PERMISSIONS.AI_AGENTS_WRITE]: 'Criar/editar agentes de IA',
  [PERMISSIONS.AI_AGENTS_PUBLISH]: 'Publicar/reverter versões de agente',
  [PERMISSIONS.AI_AGENTS_EXECUTE]: 'Executar/testar agentes de IA',
  [PERMISSIONS.AI_AGENTS_ACTIONS]: 'Conceder à IA ações que gravam dados',
  [PERMISSIONS.AI_KNOWLEDGE_READ]: 'Ver bases de conhecimento',
  [PERMISSIONS.AI_KNOWLEDGE_WRITE]: 'Criar/editar bases de conhecimento',
  [PERMISSIONS.AI_MEMORY_READ]: 'Ver memória dos agentes',
  [PERMISSIONS.AI_MEMORY_WRITE]: 'Gerenciar perfis e entradas de memória',
  [PERMISSIONS.AI_TOOLS_READ]: 'Ver catálogo de ferramentas',
  [PERMISSIONS.AI_TOOLS_WRITE]: 'Criar/editar ferramentas',
  [PERMISSIONS.AI_APPROVALS_READ]: 'Ver aprovações e políticas de IA',
  [PERMISSIONS.AI_APPROVALS_DECIDE]: 'Aprovar/rejeitar ações e gerenciar políticas',
  [PERMISSIONS.AI_COSTS_READ]: 'Ver custos e consumo de IA',
  [PERMISSIONS.AI_COSTS_MANAGE]: 'Gerenciar orçamentos de IA',
  [PERMISSIONS.AI_MCP_READ]: 'Ver servidores MCP',
  [PERMISSIONS.AI_MCP_WRITE]: 'Cadastrar/sincronizar servidores MCP',
  [PERMISSIONS.AI_PROVIDERS_READ]: 'Ver provedores e conexões de IA',
  [PERMISSIONS.ISP_INCIDENTS_READ]: 'Ver incidentes/manutenções (ISP)',
  [PERMISSIONS.ISP_INCIDENTS_WRITE]: 'Criar/editar incidentes e afetados (ISP)',
  [PERMISSIONS.ISP_INCIDENTS_ACTIVATE]: 'Ativar/encerrar incidentes (ISP)',
  [PERMISSIONS.ISP_INCIDENTS_DISPATCH]: 'Disparar informativo em massa (ISP)',
  [PERMISSIONS.ISP_TOOLS_USE]: 'Usar ferramentas ISP do agente',
  [PERMISSIONS.RESOURCE_MAPPINGS_READ]: 'Ver mapeamentos de recursos',
  [PERMISSIONS.RESOURCE_MAPPINGS_WRITE]: 'Criar/editar mapeamentos de recursos',
  [PERMISSIONS.RESOURCE_EXPLORE_READ]: 'Explorar recursos (somente leitura)',
  [PERMISSIONS.RESOURCE_MAPPER_SUGGEST]: 'Sugerir mapeamento com IA',
  [PERMISSIONS.DEVTOOLS_USE]: 'Usar o Console do Desenvolvedor',
  [PERMISSIONS.DEVELOPER_APIKEYS_READ]: 'Ver chaves de API (metadados)',
  [PERMISSIONS.DEVELOPER_APIKEYS_MANAGE]: 'Criar/revogar chaves de API',
};

export interface SystemProfileDef {
  name: string;
  description: string;
  permissions: string[];
}

// Perfis de sistema criados no provisionamento de cada organization.
// Administrador = todas; Operador = somente leitura (*.read);
// Atendente WhatsApp = operacao da Central de Atendimento (Fase 3);
// Operador de Automação = opera fluxos/execuções sem publicar (Fase 4).
export const SYSTEM_PROFILES: SystemProfileDef[] = [
  {
    name: 'Administrador',
    description: 'Acesso total à organização',
    permissions: ALL_PERMISSIONS,
  },
  {
    name: 'Operador',
    description: 'Acesso somente leitura',
    permissions: ALL_PERMISSIONS.filter((p) => p.endsWith('.read')),
  },
  {
    name: 'Atendente WhatsApp',
    description: 'Atendimento de conversas WhatsApp (minhas + não atribuídas)',
    permissions: [
      PERMISSIONS.COMM_WHATSAPP_VIEW_ASSIGNED,
      PERMISSIONS.COMM_WHATSAPP_VIEW_UNASSIGNED,
      PERMISSIONS.COMM_WHATSAPP_REPLY_ASSIGNED,
      PERMISSIONS.COMM_WHATSAPP_CLAIM,
      PERMISSIONS.COMM_WHATSAPP_TRANSFER,
      PERMISSIONS.COMM_WHATSAPP_CLOSE,
      PERMISSIONS.COMM_WHATSAPP_TEAMS_READ,
      PERMISSIONS.COMM_WHATSAPP_QUEUES_READ,
      PERMISSIONS.COMM_WHATSAPP_TEMPLATES_READ,
    ],
  },
  {
    name: 'Operador de Automação',
    description: 'Cria, edita e executa fluxos de automação (sem publicar)',
    permissions: [
      PERMISSIONS.AUTOMATION_WORKFLOWS_READ,
      PERMISSIONS.AUTOMATION_WORKFLOWS_WRITE,
      PERMISSIONS.AUTOMATION_WORKFLOWS_EXECUTE,
      PERMISSIONS.AUTOMATION_EXECUTIONS_READ,
      PERMISSIONS.AUTOMATION_TEMPLATES_READ,
      PERMISSIONS.AUTOMATION_TEMPLATES_WRITE,
      PERMISSIONS.AUTOMATION_EVENTS_READ,
      PERMISSIONS.AUTOMATION_NOTIFICATIONS_READ,
    ],
  },
  {
    name: 'Operador de IA',
    description: 'Cria, edita e executa agentes de IA (sem publicar/decidir/orçar)',
    permissions: [
      PERMISSIONS.AI_AGENTS_READ,
      PERMISSIONS.AI_AGENTS_WRITE,
      PERMISSIONS.AI_AGENTS_EXECUTE,
      PERMISSIONS.AI_KNOWLEDGE_READ,
      PERMISSIONS.AI_KNOWLEDGE_WRITE,
      PERMISSIONS.AI_MEMORY_READ,
      PERMISSIONS.AI_MEMORY_WRITE,
      PERMISSIONS.AI_TOOLS_READ,
      PERMISSIONS.AI_APPROVALS_READ,
      PERMISSIONS.AI_COSTS_READ,
    ],
  },
  {
    name: 'Operador ISP',
    description: 'Gerencia incidentes/manutenções e afetados (sem disparo em massa)',
    permissions: [
      PERMISSIONS.ISP_INCIDENTS_READ,
      PERMISSIONS.ISP_INCIDENTS_WRITE,
      PERMISSIONS.ISP_INCIDENTS_ACTIVATE,
      PERMISSIONS.ISP_TOOLS_USE,
    ],
  },
  {
    name: 'Desenvolvedor',
    description: 'Mapeia recursos, explora dados e usa Console/Chaves de API',
    permissions: [
      PERMISSIONS.RESOURCE_MAPPINGS_READ,
      PERMISSIONS.RESOURCE_MAPPINGS_WRITE,
      PERMISSIONS.RESOURCE_EXPLORE_READ,
      PERMISSIONS.RESOURCE_MAPPER_SUGGEST,
      PERMISSIONS.DEVTOOLS_USE,
      PERMISSIONS.DEVELOPER_APIKEYS_READ,
      PERMISSIONS.DEVELOPER_APIKEYS_MANAGE,
      PERMISSIONS.INTEGRATIONS_CONNECTIONS_READ,
      PERMISSIONS.INTEGRATIONS_CONNECTIONS_EXECUTE,
    ],
  },
];
