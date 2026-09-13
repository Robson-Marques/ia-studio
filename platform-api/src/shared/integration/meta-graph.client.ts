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

/**
 * Marca uma mensagem INCOMING como lida (tick azul no WhatsApp do cliente) e,
 * opcionalmente, dispara o indicador "digitando…". Um único POST /messages faz
 * as duas coisas (Meta): `status:'read'` + `typing_indicator:{type:'text'}`.
 * O "digitando" auto-expira em ~25s ou quando a próxima mensagem é enviada, e
 * é ancorado no wamid (external_id) de uma mensagem incoming — a Meta exige.
 * Porte do padrão do Aquapark (whatsapp-meta.service.sendTypingIndicator).
 * Doc: https://developers.facebook.com/docs/whatsapp/cloud-api/typing-indicators
 */
export async function markMessageRead(
  token: string,
  phoneNumberId: string,
  externalMessageId: string,
  opts?: { typing?: boolean },
): Promise<Record<string, unknown>> {
  return metaPost(
    token,
    `${phoneNumberId}/messages`,
    {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: externalMessageId,
      ...(opts?.typing ? { typing_indicator: { type: 'text' } } : {}),
    },
    'marcar mensagem como lida',
  );
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

export async function metaDelete(token: string, path: string, context: string): Promise<Record<string, unknown>> {
  const res = await httpRequest(`${META_GRAPH_BASE}/${path}`, {
    method: 'DELETE',
    headers: auth(token),
    timeoutMs: 20_000,
  });
  throwIfError(res.status, res.ok, res.data, context);
  return (res.data ?? {}) as Record<string, unknown>;
}

/**
 * Inscreve o app (dono do token) na WABA — PRE-REQUISITO pra RECEBER webhooks
 * de mensagem. Sem isso, a Meta verifica a URL mas nao encaminha os eventos
 * reais. Idempotente (chamar de novo devolve success). POST /{waba}/subscribed_apps.
 */
export async function subscribeAppToWaba(token: string, wabaId: string): Promise<void> {
  await metaPost(token, `${wabaId}/subscribed_apps`, {}, 'inscrever app na WABA (webhooks)');
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

/**
 * Edita um template já publicado (POST /{template_id}). A Meta só aceita alterar
 * categoria/componentes (nome e idioma são imutáveis) e reenvia para análise.
 */
export function editWabaTemplate(
  token: string,
  templateId: string,
  patch: { category?: string; components?: unknown[] },
): Promise<Record<string, unknown>> {
  return metaPost(token, `${templateId}`, patch, 'editar template');
}

/** Remove um template da WABA. Por hsm_id + name remove aquele idioma específico. */
export function deleteWabaTemplate(
  token: string,
  wabaId: string,
  params: { name: string; hsmId?: string },
): Promise<Record<string, unknown>> {
  const qs = params.hsmId
    ? `name=${encodeURIComponent(params.name)}&hsm_id=${encodeURIComponent(params.hsmId)}`
    : `name=${encodeURIComponent(params.name)}`;
  return metaDelete(token, `${wabaId}/message_templates?${qs}`, 'excluir template');
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

// ─── Upload de midia (aparelho → Meta, retorna media_id) ────────────────

/** Limites de tamanho da Cloud API por tipo (bytes). */
export const META_MEDIA_LIMITS: Record<'image' | 'audio' | 'video' | 'document', number> = {
  image: 5 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

/**
 * Sobe o binario pra Meta (POST /{phone_number_id}/media) e devolve o media_id.
 * Usa FormData/Blob/fetch nativos do Node 20 (sem lib de multipart). O media_id
 * e reutilizavel no envio por id ({ "<type>": { "id": mediaId } }) e expira em ~30 dias.
 */
export async function uploadMedia(
  token: string,
  phoneNumberId: string,
  file: { data: Buffer; mimeType: string; filename: string },
): Promise<string> {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', file.mimeType);
  // Uint8Array a partir do Buffer (evita passar Buffer direto ao Blob).
  const blob = new Blob([new Uint8Array(file.data)], { type: file.mimeType });
  form.append('file', blob, file.filename);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${META_GRAPH_BASE}/${phoneNumberId}/media`, {
      method: 'POST',
      headers: auth(token), // NAO setar Content-Type: fetch gera o boundary do multipart
      body: form,
      signal: controller.signal,
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    throwIfError(res.status, res.ok, data, 'subir mídia');
    const id = (data as { id?: string })?.id;
    if (!id) throw new MetaApiError('Meta Cloud API — subir mídia: resposta sem media_id.', null, res.status);
    return id;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Upload resumível para HEADER de mídia de template (retorna handle) ──
// Um template HSM com cabeçalho de mídia (imagem/vídeo/documento) exige um
// "handle" de exemplo, obtido pela Resumable Upload API (nível do App, não do
// número):
//   1) abre a sessão em POST /{app_id}/uploads?file_length&file_type&file_name;
//   2) envia o binário para a sessão (Authorization: OAuth, file_offset: 0).
// O handle volta em { h } e vai no componente HEADER como example.header_handle.
// Requer o App ID da conexão (config.app_id).
export async function uploadTemplateMediaHandle(
  token: string,
  appId: string,
  file: { data: Buffer; mimeType: string; filename: string },
): Promise<string> {
  const qs =
    `file_length=${file.data.length}` +
    `&file_type=${encodeURIComponent(file.mimeType)}` +
    `&file_name=${encodeURIComponent(file.filename)}`;
  // 1) Abre a sessão de upload (retorna id no formato "upload:<sessão>").
  const start = await metaPost(token, `${appId}/uploads?${qs}`, {}, 'abrir upload de mídia do template');
  const sessionId = typeof start['id'] === 'string' ? (start['id'] as string) : '';
  if (!sessionId) throw new MetaApiError('Meta Cloud API — abrir upload: resposta sem id de sessão.', null, 500);

  // 2) Envia os bytes para a sessão. A Meta exige Authorization: OAuth (não
  // Bearer) e o cabeçalho file_offset. Body = binário cru.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${META_GRAPH_BASE}/${sessionId}`, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${token}`,
        file_offset: '0',
        'Content-Type': file.mimeType || 'application/octet-stream',
      },
      body: new Uint8Array(file.data),
      signal: controller.signal,
    });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    throwIfError(res.status, res.ok, data, 'enviar mídia do template');
    const handle = (data as { h?: string })?.h;
    if (!handle) throw new MetaApiError('Meta Cloud API — enviar mídia do template: resposta sem handle.', null, res.status);
    return handle;
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
    case 'video': {
      // media_id (upload direto) tem precedencia; senao link publico.
      const ref = message.mediaId ? { id: message.mediaId } : { link: message.url };
      return { ...base, type: message.kind, [message.kind]: { ...ref, caption: message.caption } };
    }
    case 'audio': {
      const ref = message.mediaId ? { id: message.mediaId } : { link: message.url };
      return { ...base, type: 'audio', audio: ref };
    }
    case 'document': {
      const ref = message.mediaId ? { id: message.mediaId } : { link: message.url };
      return {
        ...base,
        type: 'document',
        document: { ...ref, caption: message.caption, filename: message.filename ?? 'documento.pdf' },
      };
    }
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
