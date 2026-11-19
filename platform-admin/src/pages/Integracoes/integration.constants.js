// Constantes compartilhadas das telas de Integrações (labels pt-BR).
//
// Migrado pro DS na v0.10.11. Diferença que importa: os mapas declaram **`tone`**
// (o papel semântico que o Studio UX entende) em vez de `variant` com nome de
// cor. As outras famílias ainda passam pela ponte `lib/tone.js` — aqui ela não é
// mais necessária, e é assim que a ponte morre: uma família de cada vez.
//
// O motivo não é cosmético. `TOKEN_EXPIRED` era `variant: 'orange'`, e `orange`
// **não existe** no mapa da ponte — caía no `|| 'neutral'`. Ou seja: o estado que
// mais precisa chamar atenção (a credencial venceu, a integração parou) era o
// único que saía cinza. Declarando o papel, isso não tem como acontecer: não
// existe "papel desconhecido", existe `warning`.

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

// Estado da conexão (Instance). `tone` = papel semântico do DS.
export const STATUS_META = {
  ACTIVE:        { label: 'Ativa',                   tone: 'success' },
  DISABLED:      { label: 'Desativada',              tone: 'neutral' },
  MAINTENANCE:   { label: 'Em manutenção',           tone: 'warning' },
  TOKEN_EXPIRED: { label: 'Credencial vencida',      tone: 'warning' },
  ERROR:         { label: 'Com erro',                tone: 'danger'  },
  RECONNECTING:  { label: 'Reconectando',            tone: 'info'    },
  SYNCING:       { label: 'Sincronizando',           tone: 'info'    },
  PENDING_AUTH:  { label: 'Aguardando autorização',  tone: 'info'    },
};

export const SECRET_KIND_LABELS = {
  API_KEY: 'Chave de API',
  OAUTH: 'OAuth',
  PASSWORD: 'Senha',
  CERTIFICATE: 'Certificado',
  PRIVATE_KEY: 'Chave privada',
  TOKEN: 'Token',
  OTHER: 'Outro',
};

// Mudança de estado da conexão — rótulo + a consequência por escrito (os 5
// patrasques). O texto fala do efeito no negócio, não do enum.
export const STATE_ACTIONS = {
  enable: {
    label: 'Ativar',
    icon: 'play',
    message: 'Reativar esta conexão? Ela volta a aceitar operações imediatamente — fluxos e assistentes que dependem dela voltam a funcionar.',
  },
  disable: {
    label: 'Desativar',
    icon: 'power',
    danger: true,
    message: 'Desativar esta conexão? Nenhuma operação será executada até você reativá-la — o que depende dela para de funcionar agora. A conexão nunca é excluída: só muda de estado, e o histórico fica.',
  },
  maintenance: {
    label: 'Pôr em manutenção',
    icon: 'settings',
    message: 'Colocar em manutenção? As operações ficam suspensas enquanto durar — é o estado para mexer no sistema do outro lado sem que o erro apareça como falha da conexão.',
  },
};

// Tipos de recurso que os providers devolvem no "Descobrir recursos".
export const RESOURCE_KIND_LABELS = {
  setor: 'Setores de OS',
  motivo_atendimento: 'Assuntos de OS',
  plano: 'Planos',
  model: 'Modelos',
  phone_number: 'Números',
  template: 'Templates',
  table: 'Tabelas',
  bucket: 'Buckets',
};

export function statusMeta(status) {
  return STATUS_META[status] || { label: status, tone: 'neutral' };
}

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] || category;
}

// Nome amigável do conector a partir da chave, quando o catálogo local ainda não
// respondeu (ixc → Ixc, whatsapp-nivoo → WhatsApp Nivoo). Melhor um nome
// aproximado do que a chave crua na tela (P11).
export function prettifyProviderKey(key) {
  return String(key || '')
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
