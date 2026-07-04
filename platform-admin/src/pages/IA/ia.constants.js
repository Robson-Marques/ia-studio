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
