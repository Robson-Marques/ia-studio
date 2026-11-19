// Helpers puros de telefone do canal WhatsApp, portados do Aquapark.

// ─── Normalizacao de telefone (padrao portado do delivery-system) ──────────
// Duas funcoes pra dois contextos, porque a heuristica "sem DDI = BR" so vale
// pra numero DIGITADO por usuario — nunca pra numero que ja vem com DDI (Meta).
// Guardamos SEMPRE so digitos, com DDI, sem "+", sem mascara (ex.: "5527999999999").

/**
 * Numero vindo do WhatsApp/Meta (webhook `from`, wa_id): o DDI JA vem. Apenas
 * limpa os nao-digitos e trata o sufixo de device (":XX") e o caso de 15 digitos
 * comecando com 55 (sufixo grudado) — sem aplicar heuristica de pais.
 */
export function normalizePhoneFromWhatsApp(raw: string): string {
  const digits = (raw ?? '').split(':')[0].replace(/\D/g, '');
  // Celular BR valido: 55 + DDD(11-99) + 9 + 8 = 13 digitos. Se veio com 15 e os
  // primeiros 13 formam celular BR, o resto e sufixo de device — corta.
  if (digits.length === 15 && digits.startsWith('55')) {
    const ddd = parseInt(digits.substring(2, 4), 10);
    if (ddd >= 11 && ddd <= 99 && digits[4] === '9') return digits.substring(0, 13);
  }
  return digits;
}

/**
 * Numero DIGITADO por um usuario (form/config): adiciona DDI 55 quando e um
 * numero BR sem DDI, mas NAO corrompe numero estrangeiro. Heuristica de 11
 * digitos: DDD(11-99) + "9" no 3o digito = celular BR → 55; senao, estrangeiro.
 */
export function normalizePhoneFromUser(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  // "0" na frente (ex.: 011998212352 → 5511998212352)
  if (digits.startsWith('0') && digits.length === 12) return '55' + digits.slice(1);
  // 12 digitos com 55: fixo BR ou celular sem o nono — mantem (nem toda regiao usa o 9)
  if (digits.length === 12 && digits.startsWith('55')) return digits;
  // 12+ digitos: ja tem DDI — mantem
  if (digits.length >= 12) return digits;
  // 10 digitos: fixo BR com DDD
  if (digits.length === 10) return '55' + digits;
  // 11 digitos: celular BR (DDD + 9 + 8) ou estrangeiro
  if (digits.length === 11) {
    const ddd = parseInt(digits.substring(0, 2), 10);
    if (ddd >= 11 && ddd <= 99 && digits[2] === '9') return '55' + digits;
    return digits; // estrangeiro de 11 digitos (ex.: EUA 12125550100)
  }
  return digits;
}

/**
 * Normaliza telefone (contexto de ENTRADA de usuario — o mais comum nas tools/
 * envios, onde o numero ja vem completo com DDI). Mantido como nome canonico
 * pros chamadores existentes; delega a heuristica madura from-user.
 */
export function normalizePhone(input: string): string {
  return normalizePhoneFromUser(input);
}

/** Valida faixa de tamanho de um telefone (qualquer pais): 8..15 digitos. */
export function isValidPhone(raw: string): boolean {
  const digits = (raw ?? '').replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

/**
 * Variantes BR do numero pra lookup tolerante ao nono digito (so BR). Ex.:
 * "553384086917" → ["553384086917","5533984086917"]. Nao-BR: so o proprio.
 */
export function phoneVariants(phone: string): string[] {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits.startsWith('55')) return [digits];
  const body = digits.substring(2);
  const ddd = parseInt(body.substring(0, 2), 10);
  if (ddd < 11 || ddd > 99) return [digits];
  const local = body.substring(2);
  if (local.length === 8) return [digits, '55' + body.substring(0, 2) + '9' + local];
  if (local.length === 9 && local[0] === '9') return [digits, '55' + body.substring(0, 2) + local.substring(1)];
  return [digits];
}
