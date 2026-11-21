/**
 * CPF/CNPJ validadores puros para identificação de assinante.
 * Desde 2026, novos CNPJs podem conter letras nas 12 primeiras posições.
 * DV do CNPJ alfanumérico: cada caractere vale código ASCII - 48.
 * Fonte: Receita Federal, manual de cálculo do DV do CNPJ alfanumérico.
 */
export function normalizeSubscriberDocument(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidSubscriberDocument(raw: string): boolean {
  const value = normalizeSubscriberDocument(raw);
  if (!(/^\d{11}$/.test(value) || /^[A-Z0-9]{12}\d{2}$/.test(value))) return false;
  if (/^([A-Z0-9])\1+$/.test(value)) return false;

  if (value.length === 11) {
    for (let pos = 9; pos <= 10; pos += 1) {
      const sum = [...value.slice(0, pos)].reduce((total, digit, index) =>
        total + Number(digit) * (pos + 1 - index), 0);
      const check = (sum * 10) % 11;
      if (Number(value[pos]) !== (check === 10 ? 0 : check)) return false;
    }
    return true;
  }

  const weights = [
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  ];
  for (let step = 0; step < 2; step += 1) {
    const sum = weights[step].reduce((total, weight, index) =>
      total + (value.charCodeAt(index) - 48) * weight, 0);
    const remainder = sum % 11;
    const expected = remainder < 2 ? 0 : 11 - remainder;
    if (Number(value[12 + step]) !== expected) return false;
  }
  return true;
}

const DOCUMENT_PATTERN = /(?:^|[^A-Za-z0-9])([A-Za-z0-9]{2}[.\s]?[A-Za-z0-9]{3}[.\s]?[A-Za-z0-9]{3}[\/\s]?[A-Za-z0-9]{4}[-\s]?\d{2}|\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})(?![A-Za-z0-9])/i;

/** Extrai somente um possível documento; validação ocorre em seguida. */
export function extractSubscriberDocument(message: string): string | null {
  return message.match(DOCUMENT_PATTERN)?.[1] ?? null;
}

/** Não transportar CPF/CNPJ do histórico bruto para o contexto do LLM. */
const DOCUMENT_IN_TEXT = /(^|[^A-Za-z0-9])([A-Za-z0-9]{2}[.\s]?[A-Za-z0-9]{3}[.\s]?[A-Za-z0-9]{3}[\/\s]?[A-Za-z0-9]{4}[-\s]?\d{2}|\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})(?![A-Za-z0-9])/gi;

export function redactSubscriberDocuments(text: string): string {
  return text.replace(DOCUMENT_IN_TEXT, (_match, prefix: string) =>
    prefix + '[documento protegido]');
}
