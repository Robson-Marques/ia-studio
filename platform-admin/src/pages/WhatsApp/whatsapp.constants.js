// Labels/cores pt-BR do domínio WhatsApp (status de atendimento, template,
// qualidade do número) — a UI nunca exibe enum cru.

export const ATTENDANCE_STATUS = {
  OPEN:        { label: 'Aberta',       variant: 'blue' },
  IN_PROGRESS: { label: 'Em andamento', variant: 'green' },
  CLOSED:      { label: 'Encerrada',    variant: 'gray' },
};

export const TEMPLATE_STATUS = {
  DRAFT:    { label: 'Rascunho',  variant: 'gray' },
  PENDING:  { label: 'Em análise', variant: 'yellow' },
  APPROVED: { label: 'Aprovado',  variant: 'green' },
  REJECTED: { label: 'Rejeitado', variant: 'red' },
  PAUSED:   { label: 'Pausado',   variant: 'yellow' },
  DISABLED: { label: 'Desativado', variant: 'gray' },
};

export const QUALITY = {
  GREEN:  { label: 'Alta',   color: '#22c55e' },
  YELLOW: { label: 'Média',  color: '#eab308' },
  RED:    { label: 'Baixa',  color: '#ef4444' },
  UNKNOWN: { label: 'Desconhecida', color: 'var(--ap-text-4)' },
};

export const MESSAGING_LIMIT_LABEL = {
  TIER_50: '50 conversas/dia',
  TIER_250: '250 conversas/dia',
  TIER_1K: '1 mil conversas/dia',
  TIER_10K: '10 mil conversas/dia',
  TIER_100K: '100 mil conversas/dia',
  TIER_UNLIMITED: 'Ilimitado',
};

export const CHAT_TABS = [
  { id: 'mine',       label: 'Minhas',          perm: 'comm.whatsapp.view.assigned' },
  { id: 'unassigned', label: 'Aguardando',      perm: 'comm.whatsapp.view.unassigned' },
  { id: 'ia',         label: 'IA',              perm: 'comm.whatsapp.view.all' },
  { id: 'team',       label: 'Minha equipe',    perm: 'comm.whatsapp.view.team' },
  { id: 'all',        label: 'Todas',           perm: 'comm.whatsapp.view.all' },
];

export function formatPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    return rest.length === 9
      ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
      : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return phone ? `+${d}` : '';
}
