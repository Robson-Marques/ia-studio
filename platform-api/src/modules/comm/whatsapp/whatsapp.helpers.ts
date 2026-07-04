// Helpers puros do canal WhatsApp (sem estado, sem this) — portados do
// Aquapark: normalizacao de telefone, extracao de texto/midia do webhook e
// validacao HMAC da assinatura Meta.
import { createHmac } from 'crypto';
import { NormalizedInboundMedia, WhatsappMessageType } from '../../../shared/integration/whatsapp.types';

/**
 * Normaliza telefone pra formato internacional sem mascara (so digitos).
 * "(27) 99999-9999" | "+5527999999999" | "5527999999999" → "5527999999999".
 * Brasil: adiciona 55 quando vier sem DDI (10/11 digitos).
 */
export function normalizePhone(input: string): string {
  let d = (input ?? '').replace(/\D/g, '');
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d;
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
