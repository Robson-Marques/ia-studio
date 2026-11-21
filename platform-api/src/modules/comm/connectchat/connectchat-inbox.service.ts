import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { ConnectchatConversation, ConnectchatMention, ConnectchatMessage } from '../../../shared/integration/connectchat.client';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { ConnectionsService } from '../../integration/connections/connections.service';

@Injectable()
export class ConnectchatInboxService {
  constructor(
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly connections: ConnectionsService,
  ) {}

  private async connectionId(): Promise<string> {
    const [connection] = await this.connectionsRepository.findAll({ providerKey: 'connectchat', status: 'ACTIVE' });
    if (!connection) {
      throw new ConflictException('ConnectChat não está configurado ou ativo. Crie e teste a conexão em Integrações → Conexões.');
    }
    return connection.id;
  }

  private async execute(operation: string, params: Record<string, unknown> = {}) {
    return this.connections.execute(await this.connectionId(), operation, params);
  }

  private async conversation(conversationId: string): Promise<ConnectchatConversation> {
    const conversations = await this.execute('listConversations') as ConnectchatConversation[];
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation?.globalIdentityId) {
      throw new BadRequestException('A conversa não está disponível para vínculo de cliente.');
    }
    return conversation;
  }

  private async activeIxcConnection() {
    const connections = await this.connectionsRepository.findAll({ providerKey: 'ixc', status: 'ACTIVE' });
    if (connections.length !== 1) {
      throw new ConflictException('É necessário haver exatamente uma conexão IXC ativa para vincular o cliente pelo atendimento.');
    }
    return connections[0];
  }

  private actor(user: AuthenticatedUser): string {
    return `ystudio:user:${user.sub}`;
  }

  async health() {
    return this.connections.test(await this.connectionId());
  }

  /** Leitura interna, sem enriquecimento/mutação de contatos, para o condutor IA. */
  async listRawConversations(): Promise<ConnectchatConversation[]> {
    return this.execute('listConversations') as Promise<ConnectchatConversation[]>;
  }

  /** Envio do agente pela identidade técnica da conexão, idempotente por
   * clientMessageId. Não se faz passar por um usuário humano. */
  async sendAgentMessage(conversationId: string, body: string, clientMessageId: string) {
    if (!body.trim()) throw new BadRequestException('A IA não gerou texto para enviar.');
    return this.execute('sendMessage', { conversationId, body: body.trim(), clientMessageId });
  }

  async listConversations() {
    const conversations = await this.execute('listConversations') as ConnectchatConversation[];
    return Promise.all(conversations.map((conversation) => this.presentConversation(conversation)));
  }

  private async presentConversation(conversation: ConnectchatConversation) {
    const customerDisplayName = await this.resolveCustomerDisplayName(conversation.customerRef);
    // Consulta de caixa de mensagens é estritamente leitura. Nunca chamar
    // linkContactDirectly para completar o nome visual: isso contornaria o
    // fluxo de prova aprovado pelo próprio assinante.
    const { customerRef: _customerRef, globalIdentityId: _globalIdentityId, ...safeConversation } = conversation;
    return customerDisplayName ? { ...safeConversation, customerDisplayName } : safeConversation;
  }

  /**
   * customerRef é opaco para o ConnectChat. Nesta vertente, o IA Studio emite
   * `ixc:<connection-id>:<customer-id>` e só ele pode interpretá-lo.
   */
  private async resolveCustomerDisplayName(customerRef: string | null): Promise<string | null> {
    if (!customerRef) return null;
    const match = /^ixc:([0-9a-f-]{36}):([1-9]\d*)$/i.exec(customerRef);
    if (!match) return null;
    const [, connectionId, customerId] = match;
    const connection = await this.connections.findById(connectionId).catch(() => null);
    if (!connection || connection.provider_key !== 'ixc' || connection.status !== 'ACTIVE') return null;

    try {
      const result = await this.connections.execute(connection.id, 'cliente.identificacao', { customerId }) as {
        data?: Array<{ name?: unknown }>;
      };
      const name = result.data?.[0]?.name;
      return typeof name === 'string' && name.trim() ? name.trim() : null;
    } catch {
      // A falha já é registrada pelo Integration Manager. A caixa segue legível
      // com @ID, sem transformar a indisponibilidade do ERP em perda do chat.
      return null;
    }
  }

  /**
   * Leitura para SIMULAÇÃO da IA. Não marca mensagens como lidas, não envia
   * mensagens e não altera o vínculo. A identidade é considerada confirmada
   * apenas quando a própria Central mantém vínculo ACTIVE + CUSTOMER.
   */
  async contextForAgentPreview(conversationId: string): Promise<{
    conversation: ConnectchatConversation;
    messages: ConnectchatMessage[];
    verified: boolean;
  }> {
    const conversations = await this.execute('listConversations') as ConnectchatConversation[];
    const conversation = conversations.find((row) => row.id === conversationId);
    if (!conversation) throw new BadRequestException('Conversa não encontrada no ConnectChat.');
    // O ConnectChat usa cursor crescente. Ler desde 0 retornaria o começo da
    // conversa longa; o teste precisa do contexto mais recente.
    const lastSequence = typeof conversation.lastSequence === 'string'
      && /^\d+$/.test(conversation.lastSequence)
      ? BigInt(conversation.lastSequence) : 0n;
    const after = lastSequence > 100n ? (lastSequence - 100n).toString() : '0';
    const messages = await this.getMessages(conversationId, after, 100) as ConnectchatMessage[];
    const verified = conversation.businessContact?.status === 'CUSTOMER'
      && conversation.businessContact?.linkStatus === 'ACTIVE'
      && typeof conversation.customerRef === 'string'
      && /^ixc:[0-9a-f-]{36}:[1-9]\d*$/i.test(conversation.customerRef);
    return { conversation, messages, verified };
  }

  getMessages(conversationId: string, afterSequence?: string, limit?: number) {
    if (afterSequence !== undefined && !/^\d+$/.test(afterSequence)) {
      throw new BadRequestException('A sequência de mensagens é inválida.');
    }
    const safeLimit = Number.isInteger(limit) && limit! >= 1 && limit! <= 100 ? limit! : 50;
    return this.execute('getMessages', { conversationId, afterSequence: afterSequence ?? '0', limit: safeLimit });
  }

  getTyping(conversationId: string) {
    return this.execute('getTyping', { conversationId });
  }

  send(user: AuthenticatedUser, input: {
    conversationId: string;
    body: string;
    clientMessageId: string;
    replyToMessageId?: string;
    mentions?: ConnectchatMention[];
  }) {
    if (!input.body.trim()) throw new BadRequestException('Escreva a mensagem antes de enviar.');
    return this.execute('sendMessage', { ...input, body: input.body.trim(), actorRef: this.actor(user) });
  }

  async sendAttachment(user: AuthenticatedUser, input: {
    conversationId: string;
    clientMessageId: string;
    attachmentKind: 'IMAGE' | 'DOCUMENT' | 'AUDIO' | 'VIDEO';
    data: Buffer;
    filename: string;
    mimeType: string;
  }) {
    if (!input.data.length) throw new BadRequestException('Selecione um arquivo para enviar.');
    if (input.data.length > 100 * 1024 * 1024) throw new BadRequestException('O arquivo pode ter no máximo 100 MB.');
    return this.execute('sendAttachment', { ...input, actorRef: this.actor(user) });
  }

  getAttachment(attachmentId: string) {
    return this.execute('downloadAttachment', { attachmentId });
  }

  edit(user: AuthenticatedUser, messageId: string, body: string) {
    if (!body.trim()) throw new BadRequestException('A mensagem não pode ficar vazia.');
    return this.execute('editMessage', { messageId, body: body.trim(), actorRef: this.actor(user) });
  }

  setTyping(user: AuthenticatedUser, conversationId: string, status: 'started' | 'stopped') {
    return this.execute('setTyping', { conversationId, status, actorRef: this.actor(user) });
  }

  markRead(user: AuthenticatedUser, conversationId: string, sequence: string) {
    return this.execute('acknowledgeRead', { conversationId, sequence, actorRef: this.actor(user) });
  }

  markDelivered(user: AuthenticatedUser, conversationId: string, sequence: string) {
    return this.execute('acknowledgeDelivered', { conversationId, sequence, actorRef: this.actor(user) });
  }

  /**
   * Cria pedido de vínculo na identidade REAL da sessão ConnectChat.
   * Não confunde consentimento/CPF com prova de identidade. A aprovação é
   * feita pelo próprio assinante na PWA; este método não conclui vínculo.
   */
  async createAuthenticatedLinkRequest(conversationId: string, customerRef: string, purpose: string, requestKey: string, expectedIdentityId: string) {
    const conversation = await this.conversation(conversationId);
    if (conversation.status !== 'OPEN' || !expectedIdentityId
      || conversation.globalIdentityId !== expectedIdentityId
      || conversation.businessContact?.linkStatus === 'ACTIVE') {
      throw new ConflictException('Identidade ou situação da conversa mudou; pedido não emitido.');
    }
    if (!/^ixc:[0-9a-f-]{36}:[1-9]\d*$/i.test(customerRef)) {
      throw new BadRequestException('Referência do assinante inválida.');
    }
    if (!purpose || purpose.length > 80 || !/^[A-Za-z0-9._:-]+$/.test(purpose)) {
      throw new BadRequestException('Finalidade de vínculo não configurada.');
    }
    return this.execute('createLinkRequest', {
      globalIdentityId: conversation.globalIdentityId,
      purpose,
      customerRef,
      ttlSeconds: 600,
      requestKey,
    });
  }

  /**
   * Apenas conclui pedido APROVADO pelo ConnectChat; o próprio ConnectChat
   * rejeita pedidos pendentes, expirados ou pertencentes a outra identidade.
   */
  async completeAuthenticatedLinkRequest(conversationId: string, requestId: string, expectedIdentityId: string) {
    const conversation = await this.conversation(conversationId);
    if (conversation.status !== 'OPEN' || !expectedIdentityId
      || conversation.globalIdentityId !== expectedIdentityId
      || conversation.businessContact?.linkStatus === 'ACTIVE') {
      throw new ConflictException('Identidade ou situação da conversa mudou; vínculo não concluído.');
    }
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(requestId)) throw new BadRequestException('Pedido de vínculo inválido.');
    return this.execute('completeLinkRequest', {
      globalIdentityId: conversation.globalIdentityId,
      requestId,
    });
  }

  async requestCustomerLink(user: AuthenticatedUser, conversationId: string, customerId: string) {
    const [conversation, ixc] = await Promise.all([
      this.conversation(conversationId),
      this.activeIxcConnection(),
    ]);
    const identification = await this.connections.execute(ixc.id, 'cliente.identificacao', { customerId }) as {
      data?: Array<{ name?: unknown }>;
    };
    const customerName = identification.data?.[0]?.name;
    if (typeof customerName !== 'string' || !customerName.trim()) {
      throw new BadRequestException('Não foi encontrado um cliente IXC ativo para esse código.');
    }
    await this.execute('linkContactDirectly', {
      globalIdentityId: conversation.globalIdentityId,
      customerRef: `ixc:${ixc.id}:${customerId}`,
      customerDisplayName: customerName.trim(),
      actorRef: this.actor(user),
    });
    return {
      customerName: customerName.trim(),
    };
  }

  async unlinkCustomer(user: AuthenticatedUser, conversationId: string) {
    const conversation = await this.conversation(conversationId);
    await this.execute('disconnectContactDirectly', {
      globalIdentityId: conversation.globalIdentityId,
      actorRef: this.actor(user),
    });
    return { unlinked: true };
  }

  async completeCustomerLink(user: AuthenticatedUser, conversationId: string, requestId: string) {
    const conversation = await this.conversation(conversationId);
    await this.execute('completeLinkRequest', {
      requestId,
      globalIdentityId: conversation.globalIdentityId,
      actorRef: this.actor(user),
    });
    return { completed: true };
  }
}
