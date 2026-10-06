import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { ConnectchatMention } from '../../../shared/integration/connectchat.client';
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

  private actor(user: AuthenticatedUser): string {
    return `ystudio:user:${user.sub}`;
  }

  async health() {
    return this.connections.test(await this.connectionId());
  }

  listConversations() {
    return this.execute('listConversations');
  }

  getMessages(conversationId: string, afterSequence?: string, limit?: number) {
    if (afterSequence !== undefined && !/^\d+$/.test(afterSequence)) {
      throw new BadRequestException('A sequência de mensagens é inválida.');
    }
    const safeLimit = Number.isInteger(limit) && limit! >= 1 && limit! <= 100 ? limit! : 50;
    return this.execute('getMessages', { conversationId, afterSequence: afterSequence ?? '0', limit: safeLimit });
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

  edit(user: AuthenticatedUser, messageId: string, body: string) {
    if (!body.trim()) throw new BadRequestException('A mensagem não pode ficar vazia.');
    return this.execute('editMessage', { messageId, body: body.trim(), actorRef: this.actor(user) });
  }

  markRead(user: AuthenticatedUser, conversationId: string, sequence: string) {
    return this.execute('acknowledgeRead', { conversationId, sequence, actorRef: this.actor(user) });
  }

  markDelivered(user: AuthenticatedUser, conversationId: string, sequence: string) {
    return this.execute('acknowledgeDelivered', { conversationId, sequence, actorRef: this.actor(user) });
  }
}
