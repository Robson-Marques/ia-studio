// Orquestrador WhatsApp: resolve Meta oficial (Nivoo) ou WAHA por critérios
// locais (ID, tag, departamento, padrão e prioridade).
//   1) criteria.connectionId explicito;
//   2) tag/departamento (Connection.tags / config.department);
//   3) conexao padrao (config.is_default);
//   4) maior priority entre as ACTIVE.
// Todo envio passa pelo ConnectionsService.execute (Provider Registry →
// IntegrationLog + last_used_at).
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CommMessageDirection, Connection, ConnectionStatus } from '@prisma/client';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { WhatsappChatsRepository } from './whatsapp-chats.repository';
import { normalizePhone } from './whatsapp.helpers';
import {
  RichMessage,
  SendCriteria,
  WindowState,
  computeWindowState,
} from '../../../shared/integration/whatsapp.types';
import {
  WHATSAPP_OFFICIAL_PROVIDER_KEY,
  WHATSAPP_WAHA_PROVIDER_KEY,
  WHATSAPP_PROVIDER_KEYS,
  allowsAutomaticWhatsappSend,
  usesOfficialWhatsappWindow,
} from '../../../shared/integration/whatsapp-provider.constants';
import { encodeWahaMediaRef } from '../../../shared/integration/waha.client';

export const WHATSAPP_PROVIDER_KEY = 'whatsapp-nivoo';

export interface OrchestratorSendArgs {
  phone: string;
  criteria?: SendCriteria;
  /** Quem enviou (gravado na mensagem): 'user:<id>' | 'bot' | 'system'. */
  sender?: string;
}

export interface OrchestratorSendResult {
  wamid: string | null;
  connectionId: string;
  chatId: string | null;
  jobId?: string;
}

@Injectable()
export class WhatsappOrchestratorService {
  private readonly logger = new Logger(WhatsappOrchestratorService.name);

  constructor(
    private readonly connections: ConnectionsService,
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly chats: WhatsappChatsRepository,
  ) {}

  // ─── Resolucao de conexao (o fluxo nunca conhece o numero) ──────────

  async resolveConnection(criteria?: SendCriteria): Promise<Connection> {
    const all = await this.connectionsRepository.findAll({
      providerKeys: [...WHATSAPP_PROVIDER_KEYS],
    });
    const active = all.filter((c) => {
      const config = c.config as Record<string, unknown>;
      if (c.status !== ConnectionStatus.ACTIVE) return false;
      if (c.provider_key === WHATSAPP_WAHA_PROVIDER_KEY) return true;
      return c.provider_key === WHATSAPP_OFFICIAL_PROVIDER_KEY &&
        !!config['remote_connection_id'] && config['remote_owned'] === true;
    });
    if (active.length === 0) {
      throw new BadRequestException('Nenhuma conexão WhatsApp ativa nesta instância. Conecte um número primeiro.');
    }

    // 1) Conexao explicita.
    if (criteria?.connectionId) {
      const found = active.find((c) => c.id === criteria.connectionId);
      if (!found) throw new BadRequestException('Conexão WhatsApp informada não está ativa nesta instância.');
      if (!allowsAutomaticWhatsappSend(found)) {
        throw new BadRequestException('Esta conexão WAHA não está habilitada para envios automáticos.');
      }
      return found;
    }

    // Conexão WAHA só participa de disparos sem conexão explícita quando o
    // usuário habilitou automações assumindo o risco do canal não oficial.
    const routable = active.filter(allowsAutomaticWhatsappSend);
    if (routable.length === 0) {
      throw new BadRequestException('Nenhuma conexão WhatsApp está habilitada para envios automáticos.');
    }

    // 2) Tag / departamento.
    const wanted = (criteria?.tag ?? criteria?.department ?? '').trim().toLowerCase();
    if (wanted) {
      const byTag = routable.find((c) => {
        const config = (c.config ?? {}) as Record<string, unknown>;
        const department = typeof config['department'] === 'string' ? (config['department'] as string) : '';
        return (
          c.tags.some((t) => t.trim().toLowerCase() === wanted) ||
          department.trim().toLowerCase() === wanted
        );
      });
      if (byTag) return byTag;
      this.logger.warn(`Nenhuma conexão com tag/departamento "${wanted}" — caindo no padrão/prioridade.`);
    }

    // 3) Conexao padrao do ambiente.
    const byDefault = routable.find((c) => {
      const config = (c.config ?? {}) as Record<string, unknown>;
      return config['is_default'] === 'sim' || config['is_default'] === true;
    });
    if (byDefault) return byDefault;

    // 4) Maior prioridade (findAllByOrg ja ordena priority desc).
    return routable[0];
  }

  // ─── Envio (RichMessage → Central via Provider Registry) ──────────

  async send(args: OrchestratorSendArgs, message: RichMessage): Promise<OrchestratorSendResult> {
    const connection = await this.resolveConnection(args.criteria);
    return this.sendViaConnection(connection, args.phone, message, args.sender ?? 'system');
  }

  /** Envio quando a conexao ja e conhecida (ex.: resposta numa conversa). */
  async sendViaConnection(
    connection: Connection,
    rawPhone: string,
    message: RichMessage,
    sender = 'system',
  ): Promise<OrchestratorSendResult> {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new BadRequestException('Telefone de destino inválido.');

    const { operation, params } = this.toOperation(phone, message);
    const result = (await this.connections.execute(connection.id, operation, params)) as { wamid?: string | null; job_id?: string };

    if (connection.provider_key === WHATSAPP_WAHA_PROVIDER_KEY) {
      const responseChatId = result.wamid?.match(/(?:true|false)_([^_]+@(?:c\.us|lid))_/i)?.[1]
        ?? `${phone}@c.us`;
      const chat = await this.chats.upsertChat({
        connectionId: connection.id,
        phone,
        lastMessage: this.preview(message),
        direction: CommMessageDirection.OUTGOING,
      });
      await this.chats.createMessage({
        chat_id: chat.id,
        connection_id: connection.id,
        external_id: result.wamid ?? null,
        direction: CommMessageDirection.OUTGOING,
        sender,
        type: message.kind === 'template' ? 'template' : message.kind === 'text' ? 'text' : message.kind,
        content: this.preview(message),
        media: ['image', 'audio', 'video', 'document'].includes(message.kind)
          ? {
              ...(result.wamid ? { media_id: encodeWahaMediaRef(responseChatId, result.wamid) } : {}),
              ...((message as { url?: string }).url ? { url: (message as { url: string }).url } : {}),
              ...((message as { caption?: string }).caption ? { caption: (message as { caption: string }).caption } : {}),
              ...((message as { filename?: string }).filename ? { filename: (message as { filename: string }).filename } : {}),
            }
          : undefined,
        status: 'sent',
      });
      return { wamid: result.wamid ?? null, connectionId: connection.id, chatId: chat.id };
    }

    if (!result?.job_id) throw new BadRequestException('A Central não confirmou o enfileiramento da mensagem.');

    let chat: Awaited<ReturnType<WhatsappChatsRepository['findChatByConnectionPhone']>> = null;
    // O POST já foi aceito. Falha local de persistência não pode induzir o
    // operador/automação a repetir o envio e duplicar a mensagem na Central.
    try {
      chat = await this.chats.findChatByConnectionPhone(connection.id, phone);
      await this.chats.recordCentralJob(result.job_id, connection.id, chat?.remote_chat_id ? chat.id : null);
      if (chat?.remote_chat_id) {
        await this.chats.createMessage({
          chat_id: chat.id,
          connection_id: connection.id,
          remote_job_id: result.job_id,
          direction: CommMessageDirection.OUTGOING,
          sender,
          type: message.kind === 'template' ? 'template' : message.kind === 'text' ? 'text' : message.kind,
          content: this.preview(message),
          status: 'queued',
        });
      }
    } catch (error) {
      this.logger.error(`A Central aceitou o job ${result.job_id}, mas o registro local falhou: ${(error as Error).message}`);
    }
    return { wamid: null, connectionId: connection.id, chatId: chat?.remote_chat_id ? chat.id : null, jobId: result.job_id };
  }

  // ─── Lida (tick azul) + digitando ──────────────────────────────────
  // A Central marca a conversa como lida e, com typing=true, solicita o
  // indicador de digitação. Falhas são registradas sem interromper a leitura.

  async markRead(
    connectionId: string,
    messageId: string,
    opts?: { typing?: boolean },
  ): Promise<void> {
    if (!messageId) return;
    const connection = await this.connectionsRepository.findById(connectionId);
    if (connection?.provider_key === WHATSAPP_WAHA_PROVIDER_KEY) {
      try {
        await this.connections.execute(connectionId, 'markRead', {
          message_id: messageId,
          typing: opts?.typing === true,
        });
      } catch (e) {
        this.logger.warn(`Não foi possível marcar a conversa como lida na WAHA: ${(e as Error).message}`);
      }
      return;
    }
    const message = await this.chats.findMessageByExternalId(messageId);
    const chat = message ? await this.chats.findChatById(message.chat_id) : null;
    if (!chat?.remote_chat_id || chat.connection_id !== connectionId) return;
    try {
      await this.connections.execute(connectionId, 'markRead', {
        remote_chat_id: chat.remote_chat_id,
        typing: opts?.typing === true,
      });
    } catch (e) {
      this.logger.warn(`Não foi possível marcar a conversa como lida na Central: ${(e as Error).message}`);
    }
  }

  /** Como markRead, resolvendo a última mensagem incoming (wamid) do chat. */
  async markReadByChat(chatId: string, opts?: { typing?: boolean }): Promise<void> {
    const chat = await this.chats.findChatById(chatId);
    if (!chat) return;
    const connection = await this.connectionsRepository.findById(chat.connection_id);
    if (connection?.provider_key === WHATSAPP_WAHA_PROVIDER_KEY) {
      const anchor = await this.chats.findLastIncomingAnchor(chatId).catch(() => null);
      if (anchor) await this.markRead(anchor.connection_id, anchor.external_id, opts);
      return;
    }
    if (!chat?.remote_chat_id) return;
    try {
      await this.connections.execute(chat.connection_id, 'markRead', {
        remote_chat_id: chat.remote_chat_id,
        typing: opts?.typing === true,
      });
    } catch (e) {
      this.logger.warn(`Não foi possível marcar a conversa como lida na Central: ${(e as Error).message}`);
    }
  }

  // ─── Janela de 24h ──────────────────────────────────

  async windowState(connectionId: string, rawPhone: string): Promise<WindowState> {
    const connection = await this.connectionsRepository.findById(connectionId);
    if (connection && !usesOfficialWhatsappWindow(connection.provider_key)) return 'within';
    const chat = await this.chats.findChatByConnectionPhone(connectionId, normalizePhone(rawPhone));
    return computeWindowState(chat?.last_inbound_at ?? null);
  }

  // ─── Helpers privados ───────────────────────────────

  private toOperation(phone: string, message: RichMessage): { operation: string; params: unknown } {
    switch (message.kind) {
      case 'text':
        return { operation: 'sendText', params: { to: phone, body: message.body } };
      case 'template':
        return {
          operation: 'sendTemplate',
          params: { to: phone, name: message.name, language: message.language, variables: message.variables },
        };
      case 'image':
      case 'audio':
      case 'video':
      case 'document':
        return {
          operation: 'sendMedia',
          params: {
            to: phone,
            kind: message.kind,
            url: message.url,
            media_id: message.mediaId,
            data: message.data,
            mime_type: message.mimeType,
            caption: message.caption,
            filename: message.filename,
            voice: message.voice === true,
          },
        };
      default:
        throw new BadRequestException('Este formato de mensagem não é aceito pela conexão WhatsApp.');
    }
  }

  private preview(message: RichMessage): string {
    switch (message.kind) {
      case 'text':
        return message.body;
      case 'template':
        return `[modelo: ${message.name}]`;
      case 'image':
        return message.caption ?? '[Imagem]';
      case 'video':
        return message.caption ?? '[Vídeo]';
      case 'audio':
        return '[Áudio]';
      case 'document':
        return message.caption ?? message.filename ?? '[Documento]';
      case 'cta_url':
      case 'reply_buttons':
      case 'list':
        return message.body;
      default:
        return '[mensagem]';
    }
  }
}
