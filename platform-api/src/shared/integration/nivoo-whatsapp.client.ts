import { BadGatewayException, BadRequestException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'crypto';

const DEFAULT_BASE = 'https://integracoes.nivoo.dev.br';
const API = '/api/integrator/whatsapp';

export interface NivooConnection {
  id: string;
  installation_id: string;
  phone_number_id: string;
  waba_id: string;
  display_name: string | null;
  phone_number?: string | null;
  billing_currency: string | null;
  status: string;
  disconnected_at: string | null;
  history?: { available_from: string | null; available_until: string | null; backfill_supported: false };
}

export interface NivooChat {
  id: string;
  connection_id: string;
  connection_name?: string | null;
  contact_phone: string;
  contact_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  unread_count: number;
  tags?: string[];
  history?: NivooConnection['history'];
}

export interface NivooMessage {
  id: string;
  meta_message_id: string | null;
  direction: 'INBOUND' | 'OUTBOUND';
  message_type: string;
  body: string | null;
  media_url?: string | null;
  media_id?: string | null;
  media_mime?: string | null;
  media_filename?: string | null;
  media_state?: 'AVAILABLE' | 'UNAVAILABLE' | null;
  media_metadata?: Record<string, unknown> | null;
  reply_to_message_id?: string | null;
  reply_to_from?: string | null;
  reaction_emoji?: string | null;
  reaction_to_message_id?: string | null;
  interactive_reply?: Record<string, unknown> | null;
  template?: Record<string, unknown> | null;
  referral?: Record<string, unknown> | null;
  status?: string | null;
  failure_code?: string | null;
  failure_message?: string | null;
  occurred_at: string;
}

export interface NivooJob {
  job: { id: string; status: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED'; last_error: string | null };
  result: { meta_message_id?: string | null } | null;
}

export class NivooCentralError extends HttpException {
  constructor(readonly remoteStatus: number, message: string, readonly requiresTemplate = false) {
    super({ message, requiresTemplate }, remoteStatus === 401 || remoteStatus === 403 ? 503 : remoteStatus);
  }
}

/** Somente o backend instancia este cliente; a chave nunca vai ao navegador. */
export class NivooWhatsappClient {
  readonly installationId: string;
  private readonly base: string;
  private readonly key: string;

  constructor(config: { installationId: string; internalKey: string; baseUrl?: string }) {
    let base: URL;
    try { base = new URL(config.baseUrl || DEFAULT_BASE); }
    catch { throw new BadRequestException('Informe um endereço HTTPS válido para a Central.'); }
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
      throw new BadRequestException('A URL da Central deve ser uma origem HTTPS sem caminho.');
    }
    if (base.origin !== DEFAULT_BASE) {
      throw new BadRequestException('Use o endereço oficial da Central WhatsApp Nivoo.');
    }
    if (!config.installationId.trim() || !config.internalKey.trim()) {
      throw new BadRequestException('Configure a instalação e a chave da Central WhatsApp.');
    }
    this.base = base.origin;
    this.key = config.internalKey.trim();
    this.installationId = config.installationId.trim();
  }

  private url(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(`${API}${path}`, this.base);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async request<T>(method: string, path: string, options: {
    query?: Record<string, string | number | undefined>;
    body?: Record<string, unknown>;
    bytes?: Buffer;
    mime?: string;
    filename?: string;
    templateFile?: boolean;
    timeoutMs?: number;
  } = {}): Promise<T> {
    const headers: Record<string, string> = { 'X-Nivoo-Internal-Key': this.key };
    let body: string | Buffer | undefined;
    if (options.body) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({ ...options.body, installation_id: this.installationId });
    } else if (options.bytes) {
      headers['Content-Type'] = options.mime || 'application/octet-stream';
      if (options.filename) headers[options.templateFile ? 'X-Template-File-Name' : 'X-File-Name'] = options.filename;
      body = options.bytes;
    }
    let response: Response;
    try {
      response = await fetch(this.url(path, options.query), {
        method, headers, body,
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
    } catch {
      throw new ServiceUnavailableException('A Central WhatsApp não respondeu. Tente novamente após conferir a conexão.');
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string; requiresTemplate?: boolean };
      throw new NivooCentralError(response.status, payload.error || 'A Central WhatsApp recusou a operação.', payload.requiresTemplate === true);
    }
    if (response.status === 204) return {} as T;
    return response.json() as Promise<T>;
  }

  listConnections() {
    return this.request<{ connections: NivooConnection[] }>('GET', '/connections', {
      query: { installation_id: this.installationId },
    });
  }

  createSession(consumerOrigin: string) {
    let origin: URL;
    try { origin = new URL(consumerOrigin); }
    catch { throw new BadRequestException('Informe a origem HTTPS exata do painel.'); }
    if (origin.protocol !== 'https:' || origin.origin !== consumerOrigin || origin.username || origin.password) {
      throw new BadRequestException('A origem do painel deve ser uma origem HTTPS exata.');
    }
    return this.request<{ session_id: string; status: string; launch_url: string; expires_at: string }>('POST', '/onboarding/sessions', {
      body: { consumer_origin: consumerOrigin, required_billing_currency: 'BRL' },
    });
  }

  getSession(id: string) {
    return this.request<{ session: { id: string; status: string; connection?: NivooConnection; failure_message?: string | null } }>(
      'GET', `/onboarding/sessions/${encodeURIComponent(id)}`, { query: { installation_id: this.installationId } },
    );
  }

  chats(cursor?: string) {
    return this.request<{ chats: NivooChat[]; next_cursor: string | null }>('GET', '/chats', {
      query: { installation_id: this.installationId, page_size: 200, cursor },
    });
  }

  messages(chatId: string, cursor?: string) {
    return this.request<{ messages: NivooMessage[]; next_cursor: string | null }>(
      'GET', `/chats/${encodeURIComponent(chatId)}/messages`,
      { query: { installation_id: this.installationId, page_size: 500, cursor } },
    );
  }

  markRead(chatId: string, typing: boolean) {
    return this.request<Record<string, unknown>>('POST', `/chats/${encodeURIComponent(chatId)}/read`, { body: { typing } });
  }

  sendText(connectionId: string, to: string, body: string, contactName?: string) {
    return this.request<{ job_id: string; connection_id: string }>('POST', '/messages', {
      body: { connection_id: connectionId, to, body, ...(contactName ? { contact_name: contactName } : {}) },
    });
  }

  uploadMedia(connectionId: string, type: string, data: Buffer, mime: string, filename: string) {
    return this.request<{ id: string; type: string; mime_type: string }>('POST', '/media/upload', {
      query: { installation_id: this.installationId, connection_id: connectionId, type },
      bytes: data, mime, filename, timeoutMs: 120_000,
    });
  }

  sendMedia(connectionId: string, to: string, type: string, media: { id?: string; link?: string; filename?: string }, caption?: string, voice?: boolean) {
    return this.request<{ job_id: string; connection_id: string }>('POST', '/media', {
      body: { connection_id: connectionId, to, type, media, ...(caption ? { caption } : {}), ...(voice ? { voice: true } : {}) },
    });
  }

  job(id: string) {
    return this.request<NivooJob>('GET', `/jobs/${encodeURIComponent(id)}`, {
      query: { installation_id: this.installationId },
    });
  }

  templates(connectionId: string) {
    return this.request<{ templates: Array<Record<string, unknown>> }>('GET', '/templates', {
      query: { installation_id: this.installationId, connection_id: connectionId },
    });
  }

  createTemplate(connectionId: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>('POST', '/templates', { body: { ...payload, connection_id: connectionId } });
  }

  editTemplate(connectionId: string, id: string, payload: Record<string, unknown>) {
    return this.request<Record<string, unknown>>('PUT', `/templates/${encodeURIComponent(id)}`, {
      body: { ...payload, connection_id: connectionId },
    });
  }

  deleteTemplate(connectionId: string, id: string) {
    return this.request<Record<string, unknown>>('DELETE', `/templates/${encodeURIComponent(id)}`, {
      body: { connection_id: connectionId },
    });
  }

  sendTemplate(connectionId: string, to: string, name: string, language: string, values: Record<string, string>) {
    return this.request<{ job_id: string; connection_id: string }>('POST', '/templates/send', {
      body: { connection_id: connectionId, to, name, language, values },
    });
  }

  uploadTemplateMedia(connectionId: string, format: string, data: Buffer, mime: string, filename: string) {
    return this.request<{ handle: string }>('POST', '/templates/media', {
      query: { installation_id: this.installationId, connection_id: connectionId, format },
      bytes: data, mime, filename, templateFile: true, timeoutMs: 120_000,
    });
  }

  disconnect(connectionId: string, reason?: string) {
    return this.request<{ status: string }>('POST', `/connections/${encodeURIComponent(connectionId)}/disconnect`, {
      body: reason ? { reason: reason.slice(0, 300) } : {},
    });
  }

  async downloadMedia(chatId: string, messageId: string): Promise<{ bytes: Buffer; mime: string }> {
    let response: Response;
    try {
      response = await fetch(this.url(`/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/media`, {
        installation_id: this.installationId,
      }), { headers: { 'X-Nivoo-Internal-Key': this.key }, signal: AbortSignal.timeout(120_000) });
    } catch {
      throw new ServiceUnavailableException('A mídia não está disponível na Central.');
    }
    if (!response.ok) {
      if (response.status === 503) throw new ServiceUnavailableException('A Central ainda está preparando esta mídia.');
      if (response.status === 404) throw new NotFoundException('Mídia não encontrada na Central.');
      throw new BadGatewayException('Não foi possível baixar a mídia da Central.');
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const expectedHash = response.headers.get('x-content-sha256');
    if (expectedHash && createHash('sha256').update(bytes).digest('hex').toLowerCase() !== expectedHash.toLowerCase()) {
      throw new BadGatewayException('A mídia recebida da Central não passou na verificação de integridade.');
    }
    return { bytes, mime: response.headers.get('content-type') || 'application/octet-stream' };
  }
}
