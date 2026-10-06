import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { ConnectchatClient, ConnectchatMention } from '../../../shared/integration/connectchat.client';

@Injectable()
export class ConnectchatInboxService {
  private client(): ConnectchatClient {
    return new ConnectchatClient();
  }

  private actor(user: AuthenticatedUser): string {
    return `ystudio:user:${user.sub}`;
  }

  health() {
    return this.client().health();
  }

  listConversations() {
    return this.client().listConversations();
  }

  getMessages(conversationId: string, afterSequence?: string, limit?: number) {
    if (afterSequence !== undefined && !/^\d+$/.test(afterSequence)) {
      throw new BadRequestException('A sequência de mensagens é inválida.');
    }
    const safeLimit = Number.isInteger(limit) && limit! >= 1 && limit! <= 100 ? limit! : 50;
    return this.client().getMessages(conversationId, afterSequence ?? '0', safeLimit);
  }

  send(user: AuthenticatedUser, input: {
    conversationId: string;
    body: string;
    clientMessageId: string;
    replyToMessageId?: string;
    mentions?: ConnectchatMention[];
  }) {
    if (!input.body.trim()) throw new BadRequestException('Escreva a mensagem antes de enviar.');
    return this.client().sendMessage({ ...input, body: input.body.trim(), actorRef: this.actor(user) });
  }

  edit(user: AuthenticatedUser, messageId: string, body: string) {
    if (!body.trim()) throw new BadRequestException('A mensagem não pode ficar vazia.');
    return this.client().editMessage(messageId, body.trim(), this.actor(user));
  }

  markRead(user: AuthenticatedUser, conversationId: string, sequence: string) {
    return this.client().acknowledgeRead(conversationId, sequence, this.actor(user));
  }

  markDelivered(user: AuthenticatedUser, conversationId: string, sequence: string) {
    return this.client().acknowledgeDelivered(conversationId, sequence, this.actor(user));
  }
}
