// Constantes visuais do grupo IA (labels/cores pt-BR).

export const RUN_STATUS = {
  RUNNING:           { label: 'Executando',       variant: 'yellow' },
  COMPLETED:         { label: 'Concluída',        variant: 'green' },
  ERROR:             { label: 'Erro',             variant: 'red' },
  AWAITING_APPROVAL: { label: 'Aguardando aprovação', variant: 'blue' },
  CANCELLED:         { label: 'Cancelada',        variant: 'gray' },
};

export const DOC_STATUS = {
  PENDING:    { label: 'Pendente',     variant: 'gray' },
  PROCESSING: { label: 'Processando',  variant: 'yellow' },
  READY:      { label: 'Pronto',       variant: 'green' },
  FAILED:     { label: 'Falhou',       variant: 'red' },
};

export const APPROVAL_STATUS = {
  PENDING:  { label: 'Pendente',  variant: 'yellow' },
  APPROVED: { label: 'Aprovada',  variant: 'green' },
  REJECTED: { label: 'Rejeitada', variant: 'red' },
  EXPIRED:  { label: 'Expirada',  variant: 'gray' },
};

export const MEMORY_SCOPES = [
  { value: 'SESSION',  label: 'Sessão' },
  { value: 'CONTACT',  label: 'Contato' },
  { value: 'WORKFLOW', label: 'Fluxo' },
  { value: 'AGENT',    label: 'Agente' },
];

// Modelos sugeridos por provider — atalho no editor de agente (o campo aceita
// qualquer valor livre; isto é só uma lista amigável). Chave = provider_key da
// Connection AI (minúsculo). Vazio/desconhecido cai no input livre.
export const AGENT_MODELS = {
  openai: [
    { value: 'gpt-5.5',      label: 'GPT-5.5 (mais capaz)' },
    { value: 'gpt-5.4',      label: 'GPT-5.4' },
    { value: 'gpt-4o',       label: 'GPT-4o' },
    { value: 'gpt-4o-mini',  label: 'GPT-4o mini (rápido e econômico)' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 mini' },
  ],
  anthropic: [
    { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet (equilibrado)' },
    { value: 'claude-3-5-haiku',  label: 'Claude 3.5 Haiku (rápido)' },
    { value: 'claude-3-opus',     label: 'Claude 3 Opus (mais capaz)' },
  ],
  gemini: [
    { value: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (rápido)' },
  ],
};

// Persona guiada (porta do Aquapark). Compila no backend (agent-persona.ts):
// tone(string) / emojis(boolean) / brevity(short|medium|long) / rules_always / rules_never.
export const PERSONA_TONES = [
  { value: '',          label: '—' },
  { value: 'informal',  label: 'Informal' },
  { value: 'amigável',  label: 'Amigável' },
  { value: 'técnica',   label: 'Técnica' },
  { value: 'formal',    label: 'Formal' },
];

// UI de 3 níveis mapeada pro boolean que o backend entende (moderado/frequente = true).
export const PERSONA_EMOJIS = [
  { value: '',          label: '—' },
  { value: 'nenhum',    label: 'Sem emojis' },
  { value: 'moderado',  label: 'Moderado' },
  { value: 'frequente', label: 'Frequente' },
];

export const PERSONA_BREVITY = [
  { value: '',       label: '—' },
  { value: 'short',  label: 'Curtas (1 a 3 frases)' },
  { value: 'medium', label: 'Médias (4 a 6 frases)' },
  { value: 'long',   label: 'Completas e detalhadas' },
];

// Kinds de provider AI (espelha o enum AiProviderKind do backend).
export const PROVIDER_KINDS = [
  { value: 'OPENAI',       label: 'OpenAI' },
  { value: 'ANTHROPIC',    label: 'Anthropic' },
  { value: 'GEMINI',       label: 'Google Gemini' },
  { value: 'OLLAMA',       label: 'Ollama' },
  { value: 'OPENROUTER',   label: 'OpenRouter' },
  { value: 'GROQ',         label: 'Groq' },
  { value: 'DEEPSEEK',     label: 'DeepSeek' },
  { value: 'MISTRAL',      label: 'Mistral' },
  { value: 'AZURE_OPENAI', label: 'Azure OpenAI' },
  { value: 'COHERE',       label: 'Cohere' },
];

export const APPROVAL_TARGET_TYPES = [
  { value: 'TOOL',      label: 'Ferramenta' },
  { value: 'SQL_WRITE', label: 'Escrita em SQL' },
  { value: 'MASS_SEND', label: 'Envio em massa' },
  { value: 'COST',      label: 'Custo' },
  { value: 'ADMIN',     label: 'Ação administrativa' },
];

// Nome amigável da ação pendente (o usuário não deve ver a chave técnica crua).
// Compartilhado entre a fila (Aprovacoes) e o detalhe (AprovacaoDetalhe).
const TARGET_LABELS = {
  abrir_os: 'Abrir chamado',
  desbloqueio_confianca: 'Desbloqueio de confiança',
  enviar_whatsapp: 'Enviar WhatsApp',
  executar_sql: 'Executar SQL',
};

export function friendlyTarget(key) {
  return TARGET_LABELS[key] || key;
}

// Mapeia a `variant` do legado (verde/vermelho/…) para o `tone` do Badge do DS.
// Mantém APPROVAL_STATUS/DOC_STATUS/RUN_STATUS intactos (fonte compartilhada) e
// traduz na borda de renderização.
export function statusToTone(variant) {
  return {
    green: 'success', red: 'danger', yellow: 'warning',
    blue: 'info', purple: 'info', gray: 'neutral',
  }[variant] || 'neutral';
}

export const MCP_TRANSPORTS = [
  { value: 'HTTP',  label: 'HTTP' },
  { value: 'SSE',   label: 'SSE' },
  { value: 'STDIO', label: 'STDIO (metadado)' },
];

export function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return String(value); }
}

export function formatUsd(value) {
  const n = Number(value || 0);
  return `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

export function formatTokens(value) {
  return Number(value || 0).toLocaleString('pt-BR');
}
