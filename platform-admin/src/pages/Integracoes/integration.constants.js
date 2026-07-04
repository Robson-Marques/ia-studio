// Constantes compartilhadas das telas de Integrações (labels pt-BR).

export const CATEGORY_LABELS = {
  COMMUNICATION: 'Comunicação',
  ERP: 'ERP',
  CRM: 'CRM',
  AI: 'Inteligência Artificial',
  STORAGE: 'Armazenamento',
  DATABASE: 'Banco de Dados',
  IDENTITY: 'Identidade',
  PAYMENTS: 'Pagamentos',
  PRODUCTIVITY: 'Produtividade',
  DEVELOPER: 'Desenvolvedor',
  IOT: 'IoT',
};

// Badge por estado da conexão (Instance) — cores do UI kit.
export const STATUS_META = {
  ACTIVE:        { label: 'Ativa',                   variant: 'green' },
  DISABLED:      { label: 'Desativada',              variant: 'gray' },
  MAINTENANCE:   { label: 'Em manutenção',           variant: 'yellow' },
  TOKEN_EXPIRED: { label: 'Token expirado',          variant: 'orange' },
  ERROR:         { label: 'Erro',                    variant: 'red' },
  RECONNECTING:  { label: 'Reconectando',            variant: 'blue' },
  SYNCING:       { label: 'Sincronizando',           variant: 'blue' },
  PENDING_AUTH:  { label: 'Aguardando autenticação', variant: 'purple' },
};

export const SECRET_KIND_LABELS = {
  API_KEY: 'API Key',
  OAUTH: 'OAuth',
  PASSWORD: 'Senha',
  CERTIFICATE: 'Certificado',
  PRIVATE_KEY: 'Chave privada',
  TOKEN: 'Token',
  OTHER: 'Outro',
};

export function statusMeta(status) {
  return STATUS_META[status] || { label: status, variant: 'gray' };
}

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category;
}
