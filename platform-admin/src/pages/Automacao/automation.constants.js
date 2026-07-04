// Constantes visuais do grupo Automação (labels/cores pt-BR).

export const WORKFLOW_STATUS = {
  DRAFT:     { label: 'Rascunho',  variant: 'gray' },
  PUBLISHED: { label: 'Publicado', variant: 'green' },
  ARCHIVED:  { label: 'Arquivado', variant: 'yellow' },
};

export const EXECUTION_STATUS = {
  QUEUED:    { label: 'Na fila',    variant: 'blue' },
  RUNNING:   { label: 'Executando', variant: 'yellow' },
  COMPLETED: { label: 'Concluída',  variant: 'green' },
  FAILED:    { label: 'Falhou',     variant: 'red' },
  CANCELLED: { label: 'Cancelada',  variant: 'gray' },
};

export const TRIGGER_LABEL = {
  manual:   'Manual',
  event:    'Evento',
  webhook:  'Webhook',
  schedule: 'Agendado',
};

export const TRIGGER_TYPE_LABEL = {
  MANUAL:   'Manual',
  EVENT:    'Evento',
  SCHEDULE: 'Agendado',
  WEBHOOK:  'Webhook',
  RETRY:    'Reexecução',
};

export const CHANNEL_LABEL = {
  WHATSAPP: 'WhatsApp',
  EMAIL:    'E-mail',
  SMS:      'SMS',
  PUSH:     'Push',
  PDF:      'PDF',
  HTML:     'HTML',
  MARKDOWN: 'Markdown',
};

export const SCHEDULE_KINDS = [
  { value: 'daily',        label: 'Todo dia (horário fixo)' },
  { value: 'interval',     label: 'A cada N minutos' },
  { value: 'weekly',       label: 'Semanal' },
  { value: 'monthly',      label: 'Mensal (dia fixo)' },
  { value: 'business_day', label: 'Primeiro/último dia útil' },
  { value: 'cron',         label: 'CRON avançado' },
];

export const WEEKDAYS = [
  { value: 0, label: 'Domingo' },
  { value: 1, label: 'Segunda' },
  { value: 2, label: 'Terça' },
  { value: 3, label: 'Quarta' },
  { value: 4, label: 'Quinta' },
  { value: 5, label: 'Sexta' },
  { value: 6, label: 'Sábado' },
];

export const NODE_CATEGORY_ORDER = ['Gatilhos', 'Lógica', 'Integrações', 'Comunicação', 'Plataforma'];

export const NOTIFICATION_STATUS = {
  SENT:      { label: 'Enviada',   variant: 'green' },
  FAILED:    { label: 'Falhou',    variant: 'red' },
  SKIPPED:   { label: 'Pulada',    variant: 'gray' },
  SIMULATED: { label: 'Simulada',  variant: 'blue' },
  QUEUED:    { label: 'Na fila',   variant: 'blue' },
};

export function formatDateTime(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch { return String(value); }
}
