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

// Qualidade do número na Meta. Declara `variant` como os outros mapas daqui —
// quem traduz para o papel do DS é `statusToTone` (v0.10.9). Antes cravava
// `color: '#22c55e'` e afins: hex fixo, que no tema escuro perdia contraste e não
// acompanhava a troca de tema.
export const QUALITY = {
  GREEN:   { label: 'Alta',         variant: 'green' },
  YELLOW:  { label: 'Média',        variant: 'yellow' },
  RED:     { label: 'Baixa',        variant: 'red' },
  UNKNOWN: { label: 'Desconhecida', variant: 'gray' },
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

export function contactInitials(name, phone) {
  const parts = String(name || '').trim().split(/\s+/).map((part) =>
    Array.from(part).filter((char) => /[0-9A-Za-zÀ-ÖØ-öø-ÿ]/.test(char)).join(''),
  ).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  if (parts.length === 1) return Array.from(parts[0]).slice(0, 2).join('').toUpperCase();
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.slice(-2) || '?';
}
