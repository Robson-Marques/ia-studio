// shared/integration/ycloud.client.ts
//
// Cliente REST da YCloud (BSP oficial do WhatsApp). Espelha o estilo do
// meta-graph.client (fetch nativo, sem axios/form-data novos) e os shapes
// concretos usados em producao no Aquapark (envio via sendDirectly + upload
// multipart). Erros da API viram Error com a mensagem devolvida pela YCloud.
//
// Escopo deste arquivo (Checkpoint 2a — outbound): enviar texto/midia/template
// e subir midia. O inbound (webhook + verificacao de assinatura) entra no
// Checkpoint 2b.
import { RichMessage, TemplateVariables } from './whatsapp.types';

export const YCLOUD_API_BASE = 'https://api.ycloud.com/v2';

/** Deixa o telefone em `+<digitos>` (E.164). Aceita com ou sem `+`. */
function toPlus(phone: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

interface YCloudError {
  message?: string;
  error?: string;
  code?: string | number;
}

async function ycloudFetch(
  apiKey: string,
  path: string,
  init: RequestInit,
  context: string,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(`${YCLOUD_API_BASE}${path}`, {
      ...init,
      headers: { 'X-API-Key': apiKey, ...(init.headers ?? {}) },
    });
  } catch (cause) {
    throw new Error(`YCloud (${context}): falha de rede — ${(cause as Error).message}`);
  }
  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { raw: text };
    }
  }
  if (!response.ok) {
    const err = data as YCloudError;
    const reason = err.message ?? err.error ?? `HTTP ${response.status}`;
    throw new Error(`YCloud (${context}): ${reason}`);
  }
  return data;
}

/** Health leve: confirma que a chave autentica (lista de numeros da conta). */
export async function pingYCloud(apiKey: string): Promise<{ ok: boolean; status: number; detail?: string }> {
  try {
    const response = await fetch(`${YCLOUD_API_BASE}/whatsapp/phoneNumbers?limit=1`, {
      headers: { 'X-API-Key': apiKey },
    });
    if (response.ok) return { ok: true, status: response.status };
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: response.status, detail: 'Chave da API YCloud inválida ou sem permissão.' };
    }
    // Outro status: inconclusivo — nao afirma sucesso nem falha silenciosa.
    return { ok: true, status: response.status, detail: `Verificação inconclusiva (HTTP ${response.status}).` };
  } catch (cause) {
    return { ok: true, status: 0, detail: `Verificação inconclusiva (rede): ${(cause as Error).message}` };
  }
}

/** Monta os componentes posicionais do template (mesma forma da Cloud API que
 *  a YCloud espelha). Portado do templateComponents do meta-graph.client. */
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

/** Corpo YCloud sendDirectly para uma RichMessage. `mediaRef` já resolvido
 *  (link público ou id de upload) para os tipos de mídia. */
function buildYCloudPayload(
  fromPhone: string,
  to: string,
  message: RichMessage,
  mediaRef?: { link?: string; id?: string },
): Record<string, unknown> {
  const base = { from: toPlus(fromPhone), to: toPlus(to) };
  switch (message.kind) {
    case 'text':
      return { ...base, type: 'text', text: { body: message.body } };
    case 'image':
    case 'audio':
    case 'video':
    case 'document': {
      const node: Record<string, unknown> = { ...(mediaRef?.id ? { id: mediaRef.id } : { link: mediaRef?.link }) };
      if (message.caption) node.caption = message.caption;
      if (message.kind === 'document' && message.filename) node.filename = message.filename;
      return { ...base, type: message.kind, [message.kind]: node };
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
    default:
      // cta_url / reply_buttons / list: interativos ainda não portados para a
      // YCloud (Checkpoint futuro). Erro claro, sem fallback silencioso.
      throw new Error(`YCloud: mensagem do tipo "${(message as RichMessage).kind}" ainda não suportada neste conector.`);
  }
}

export interface YCloudSendResult {
  id: string | null;
}

/**
 * Envia uma RichMessage pela YCloud. Para mídia, `mediaRef` traz o link público
 * ou o id de um upload prévio (uploadYCloudMedia).
 */
export async function sendYCloudMessage(
  apiKey: string,
  fromPhone: string,
  to: string,
  message: RichMessage,
  mediaRef?: { link?: string; id?: string },
): Promise<YCloudSendResult> {
  const payload = buildYCloudPayload(fromPhone, to, message, mediaRef);
  const data = await ycloudFetch(
    apiKey,
    '/whatsapp/messages/sendDirectly',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
    'enviar mensagem',
  );
  const wa = data['whatsappMessage'] as Record<string, unknown> | undefined;
  const id = (data['id'] ?? data['messageId'] ?? wa?.['id'] ?? null) as string | null;
  return { id };
}

/** Sobe uma mídia para a YCloud (multipart) e devolve o media id. */
export async function uploadYCloudMedia(
  apiKey: string,
  fromPhone: string,
  file: { data: Buffer; mimeType: string; filename?: string },
): Promise<{ media_id: string }> {
  const form = new FormData();
  const blob = new Blob([new Uint8Array(file.data)], { type: file.mimeType });
  form.append('file', blob, file.filename ?? 'midia');
  const data = await ycloudFetch(
    apiKey,
    `/whatsapp/media/${toPlus(fromPhone)}/upload`,
    { method: 'POST', body: form },
    'subir mídia',
  );
  const id = (data['id'] ?? data['mediaId']) as string | undefined;
  if (!id) throw new Error('YCloud (subir mídia): resposta sem identificador da mídia.');
  return { media_id: id };
}
