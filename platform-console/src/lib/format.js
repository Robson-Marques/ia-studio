// Helpers puros de formatacao (pt-BR).

export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR') + ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function formatNumber(value) {
  if (value == null) return '—';
  return Number(value).toLocaleString('pt-BR');
}

export function formatCurrency(value) {
  if (value == null) return '—';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Formata limite: null/undefined = ilimitado.
export function formatLimit(value) {
  if (value == null || value === '') return 'Ilimitado';
  return formatNumber(value);
}
