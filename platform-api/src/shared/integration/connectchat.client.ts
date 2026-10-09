import { randomUUID } from 'crypto';
import { httpRequest } from './http.util';

export interface ConnectchatConversation {
  id: string;
  installationId: string;
  businessContactId: string;
  status: 'OPEN' | 'CLOSED';
  lastSequence: string;
  createdAt: string;
  customerRef: string | null;
  globalIdentityId: string | null;
  businessContact?: {
    displayName: string | null;
    customerDisplayName?: string | null;
    status: 'LEAD' | 'CUSTOMER' | 'INACTIVE';
    linkStatus: 'PENDING' | 'ACTIVE' | 'DISCONNECTED';
  };
}

export interface ConnectchatMessage {
  id: string;
  conversationId: string;
  body: string;
  senderKind: 'CUSTOMER' | 'BUSINESS';
  senderRef: string;
  serverSequence: string;
  clientMessageId: string | null;
  createdAt: string;
  editedAt: string | null;
}

export interface ConnectchatMention {
  targetKind: 'CUSTOMER' | 'BUSINESS';
  targetRef: string;
  startOffset: number;
  endOffset: number;
}

type ConnectchatErrorBody = { code?: unknown; message?: unknown };

export class ConnectchatApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'ConnectchatApiError';
  }
}

/** Cliente HTTP usado exclusivamente pelo provider ConnectChat. */
export class ConnectchatClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultActorRef: string;
  private readonly timeoutMs: number;

  constructor(input: {
    baseUrl: string;
    apiKey: string;
    actorRef: string;
    timeoutMs?: string | number;
  }) {
    const rawUrl = input.baseUrl;
    const apiKey = input.apiKey;
    const actorRef = input.actorRef;
    const timeoutMs = Number(input.timeoutMs ?? 10_000);
    if (!rawUrl || !apiKey) {
      throw new Error('Conexão ConnectChat sem URL ou chave técnica configurada.');
    }
    if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
      throw new Error('O timeout do ConnectChat deve ser um inteiro entre 100 e 60000 ms.');
    }
    this.baseUrl = `${rawUrl.replace(/\/+$/, '')}/v1`;
    this.apiKey = apiKey;
    this.defaultActorRef = actorRef;
    this.timeoutMs = timeoutMs;
  }

  async health(): Promise<unknown> {
    return this.request('/health', { public: true });
  }

  async listConversations(): Promise<ConnectchatConversation[]> {
    return this.request('/integration/conversations') as Promise<ConnectchatConversation[]>;
  }

  async getMessages(conversationId: string, afterSequence = '0', limit = 50): Promise<ConnectchatMessage[]> {
    const query = new URLSearchParams({ afterSequence, limit: String(Math.min(100, Math.max(1, limit))) });
    return this.request(`/integration/conversations/${conversationId}/messages?${query.toString()}`) as Promise<ConnectchatMessage[]>;
  }

  async openConversation(businessContactId: string, actorRef?: string): Promise<ConnectchatConversation> {
    return this.mutate('/integration/conversations', { businessContactId }, actorRef) as Promise<ConnectchatConversation>;
  }

  async sendMessage(input: {
    conversationId: string;
    body: string;
    clientMessageId: string;
    actorRef?: string;
    replyToMessageId?: string;
    mentions?: ConnectchatMention[];
  }): Promise<ConnectchatMessage> {
    const body = {
      body: input.body,
      clientMessageId: input.clientMessageId,
      ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
      ...(input.mentions?.length ? { mentions: input.mentions } : {}),
    };
    return this.mutate(
      `/integration/conversations/${input.conversationId}/messages`,
      body,
      input.actorRef,
      `ystudio:message:${input.clientMessageId}`,
    ) as Promise<ConnectchatMessage>;
  }

  async editMessage(messageId: string, body: string, actorRef?: string): Promise<ConnectchatMessage> {
    return this.mutate(`/integration/messages/${messageId}`, { body }, actorRef, `ystudio:edit:${messageId}:${this.shortHash(body)}`, 'PATCH') as Promise<ConnectchatMessage>;
  }

  async setTyping(conversationId: string, status: 'started' | 'stopped', actorRef?: string): Promise<{ status: 'started' | 'stopped' }> {
    return this.mutate(`/integration/conversations/${conversationId}/typing`, { status }, actorRef) as Promise<{ status: 'started' | 'stopped' }>;
  }

  async acknowledgeDelivered(conversationId: string, sequence: string, actorRef?: string): Promise<{ sequence: string }> {
    return this.mutate(`/integration/conversations/${conversationId}/receipts/delivered`, { sequence }, actorRef, `ystudio:delivered:${conversationId}:${sequence}`) as Promise<{ sequence: string }>;
  }

  async acknowledgeRead(conversationId: string, sequence: string, actorRef?: string): Promise<{ sequence: string }> {
    return this.mutate(`/integration/conversations/${conversationId}/receipts/read`, { sequence }, actorRef, `ystudio:read:${conversationId}:${sequence}`) as Promise<{ sequence: string }>;
  }

  async linkContactDirectly(globalIdentityId: string, customerRef: string, customerDisplayName?: string, actorRef?: string): Promise<unknown> {
    return this.mutate(
      '/integration/contacts/link',
      { globalIdentityId, customerRef, ...(customerDisplayName ? { customerDisplayName } : {}) },
      actorRef,
      `ystudio:link-direct:${globalIdentityId}:${this.shortHash(customerRef)}`,
    );
  }

  async disconnectContactDirectly(globalIdentityId: string, actorRef?: string): Promise<unknown> {
    return this.mutate(
      `/integration/contacts/${globalIdentityId}/disconnect`,
      {},
      actorRef,
      `ystudio:link-disconnect:${globalIdentityId}`,
    );
  }

  async createLinkRequest(globalIdentityId: string, purpose: string, customerRef?: string, ttlSeconds?: number, actorRef?: string): Promise<unknown> {
    return this.mutate('/integration/link-requests', { globalIdentityId, purpose, ...(customerRef ? { customerRef } : {}), ...(ttlSeconds ? { ttlSeconds } : {}) }, actorRef);
  }

  async completeLinkRequest(requestId: string, globalIdentityId: string, actorRef?: string): Promise<unknown> {
    return this.mutate('/integration/link-requests/complete', { requestId, globalIdentityId }, actorRef, `ystudio:link-complete:${requestId}`);
  }

  async exchangeLinkProof(proof: string, customerRef?: string, actorRef?: string): Promise<unknown> {
    return this.mutate('/integration/link-proofs/exchange', { proof, ...(customerRef ? { customerRef } : {}) }, actorRef);
  }

  private async mutate(
    path: string,
    body: unknown,
    actorRef?: string,
    idempotencyKey = `ystudio:${randomUUID()}`,
    method: 'POST' | 'PATCH' = 'POST',
  ): Promise<unknown> {
    return this.request(path, { method, body, actorRef, idempotencyKey });
  }

  private async request(path: string, options: {
    method?: 'GET' | 'POST' | 'PATCH';
    body?: unknown;
    actorRef?: string;
    idempotencyKey?: string;
    public?: boolean;
  } = {}): Promise<unknown> {
    const method = options.method ?? 'GET';
    const headers: Record<string, string> = options.public
      ? {}
      : {
          'X-ConnectChat-Key': this.apiKey,
          'X-ConnectChat-Actor-Ref': options.actorRef ?? this.defaultActorRef,
          ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
        };
    let lastError: unknown;
    // A repetição conserva idempotência e corpo. Só 429, 5xx, rede e a
    // pendência idempotente são repetíveis; conflitos incompatíveis não são.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await httpRequest(`${this.baseUrl}${path}`, {
          method,
          headers,
          body: options.body,
          timeoutMs: this.timeoutMs,
        });
        if (result.ok) return result.data;
        const body = (result.data && typeof result.data === 'object' ? result.data : {}) as ConnectchatErrorBody;
        const code = typeof body.code === 'string' ? body.code : null;
        const message = typeof body.message === 'string' ? body.message : `ConnectChat respondeu HTTP ${result.status}.`;
        const error = new ConnectchatApiError(result.status, code, message);
        const retryableConflict = error.code === 'IDEMPOTENCY_IN_PROGRESS';
        if (attempt === 2 || (!retryableConflict && result.status !== 429 && result.status < 500)) throw error;
        lastError = error;
      } catch (error) {
        if (error instanceof ConnectchatApiError && error.code !== 'IDEMPOTENCY_IN_PROGRESS' && error.status < 500 && error.status !== 429) throw error;
        lastError = error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    }
    throw lastError;
  }

  private shortHash(value: string): string {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    return Math.abs(hash).toString(36);
  }
}
