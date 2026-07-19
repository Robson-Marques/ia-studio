// Helpers puros do canal WhatsApp (sem estado, sem this) — portados do
// Aquapark: normalizacao de telefone, extracao de texto/midia do webhook e
// validacao HMAC da assinatura Meta.
import { createHmac } from 'crypto';
import { NormalizedInboundMedia, WhatsappMessageType } from '../../../shared/integration/whatsapp.types';

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

/**
 * Valida HMAC SHA-256 do webhook Meta (header x-hub-signature-256 =
 * "sha256=<hex>") sobre o corpo BRUTO. Comparacao timing-safe.
 */
export function validateWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  appSecret: string | null,
): boolean {
  if (!appSecret) return false; // Fase 3: app_secret e obrigatorio no wizard
  if (!signatureHeader) return false;
  const expected = `sha256=${createHmac('sha256', appSecret)
    .update(typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody)
    .digest('hex')}`;
  if (expected.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  }
  return diff === 0;
}

interface WebhookMessage {
  id?: string;
  from?: string;
  type?: string;
  timestamp?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string; mime_type?: string };
  video?: { id?: string; caption?: string; mime_type?: string };
  audio?: { id?: string; mime_type?: string };
  document?: { id?: string; caption?: string; filename?: string; mime_type?: string };
  sticker?: { id?: string; mime_type?: string };
  location?: { latitude?: number; longitude?: number };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  button?: { text?: string };
}

/** Extrai texto plano de uma mensagem do webhook conforme o tipo. */
export function extractMessageText(msg: WebhookMessage | null | undefined): string {
  if (!msg) return '';
  switch (msg.type) {
    case 'text':
      return msg.text?.body ?? '';
    case 'image':
      return msg.image?.caption ?? '';
    case 'video':
      return msg.video?.caption ?? '';
    case 'document':
      return msg.document?.caption ?? msg.document?.filename ?? '';
    case 'audio':
      return '[Áudio]';
    case 'sticker':
      return '[Figurinha]';
    case 'location':
      return `[Localização: ${msg.location?.latitude},${msg.location?.longitude}]`;
    case 'interactive':
      return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? '[Interativo]';
    case 'button':
      return msg.button?.text ?? '[Botão]';
    default:
      return `[${msg.type ?? 'mensagem'}]`;
  }
}

/** Mapeia o tipo Meta pro tipo simplificado armazenado no banco. */
export function normalizeMessageType(metaType: string | undefined): WhatsappMessageType {
  const allowed = new Set<WhatsappMessageType>([
    'text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'interactive',
  ]);
  return allowed.has(metaType as WhatsappMessageType) ? (metaType as WhatsappMessageType) : 'text';
}

/** Extrai a referencia de midia (media_id Meta) quando a mensagem e midia. */
export function extractInboundMedia(msg: WebhookMessage | null | undefined): NormalizedInboundMedia | undefined {
  if (!msg) return undefined;
  const t = msg.type;
  const pick = (m?: { id?: string; mime_type?: string; caption?: string; filename?: string }) =>
    m?.id
      ? { media_id: m.id, mime_type: m.mime_type ?? 'application/octet-stream', caption: m.caption, filename: m.filename }
      : undefined;
  if (t === 'image') return pick(msg.image);
  if (t === 'video') return pick(msg.video);
  if (t === 'audio') return pick(msg.audio);
  if (t === 'document') return pick(msg.document);
  if (t === 'sticker') return pick(msg.sticker);
  return undefined;
}
