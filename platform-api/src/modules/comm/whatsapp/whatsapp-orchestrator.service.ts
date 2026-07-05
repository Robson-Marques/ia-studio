// Meta Orchestrator (spec "Connection Wizard Meta"): o chamador NUNCA conhece
// o numero. Pede organization/workspace/ambiente + criterios (tag/departamento/
// conexao/prioridade) e o orchestrator resolve a Connection whatsapp-meta:
//   1) criteria.connectionId explicito;
//   2) tag/departamento (Connection.tags / config.department);
//   3) conexao padrao (config.is_default);
//   4) maior priority entre as ACTIVE.
// Todo envio passa pelo ConnectionsService.execute (Provider Registry →
// IntegrationLog + last_used_at) e registra consumo 'whatsapp_messages'.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CommMessageDirection, Connection, ConnectionStatus } from '@prisma/client';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { UsageService } from '../../licensing/usage.service';
import { WhatsappChatsRepository } from './whatsapp-chats.repository';
import { normalizePhone } from './whatsapp.helpers';
import {
  RichMessage,
  SendCriteria,
  WindowState,
  computeWindowState,
} from '../../../shared/integration/whatsapp.types';

export const WHATSAPP_PROVIDER_KEY = 'whatsapp-meta';

export interface OrchestratorScope {
  organizationId: string;
  workspaceId?: string;
  environmentId?: string;
}

export interface OrchestratorSendArgs extends OrchestratorScope {
  phone: string;
  criteria?: SendCriteria;
  /** Quem enviou (gravado na mensagem): 'user:<id>' | 'bot' | 'system'. */
  sender?: string;
}

export interface OrchestratorSendResult {
  wamid: string | null;
  connectionId: string;
  chatId: string;
}

@Injectable()
export class WhatsappOrchestratorService {
  private readonly logger = new Logger(WhatsappOrchestratorService.name);

  constructor(
    private readonly connections: ConnectionsService,
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly chats: WhatsappChatsRepository,
    private readonly usage: UsageService,
  ) {}

  // ─── Resolucao de conexao (o fluxo nunca conhece o numero) ──────────

  async resolveConnection(scope: OrchestratorScope, criteria?: SendCriteria): Promise<Connection> {
    const all = await this.connectionsRepository.findAllByOrg(scope.organizationId, {
      providerKey: WHATSAPP_PROVIDER_KEY,
      workspaceId: scope.workspaceId,
      environmentId: scope.environmentId,
    });
    const active = all.filter((c) => c.status === ConnectionStatus.ACTIVE);
    if (active.length === 0) {
      throw new BadRequestException('Nenhuma conexão WhatsApp ativa neste escopo. Conecte um número primeiro.');
    }

    // 1) Conexao explicita.
    if (criteria?.connectionId) {
      const found = active.find((c) => c.id === criteria.connectionId);
      if (!found) throw new BadRequestException('Conexão WhatsApp informada não está ativa neste escopo.');
      return found;
    }

    // 2) Tag / departamento.
    const wanted = (criteria?.tag ?? criteria?.department ?? '').trim().toLowerCase();
    if (wanted) {
      const byTag = active.find((c) => {
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
    const byDefault = active.find((c) => {
      const config = (c.config ?? {}) as Record<string, unknown>;
      return config['is_default'] === 'sim' || config['is_default'] === true;
    });
    if (byDefault) return byDefault;

    // 4) Maior prioridade (findAllByOrg ja ordena priority desc).
    return active[0];
  }

  // ─── Envio (RichMessage → Cloud API via Provider Registry) ──────────

  async send(args: OrchestratorSendArgs, message: RichMessage): Promise<OrchestratorSendResult> {
    const connection = await this.resolveConnection(args, args.criteria);
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
    const result = (await this.connections.execute(
      connection.organization_id,
      connection.id,
      operation,
      params,
    )) as { wamid?: string | null };

    // A Meta NAO ecoa o outbound — grava na inbox pra conversa refletir o envio.
    const chat = await this.chats.upsertChat({
      organizationId: connection.organization_id,
      workspaceId: connection.workspace_id,
      environmentId: connection.environment_id,
      connectionId: connection.id,
      phone,
      lastMessage: this.preview(message),
      direction: CommMessageDirection.OUTGOING,
    });
    await this.chats.createMessage({
      organization_id: connection.organization_id,
      chat_id: chat.id,
      connection_id: connection.id,
      external_id: result?.wamid ?? null,
      direction: CommMessageDirection.OUTGOING,
      sender,
      type: message.kind === 'template' ? 'template' : message.kind === 'text' ? 'text' : message.kind,
      content: this.preview(message),
      media: ['image', 'audio', 'video', 'document'].includes(message.kind)
        ? {
            // media_id (upload direto) permite a UI baixar o outbound por base64;
            // url fica pro caso legado de link publico.
            media_id: (message as { mediaId?: string }).mediaId,
            url: (message as { url?: string }).url,
            caption: (message as { caption?: string }).caption,
            filename: (message as { filename?: string }).filename,
          }
        : undefined,
      status: 'sent',
    });

    // Metering (diretriz 40): todo outbound conta 'whatsapp_messages'.
    await this.usage.increment(connection.organization_id, connection.workspace_id, 'whatsapp_messages');

    return { wamid: result?.wamid ?? null, connectionId: connection.id, chatId: chat.id };
  }

  // ─── Janela de 24h ──────────────────────────────────

  async windowState(connectionId: string, rawPhone: string): Promise<WindowState> {
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
            caption: message.caption,
            filename: message.filename,
          },
        };
      default:
        return { operation: 'sendRich', params: { to: phone, message } };
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
