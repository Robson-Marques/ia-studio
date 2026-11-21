/**
 * Camada adicional de isolamento, mesmo se a API IXC ignorar filtros.
 * Retorno null = qualquer registro de outro cliente (bloquear TODO o lote).
 */
export function scopeVerifiedInvoices(
  records: Record<string, unknown>[],
  customerId: string,
): Record<string, unknown>[] | null {
  if (!/^[1-9]\d*$/.test(customerId)) return null;
  if (records.some((item) => String(item['id_cliente'] ?? '') !== customerId)) return null;
  return records.filter((item) =>
    String(item['liberado'] ?? '').trim().toUpperCase() === 'S'
    && !['C', 'R'].includes(String(item['status'] ?? '').trim().toUpperCase()));
}

/** Resposta determinística: não expor objetos brutos ou URLs inseguras. */
function safeValue(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = String(raw).trim();
  return value && /^[0-9]{1,10}(?:[.,][0-9]{1,2})?$/.test(value) ? value : null;
}
function dueDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return match[3] + '/' + match[2] + '/' + match[1];
}
function safeBoletoUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 1500) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    return url.toString();
  } catch { return null; }
}
export function formatVerifiedInvoices(invoices: Record<string, unknown>[], total: number): string {
  if (invoices.length === 0) return 'Não encontrei títulos em aberto neste cadastro neste momento.';
  const visibleCount = Math.min(invoices.length, 5);
  const lines = invoices.slice(0, visibleCount).map((invoice, index) => {
    const value = safeValue(invoice['valor_aberto']) ?? safeValue(invoice['valor']);
    const due = dueDate(invoice['vencimento']);
    const barcode = typeof invoice['linha_digitavel'] === 'string'
      ? invoice['linha_digitavel'].replace(/[\s.]/g, '') : '';
    const digitLine = /^\d{47,48}$/.test(barcode) ? barcode : null;
    const url = safeBoletoUrl(invoice['link_boleto']);
    const title = String(index + 1) + '. Título' + (due ? ' com vencimento em ' + due : '')
      + (value ? ' — R$ ' + value : '') + '.';
    return [title, digitLine ? 'Linha digitável: ' + digitLine : '',
      url ? 'Boleto: ' + url : ''].filter(Boolean).join('\n');
  });
  const remaining = Number.isFinite(total) && total > visibleCount
    ? '\nExistem mais ' + Math.trunc(total - visibleCount) + ' títulos; mostrei os primeiros.' : '';
  return 'Estes são os títulos em aberto encontrados para o seu cadastro:\n'
    + lines.join('\n\n') + remaining + '\n\nConfirme os dados do beneficiário antes de pagar.';
}
