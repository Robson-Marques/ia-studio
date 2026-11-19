import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { ConnectchatConversation, ConnectchatMention } from '../../../shared/integration/connectchat.client';
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

  async listConversations() {
    const conversations = await this.execute('listConversations') as ConnectchatConversation[];
    return Promise.all(conversations.map((conversation) => this.presentConversation(conversation)));
  }

  private async presentConversation(conversation: ConnectchatConversation) {
    const customerDisplayName = await this.resolveCustomerDisplayName(conversation.customerRef);
    // Vínculos anteriores ao retrato comercial não carregam o nome seguro que
    // a PWA apresenta. Ao consultar a Central, completa-se esse único campo
    // diretamente no ConnectChat; nas próximas leituras não há nova gravação.
    if (
      customerDisplayName
      && conversation.customerRef
      && conversation.globalIdentityId
      && conversation.businessContact?.customerDisplayName !== customerDisplayName
    ) {
      await this.execute('linkContactDirectly', {
        globalIdentityId: conversation.globalIdentityId,
        customerRef: conversation.customerRef,
        customerDisplayName,
      });
      if (conversation.businessContact) conversation.businessContact.customerDisplayName = customerDisplayName;
    }
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
   * Uso interno da bancada: retorna apenas o vínculo IXC autenticado que a
   * Central já registrou. Nunca expõe customerRef ou ID de conexão ao browser.
   * O nome/status de interface não substitui o customerRef validado.
   */
  async pilotIxcCustomer(conversationId: string): Promise<{
    connectionId: string; customerId: string;
  } | null> {
    const conversations = await this.execute('listConversations') as ConnectchatConversation[];
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) throw new BadRequestException('Conversa não encontrada.');
    if (conversation.businessContact?.status !== 'CUSTOMER'
      || conversation.businessContact.linkStatus !== 'ACTIVE') return null;
    const match = /^ixc:([0-9a-f-]{36}):([1-9]\\d*)$/i.exec(conversation.customerRef || '');
    if (!match) return null;
    const connection = await this.connections.findById(match[1]).catch(() => null);
    if (!connection || connection.provider_key !== 'ixc' || connection.status !== 'ACTIVE') return null;
    return { connectionId: connection.id, customerId: match[2] };
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
