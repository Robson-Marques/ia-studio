import { createHmac, timingSafeEqual } from 'crypto';

export interface WahaSession {
  name: string;
  status: string;
  me?: { id?: string; pushName?: string } | null;
  engine?: string;
  [key: string]: unknown;
}

export interface WahaQr {
  mimetype: string;
  data: string;
}

export interface WahaRefs {
  apiUrl: string;
  apiKey: string;
  session: string;
}

export interface WahaRuntimeConfig {
  apiUrl: string;
  apiKey: string;
  webhookUrl: string;
}

interface WahaMediaRef {
  chatId: string;
  messageId: string;
}

const MAX_MEDIA_BYTES = 32 * 1024 * 1024;

export function localWahaRuntime(): WahaRuntimeConfig | null {
  const apiUrl = process.env.IASTUDIO_WAHA_URL?.trim().replace(/\/+$/, '') ?? '';
  const apiKey = process.env.IASTUDIO_WAHA_API_KEY?.trim() ?? '';
  const webhookUrl = process.env.IASTUDIO_WAHA_WEBHOOK_URL?.trim() ?? '';
  return apiUrl && apiKey && webhookUrl ? { apiUrl, apiKey, webhookUrl } : null;
}

export function resolveWahaRuntime(
  config: Record<string, unknown>,
  legacyApiKey = '',
): WahaRuntimeConfig | null {
  const local = localWahaRuntime();
  if (config['runtime'] === 'local_docker') return local;
  const apiUrl = String(config['api_url'] ?? '').trim().replace(/\/+$/, '');
  const webhookUrl = String(config['webhook_url'] ?? '').trim();
  if (apiUrl && legacyApiKey && webhookUrl) return { apiUrl, apiKey: legacyApiKey, webhookUrl };
  return local;
}

export class WahaApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function baseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

async function request<T>(
  refs: Pick<WahaRefs, 'apiUrl' | 'apiKey'>,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${baseUrl(refs.apiUrl)}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Api-Key': refs.apiKey,
        ...(init.headers ?? {}),
      },
    });
    const responseText = await response.text();
    let body: unknown = null;
    try { body = responseText ? JSON.parse(responseText) : null; }
    catch { body = responseText; }
    if (!response.ok) {
      const errorBody = body && typeof body === 'object' ? body as Record<string, unknown> : null;
      const detail = errorBody?.['message'] ?? errorBody?.['error'] ?? responseText ?? `HTTP ${response.status}`;
      throw new WahaApiError(`WAHA: ${String(detail)}`, response.status);
    }
    return body as T;
  } catch (error) {
    if (error instanceof WahaApiError) throw error;
    if ((error as Error).name === 'AbortError') throw new Error('WAHA não respondeu em 20 segundos.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getWahaSession(refs: WahaRefs): Promise<WahaSession | null> {
  try {
    return await request<WahaSession>(refs, `/api/sessions/${encodeURIComponent(refs.session)}`);
  } catch (error) {
    if (error instanceof WahaApiError && error.status === 404) return null;
    throw error;
  }
}

export async function ensureWahaSession(
  refs: WahaRefs,
  webhookUrl: string,
  webhookSecret: string,
): Promise<WahaSession> {
  let session = await getWahaSession(refs);
  const payload = {
    name: refs.session,
    config: {
      metadata: { connection: refs.session.replace(/^iastudio-/, '') },
      client: { deviceName: 'IA Studio', browserName: 'Chrome' },
      ignore: { status: true, groups: true, channels: true, broadcast: true },
      webhooks: [{
        url: webhookUrl,
        // message.any inclui mensagens recebidas e também as enviadas pelo
        // aparelho conectado. O external_id deduplica o eco da própria API.
        events: ['message.any', 'message.ack', 'session.status'],
        hmac: webhookSecret ? { key: webhookSecret } : undefined,
        retries: { policy: 'constant', attempts: 5, delaySeconds: 2 },
      }],
    },
  };
  if (!session) {
    session = await request<WahaSession>(refs, '/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        start: true,
      }),
    });
  } else {
    // PUT é idempotente e atualiza também sessões criadas por releases
    // anteriores, que ouviam apenas `message` e perdiam envios do celular.
    session = await request<WahaSession>(refs, `/api/sessions/${encodeURIComponent(refs.session)}`, {
      method: 'PUT', body: JSON.stringify(payload),
    });
  }
  if (session.status === 'STOPPED' || session.status === 'FAILED') {
    await startWahaSession(refs);
    session = (await getWahaSession(refs)) ?? session;
  }
  return session;
}

export function startWahaSession(refs: WahaRefs): Promise<WahaSession> {
  return request<WahaSession>(refs, `/api/sessions/${encodeURIComponent(refs.session)}/start`, { method: 'POST' });
}

export function restartWahaSession(refs: WahaRefs): Promise<WahaSession> {
  return request<WahaSession>(refs, `/api/sessions/${encodeURIComponent(refs.session)}/restart`, { method: 'POST' });
}

export async function logoutWahaSession(refs: WahaRefs): Promise<void> {
  await request<void>(refs, `/api/sessions/${encodeURIComponent(refs.session)}/logout`, { method: 'POST' });
}

export async function stopWahaSession(refs: WahaRefs): Promise<void> {
  await request<void>(refs, `/api/sessions/${encodeURIComponent(refs.session)}/stop`, { method: 'POST' });
}

export function getWahaQr(refs: WahaRefs): Promise<WahaQr> {
  return request<WahaQr>(refs, `/api/${encodeURIComponent(refs.session)}/auth/qr?format=image`);
}

export function getWahaMe(refs: WahaRefs): Promise<{ id?: string; pushName?: string }> {
  return request<{ id?: string; pushName?: string }>(refs, `/api/sessions/${encodeURIComponent(refs.session)}/me`);
}

export function normalizeWahaChatId(value: string): string {
  const input = value.trim();
  const jid = input.match(/^(\d+)(?::\d+)?@(c\.us|s\.whatsapp\.net|lid)$/i);
  if (jid) return `${jid[1]}@${jid[2].toLowerCase() === 's.whatsapp.net' ? 'c.us' : jid[2].toLowerCase()}`;
  return `${input.replace(/\D/g, '')}@c.us`;
}

export function wahaChatIdFromMessageId(messageId: string): string | null {
  const match = messageId.match(/(?:true|false)_([^_]+@(?:c\.us|s\.whatsapp\.net|lid))_/i);
  return match ? normalizeWahaChatId(match[1]) : null;
}

export async function getWahaPhoneByLid(refs: WahaRefs, lid: string): Promise<string | null> {
  const address = normalizeWahaChatId(lid);
  if (!address.endsWith('@lid')) return address.replace(/\D/g, '') || null;
  try {
    const result = await request<{ pn?: unknown }>(
      refs,
      `/api/${encodeURIComponent(refs.session)}/lids/${encodeURIComponent(address)}`,
    );
    const pn = typeof result?.pn === 'string' ? normalizeWahaChatId(result.pn) : '';
    return pn.endsWith('@c.us') ? pn.replace(/\D/g, '') : null;
  } catch (error) {
    if (error instanceof WahaApiError && error.status === 404) return null;
    throw error;
  }
}

export async function getWahaContactName(refs: WahaRefs, chatId: string): Promise<string | null> {
  try {
    const contact = await request<{ name?: unknown; pushname?: unknown; shortName?: unknown }>(
      refs,
      `/api/${encodeURIComponent(refs.session)}/contacts/${encodeURIComponent(normalizeWahaChatId(chatId))}`,
    );
    for (const value of [contact?.name, contact?.pushname, contact?.shortName]) {
      if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 255);
    }
    return null;
  } catch (error) {
    if (error instanceof WahaApiError && error.status === 404) return null;
    throw error;
  }
}

function responseMessageId(response: Record<string, unknown>): string | null {
  const direct = response['id'];
  if (typeof direct === 'string' || typeof direct === 'number') return String(direct) || null;
  const directRecord = direct && typeof direct === 'object' ? direct as Record<string, unknown> : undefined;
  const nested = response['_data'] as Record<string, unknown> | undefined;
  const nestedId = nested?.['id'];
  if (typeof nestedId === 'string' || typeof nestedId === 'number') return String(nestedId) || null;
  const nestedRecord = nestedId && typeof nestedId === 'object' ? nestedId as Record<string, unknown> : undefined;
  const serialized = directRecord?.['_serialized'] ?? nestedRecord?.['_serialized'];
  return typeof serialized === 'string' && serialized ? serialized : null;
}

export async function sendWahaText(refs: WahaRefs, to: string, text: string): Promise<{ wamid: string | null }> {
  const response = await request<Record<string, unknown>>(refs, '/api/sendText', {
    method: 'POST',
    body: JSON.stringify({ session: refs.session, chatId: normalizeWahaChatId(to), text }),
  });
  return { wamid: responseMessageId(response) };
}

export async function sendWahaMedia(
  refs: WahaRefs,
  input: { to: string; kind: string; data?: string; url?: string; mimeType?: string; filename?: string; caption?: string },
): Promise<{ wamid: string | null }> {
  const endpoint: Record<string, string> = {
    image: 'sendImage', audio: 'sendVoice', video: 'sendVideo', document: 'sendFile',
  };
  const path = endpoint[input.kind];
  if (!path || (!input.data && !input.url)) throw new Error('Mídia WAHA sem dados ou URL.');
  if (!input.to.replace(/\D/g, '')) throw new Error('Destino da mídia WAHA inválido.');
  const dataUri = input.data?.match(/^data:([^;]+);base64,(.+)$/s);
  const defaultMime: Record<string, string> = {
    image: 'image/jpeg', audio: 'audio/ogg; codecs=opus', video: 'video/mp4', document: 'application/octet-stream',
  };
  const payload: Record<string, unknown> = {
    session: refs.session,
    chatId: normalizeWahaChatId(input.to),
    file: {
      mimetype: input.mimeType ?? dataUri?.[1] ?? defaultMime[input.kind],
      data: dataUri?.[2] ?? input.data,
      url: input.url,
      filename: input.filename,
    },
    caption: input.caption,
  };
  if (input.kind === 'audio' || input.kind === 'video') payload['convert'] = true;
  const response = await request<Record<string, unknown>>(refs, `/api/${path}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { wamid: responseMessageId(response) };
}

export async function markWahaRead(refs: WahaRefs, messageId: string, typing = false): Promise<void> {
  const match = messageId.match(/([0-9]+@(?:c\.us|lid))/);
  if (!match) return;
  const id = match[1];
  await request<void>(refs, '/api/sendSeen', {
    method: 'POST', body: JSON.stringify({ session: refs.session, chatId: id }),
  });
  if (typing) {
    await request<void>(refs, '/api/startTyping', {
      method: 'POST', body: JSON.stringify({ session: refs.session, chatId: id }),
    });
  }
}

export function encodeWahaMediaRef(chatId: string, messageId: string): string {
  return Buffer.from(JSON.stringify({ chatId, messageId }), 'utf8').toString('base64url');
}

function decodeWahaMediaRef(value: string): WahaMediaRef {
  if (!value || value.length > 4096) throw new Error('Referência de mídia WAHA inválida.');
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { throw new Error('Referência de mídia WAHA inválida.'); }
  const record = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  const chatId = typeof record['chatId'] === 'string' ? record['chatId'] : '';
  const messageId = typeof record['messageId'] === 'string' ? record['messageId'] : '';
  if (!chatId || !messageId || chatId.length > 200 || messageId.length > 300) {
    throw new Error('Referência de mídia WAHA inválida.');
  }
  return { chatId, messageId };
}

async function limitedMediaBody(response: Response): Promise<Buffer> {
  if (!response.body) throw new Error('WAHA disponibilizou uma mídia vazia.');
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_MEDIA_BYTES) {
      await reader.cancel();
      throw new Error('Mídia WAHA excede o limite de 32 MB.');
    }
    chunks.push(Buffer.from(value));
  }
  if (!size) throw new Error('WAHA disponibilizou uma mídia vazia.');
  return Buffer.concat(chunks, size);
}

/**
 * Consome o arquivo que a WAHA disponibiliza diretamente no webhook.
 * Usa apenas /api/files/ no host da WAHA configurado; nunca acessa um
 * domínio/porta escolhido pelo evento (proteção contra SSRF).
 */
export async function downloadWahaWebhookFile(
  refs: WahaRefs,
  mediaUrl: string,
): Promise<{ data: Buffer; contentType: string }> {
  const source = new URL(mediaUrl, `${baseUrl(refs.apiUrl)}/`);
  if (!source.pathname.startsWith('/api/files/')) {
    throw new Error('URL de mídia WAHA fora do caminho permitido.');
  }
  const target = `${baseUrl(refs.apiUrl)}${source.pathname}${source.search}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(target, {
      redirect: 'error',
      signal: controller.signal,
      headers: { 'X-Api-Key': refs.apiKey, Accept: '*/*' },
    });
    if (!response.ok) throw new Error(`WAHA: mídia do webhook HTTP ${response.status}.`);
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_MEDIA_BYTES) {
      throw new Error('Mídia WAHA excede o limite de 32 MB.');
    }
    return {
      data: await limitedMediaBody(response),
      contentType: response.headers.get('content-type') || 'application/octet-stream',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadWahaMedia(
  refs: WahaRefs,
  encodedRef: string,
): Promise<{ data: Buffer; contentType: string }> {
  const mediaRef = decodeWahaMediaRef(encodedRef);
  const result = await request<{ media?: { url?: unknown; mimetype?: unknown; error?: unknown } }>(
    refs,
    `/api/${encodeURIComponent(refs.session)}/chats/${encodeURIComponent(mediaRef.chatId)}/messages/${encodeURIComponent(mediaRef.messageId)}?downloadMedia=true`,
  );
  if (!result.media || result.media.error || typeof result.media.url !== 'string') {
    throw new Error('WAHA não conseguiu preparar a mídia desta mensagem.');
  }
  const source = new URL(result.media.url, `${baseUrl(refs.apiUrl)}/`);
  if (!source.pathname.startsWith('/api/files/')) throw new Error('Referência de mídia WAHA inválida.');
  // A WAHA pode publicar media.url como localhost. Mantemos apenas o caminho
  // assinado pelo webhook e fazemos o download pela api_url configurada.
  const target = `${baseUrl(refs.apiUrl)}${source.pathname}${source.search}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(target, {
      redirect: 'error', signal: controller.signal, headers: { 'X-Api-Key': refs.apiKey, Accept: '*/*' },
    });
    if (!response.ok) throw new Error(`WAHA: falha ao baixar mídia (HTTP ${response.status}).`);
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_MEDIA_BYTES) {
      throw new Error('Mídia WAHA excede o limite de 32 MB.');
    }
    return {
      data: await limitedMediaBody(response),
      contentType: typeof result.media.mimetype === 'string' && result.media.mimetype
        ? result.media.mimetype
        : response.headers.get('content-type') ?? 'application/octet-stream',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function verifyWahaHmac(raw: Buffer | string, header: string | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  const digest = createHmac('sha512', secret).update(raw).digest();
  const provided = header.replace(/^sha512=/i, '').trim();
  const candidates = [Buffer.from(provided, 'hex'), Buffer.from(provided, 'base64')];
  return candidates.some((candidate) => candidate.length === digest.length && timingSafeEqual(candidate, digest));
}
