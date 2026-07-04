// Cliente Graph API da Meta (WhatsApp Cloud API) — funcoes puras sobre
// httpRequest (fetch nativo). Toda chamada a Meta passa por aqui: provider
// whatsapp-meta, orquestrador, templates e sync. Erros da Graph API viram
// MetaApiError com o codigo numerico (ex.: 131047 = fora da janela de 24h).
import { httpRequest } from './http.util';
import { RichMessage, TemplateVariables } from './whatsapp.types';

export const META_GRAPH_BASE = 'https://graph.facebook.com/v22.0';

/** Codigo Meta pra "fora da janela de 24h — exige template HSM". */
export const META_REENGAGEMENT_CODE = 131047;

export class MetaApiError extends Error {
  constructor(
    message: string,
    /** Codigo numerico do erro Graph API (null quando nao tipado). */
    public readonly metaCode: number | null,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}

interface MetaErrorBody {
  error?: { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string } };
}

function throwIfError(status: number, ok: boolean, data: unknown, context: string): void {
  if (ok) return;
  const body = (data ?? {}) as MetaErrorBody;
  const err = body.error;
  const detail = err?.error_data?.details ? ` (${err.error_data.details})` : '';
  const message = err?.message
    ? `Meta Cloud API — ${context}: ${err.message}${detail}`
    : `Meta Cloud API — ${context}: HTTP ${status}`;
  throw new MetaApiError(message, err?.code ?? null, status);
}

function auth(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

// ─── GET/POST genericos ─────────────────────────────────────────────────

export async function metaGet(token: string, path: string, context: string): Promise<Record<string, unknown>> {
  const res = await httpRequest(`${META_GRAPH_BASE}/${path}`, { headers: auth(token), timeoutMs: 20_000 });
  throwIfError(res.status, res.ok, res.data, context);
  return (res.data ?? {}) as Record<string, unknown>;
}

export async function metaPost(
  token: string,
  path: string,
  body: unknown,
  context: string,
): Promise<Record<string, unknown>> {
  const res = await httpRequest(`${META_GRAPH_BASE}/${path}`, {
    method: 'POST',
    headers: auth(token),
    body,
    timeoutMs: 30_000,
  });
  throwIfError(res.status, res.ok, res.data, context);
  return (res.data ?? {}) as Record<string, unknown>;
}

// ─── Numero / WABA ──────────────────────────────────────────────────────

export interface MetaPhoneNumberInfo {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  name_status?: string;
  code_verification_status?: string;
}

export async function getPhoneNumberInfo(token: string, phoneNumberId: string): Promise<MetaPhoneNumberInfo> {
  const fields = 'display_phone_number,verified_name,quality_rating,messaging_limit_tier,name_status,code_verification_status';
  const data = await metaGet(token, `${phoneNumberId}?fields=${fields}`, 'consultar número');
  return data as unknown as MetaPhoneNumberInfo;
}

export async function listWabaPhoneNumbers(token: string, wabaId: string): Promise<Array<Record<string, unknown>>> {
  const data = await metaGet(
    token,
    `${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`,
    'listar números da WABA',
  );
  return Array.isArray(data['data']) ? (data['data'] as Array<Record<string, unknown>>) : [];
}

// ─── Templates (bidirecional) ───────────────────────────────────────────

export interface MetaTemplate {
  id?: string;
  name: string;
  language: string;
  category?: string;
  status?: string;
  components?: unknown[];
  rejected_reason?: string;
}

/** Lista templates da WABA (segue paginacao ate ~500 itens). */
export async function listWabaTemplates(token: string, wabaId: string): Promise<MetaTemplate[]> {
  const out: MetaTemplate[] = [];
  let path = `${wabaId}/message_templates?fields=id,name,language,category,status,components,rejected_reason&limit=100`;
  for (let page = 0; page < 5; page++) {
    const data = await metaGet(token, path, 'listar templates');
    const items = Array.isArray(data['data']) ? (data['data'] as MetaTemplate[]) : [];
    out.push(...items);
    const paging = data['paging'] as { next?: string; cursors?: { after?: string } } | undefined;
    if (!paging?.next || !paging.cursors?.after || items.length === 0) break;
    path = `${wabaId}/message_templates?fields=id,name,language,category,status,components,rejected_reason&limit=100&after=${paging.cursors.after}`;
  }
  return out;
}

export function createWabaTemplate(
  token: string,
  wabaId: string,
  template: { name: string; language: string; category: string; components: unknown[] },
): Promise<Record<string, unknown>> {
  return metaPost(token, `${wabaId}/message_templates`, template, 'criar template');
}

// ─── Midia (download em 2 passos: metadata → binario) ──────────────────

export async function downloadMedia(
  token: string,
  mediaId: string,
): Promise<{ base64: string; mime: string } | null> {
  const meta = await metaGet(token, mediaId, 'consultar mídia');
  const url = typeof meta['url'] === 'string' ? (meta['url'] as string) : null;
  const mime = typeof meta['mime_type'] === 'string' ? (meta['mime_type'] as string) : 'application/octet-stream';
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, { headers: auth(token), signal: controller.signal });
    if (!res.ok) throw new MetaApiError(`Meta Cloud API — baixar mídia: HTTP ${res.status}`, null, res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    return { base64: buf.toString('base64'), mime };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Envio de mensagens ─────────────────────────────────────────────────

/** Monta as variaveis posicionais do BODY de um template. */
function templateComponents(variables?: TemplateVariables): unknown[] {
  if (!variables) return [];
  const components: unknown[] = [];
  const toParams = (map: Record<string, string>) =>
    Object.keys(map)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => ({ type: 'text', text: map[k] }));

  const nested = variables as { header?: Record<string, string>; body?: Record<string, string> };
  if (nested.header || nested.body) {
    if (nested.header && Object.keys(nested.header).length) {
      components.push({ type: 'header', parameters: toParams(nested.header) });
    }
    if (nested.body && Object.keys(nested.body).length) {
      components.push({ type: 'body', parameters: toParams(nested.body) });
    }
    return components;
  }
  const flat = variables as Record<string, string>;
  if (Object.keys(flat).length) components.push({ type: 'body', parameters: toParams(flat) });
  return components;
}

/** Converte um RichMessage no payload da Cloud API (POST /messages). */
export function buildMessagePayload(to: string, message: RichMessage): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to };
  switch (message.kind) {
    case 'text':
      return { ...base, type: 'text', text: { body: message.body, preview_url: true } };
    case 'image':
    case 'video':
      return { ...base, type: message.kind, [message.kind]: { link: message.url, caption: message.caption } };
    case 'audio':
      return { ...base, type: 'audio', audio: { link: message.url } };
    case 'document':
      return {
        ...base,
        type: 'document',
        document: { link: message.url, caption: message.caption, filename: message.filename ?? 'documento.pdf' },
      };
    case 'template':
      return {
        ...base,
        type: 'template',
        template: {
          name: message.name,
          language: { code: message.language ?? 'pt_BR' },
          components: templateComponents(message.variables),
        },
      };
    case 'cta_url':
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          body: { text: message.body },
          ...(message.footer ? { footer: { text: message.footer } } : {}),
          action: { name: 'cta_url', parameters: { display_text: message.cta.text, url: message.cta.url } },
        },
      };
    case 'reply_buttons':
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: message.body },
          ...(message.footer ? { footer: { text: message.footer } } : {}),
          action: {
            buttons: message.buttons.slice(0, 3).map((b) => ({
              type: 'reply',
              reply: { id: b.id, title: b.label.slice(0, 20) },
            })),
          },
        },
      };
    case 'list':
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: message.body },
          ...(message.footer ? { footer: { text: message.footer } } : {}),
          action: {
            button: message.buttonText.slice(0, 20),
            sections: message.sections,
          },
        },
      };
    default:
      throw new MetaApiError('Tipo de mensagem não suportado pela Meta Cloud API.', null, 400);
  }
}

/** Envia a mensagem e devolve o wamid aceito pela Meta. */
export async function sendMessage(
  token: string,
  phoneNumberId: string,
  to: string,
  message: RichMessage,
): Promise<{ wamid: string | null }> {
  const payload = buildMessagePayload(to, message);
  const data = await metaPost(token, `${phoneNumberId}/messages`, payload, 'enviar mensagem');
  const messages = data['messages'] as Array<{ id?: string }> | undefined;
  return { wamid: messages?.[0]?.id ?? null };
}
