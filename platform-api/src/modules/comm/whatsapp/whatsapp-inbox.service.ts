// Inbox de conversas: listagem com escopo de visibilidade (abas Minhas /
// Não atribuídas / Minha Equipe / Todas), mensagens, envio (reply gate +
// janela de 24h + orchestrator) e proxy de midia inbound (download da Meta).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommChatStatus, Connection, Prisma, WhatsappChat, WhatsappMessage } from '@prisma/client';
import { WhatsappChatsRepository } from './whatsapp-chats.repository';
import { WhatsappOrchestratorService, WHATSAPP_PROVIDER_KEY } from './whatsapp-orchestrator.service';
import { ChatScopeResolver, AttendanceScope } from '../attendance/chat-scope.resolver';
import { ReplyGateService } from '../attendance/reply-gate.service';
import { AttendanceRepository } from '../attendance/attendance.repository';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { MetaApiError, META_REENGAGEMENT_CODE } from '../../../shared/integration/meta-graph.client';
import { RichMessage, WindowState, computeWindowState } from '../../../shared/integration/whatsapp.types';
import { SendChatMessageDto } from '../dto/send-chat-message.dto';

export type ChatTab = 'mine' | 'unassigned' | 'team' | 'all';

export interface ChatView extends WhatsappChat {
  current_handler_name?: string | null;
}

export interface ListChatsArgs {
  organizationId: string;
  user: AuthenticatedUser;
  tab?: ChatTab;
  status?: CommChatStatus;
  environmentId?: string;
  connectionId?: string;
  search?: string;
  take?: number;
  skip?: number;
}

@Injectable()
export class WhatsappInboxService {
  constructor(
    private readonly chats: WhatsappChatsRepository,
    private readonly orchestrator: WhatsappOrchestratorService,
    private readonly scopeResolver: ChatScopeResolver,
    private readonly replyGate: ReplyGateService,
    private readonly attendance: AttendanceRepository,
    private readonly connections: ConnectionsService,
    private readonly connectionsRepository: ConnectionsRepository,
  ) {}

  // ─── Escopo (a UI monta as abas a partir daqui) ─────

  resolveScope(user: AuthenticatedUser): Promise<AttendanceScope> {
    return this.scopeResolver.resolve(user);
  }

  // ─── Listagem ───────────────────────────────────────

  async listChats(args: ListChatsArgs): Promise<{ items: ChatView[]; total: number }> {
    const scope = await this.scopeResolver.resolve(args.user);
    const tab = args.tab ?? 'mine';

    // Recorte da aba escolhida + recorte de visibilidade das perms.
    const combined = this.buildTabVisibilityWhere(scope, tab);

    const { items, total } = await this.chats.listChats({
      organizationId: args.organizationId,
      environmentId: args.environmentId,
      status: args.status,
      connectionId: args.connectionId,
      search: args.search,
      visibilityWhere: combined as never,
      take: args.take,
      skip: args.skip,
    });

    // Enriquecimento: nome de quem atende (lookup batch — sem N+1).
    const handlerIds = Array.from(
      new Set(items.filter((c) => c.current_handler_type === 'USER' && c.current_handler_id).map((c) => c.current_handler_id as string)),
    );
    const names = await this.attendance.userNames(handlerIds);
    const views: ChatView[] = items.map((c) => ({
      ...c,
      current_handler_name:
        c.current_handler_type === 'USER' && c.current_handler_id ? (names.get(c.current_handler_id) ?? null) : null,
    }));
    return { items: views, total };
  }

  /**
   * Compoe o WHERE de uma aba (recorte da aba + visibilidade do escopo) — a
   * MESMA logica usada pela listagem, reaproveitada aqui pra contagem.
   */
  private buildTabVisibilityWhere(scope: AttendanceScope, tab: ChatTab): Prisma.WhatsappChatWhereInput | undefined {
    let tabWhere: Prisma.WhatsappChatWhereInput | undefined;
    if (tab === 'mine') {
      tabWhere = { current_handler_type: 'USER', current_handler_id: scope.userId };
    } else if (tab === 'unassigned') {
      tabWhere = { current_handler_id: null };
    } else if (tab === 'team') {
      tabWhere = scope.myTeamIds.length ? { team_id: { in: scope.myTeamIds } } : { id: '__none__' };
    }
    const visibilityWhere = this.scopeResolver.buildVisibilityWhere(scope);
    return tabWhere && visibilityWhere
      ? { AND: [tabWhere, visibilityWhere] }
      : (tabWhere ?? visibilityWhere);
  }

  /**
   * Contagem por aba (Minhas / Não atribuídas / Minha Equipe / Todas) sob o
   * escopo de visibilidade do ator — respeita os filtros status/search. Cada
   * contagem usa exatamente o mesmo WHERE que a aba correspondente na listagem.
   */
  async countChatsByScope(
    organizationId: string,
    user: AuthenticatedUser,
    opts: { status?: CommChatStatus; search?: string; environmentId?: string; connectionId?: string } = {},
  ): Promise<{ mine: number; unassigned: number; team: number; all: number }> {
    const scope = await this.scopeResolver.resolve(user);
    const tabs: ChatTab[] = ['mine', 'unassigned', 'team', 'all'];
    const [mine, unassigned, team, all] = await Promise.all(
      tabs.map((tab) =>
        this.chats.countChats({
          organizationId,
          environmentId: opts.environmentId,
          status: opts.status,
          connectionId: opts.connectionId,
          search: opts.search,
          visibilityWhere: this.buildTabVisibilityWhere(scope, tab) as never,
        }),
      ),
    );
    return { mine, unassigned, team, all };
  }

  async getChat(organizationId: string, chatId: string): Promise<ChatView> {
    const chat = await this.chats.findChatById(chatId);
    if (!chat || chat.organization_id !== organizationId) throw new NotFoundException('Conversa não encontrada.');
    let handlerName: string | null = null;
    if (chat.current_handler_type === 'USER' && chat.current_handler_id) {
      const names = await this.attendance.userNames([chat.current_handler_id]);
      handlerName = names.get(chat.current_handler_id) ?? null;
    }
    return { ...chat, current_handler_name: handlerName };
  }

  async listMessages(organizationId: string, chatId: string, take = 50, before?: string): Promise<WhatsappMessage[]> {
    await this.getChat(organizationId, chatId); // ownership
    const beforeDate = before ? new Date(before) : undefined;
    const messages = await this.chats.listMessages(chatId, take, beforeDate);
    return messages.reverse(); // ordem cronologica pra UI
  }

  async markRead(organizationId: string, chatId: string): Promise<WhatsappChat> {
    await this.getChat(organizationId, chatId);
    return this.chats.markRead(chatId);
  }

  // ─── Janela de 24h ──────────────────────────────────

  async windowState(organizationId: string, chatId: string): Promise<{ state: WindowState; expires_at: string | null }> {
    const chat = await this.getChat(organizationId, chatId);
    const state = computeWindowState(chat.last_inbound_at);
    const expiresAt = chat.last_inbound_at
      ? new Date(chat.last_inbound_at.getTime() + 24 * 60 * 60 * 1000).toISOString()
      : null;
    return { state, expires_at: expiresAt };
  }

  // ─── Envio (reply gate + janela + orchestrator) ─────

  async send(
    organizationId: string,
    user: AuthenticatedUser,
    chatId: string,
    dto: SendChatMessageDto,
  ): Promise<{ wamid: string | null; via: 'text' | 'media' | 'template' }> {
    const chat = await this.getChat(organizationId, chatId);
    const scope = await this.scopeResolver.resolve(user);

    // Reply gate: claim implicito / takeover confirmado / 403 / 409.
    await this.replyGate.assertCanReply(organizationId, chat, scope, dto.confirm_takeover === true);

    const message = this.buildRichMessage(dto);
    const via: 'text' | 'media' | 'template' =
      message.kind === 'template' ? 'template' : message.kind === 'text' ? 'text' : 'media';

    // Janela de 24h: texto livre/midia manual so DENTRO da janela (template
    // aprovado e o caminho fora dela — a UI ja avisa e sugere).
    if (via !== 'template') {
      const state = computeWindowState(chat.last_inbound_at);
      if (state !== 'within') {
        throw new ConflictException(
          'Janela de 24h expirada — a Meta só aceita template aprovado. Selecione um template para reabrir a conversa.',
        );
      }
    }

    const connection = await this.loadChatConnection(organizationId, chat);
    try {
      const result = await this.orchestrator.sendViaConnection(connection, chat.phone, message, `user:${user.sub}`);
      // SLA: primeira resposta humana (idempotente — so grava se null).
      if (!chat.first_response_at) {
        await this.chats
          .updateChatConditional(chat.id, { first_response_at: null }, { first_response_at: new Date() })
          .catch(() => 0);
      }
      return { wamid: result.wamid, via };
    } catch (err) {
      if (err instanceof MetaApiError && err.metaCode === META_REENGAGEMENT_CODE) {
        // Backstop 131047: nossa janela estava desatualizada.
        throw new ConflictException(
          'A Meta recusou o texto livre (janela de 24h expirada). Use um template aprovado.',
        );
      }
      if (err instanceof MetaApiError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  // ─── Midia inbound (proxy de download da Meta) ──────

  async downloadMedia(
    organizationId: string,
    chatId: string,
    mediaId: string,
  ): Promise<{ base64: string; mime: string }> {
    const chat = await this.getChat(organizationId, chatId);
    const result = (await this.connections.execute(organizationId, chat.connection_id, 'downloadMedia', {
      media_id: mediaId,
    })) as { base64: string; mime: string } | null;
    if (!result) throw new NotFoundException('Mídia não encontrada na Meta (pode ter expirado).');
    return result;
  }

  // ─── Helpers privados ───────────────────────────────

  private buildRichMessage(dto: SendChatMessageDto): RichMessage {
    if (dto.template?.name) {
      return {
        kind: 'template',
        name: dto.template.name,
        language: dto.template.language ?? 'pt_BR',
        variables: dto.template.variables,
      };
    }
    if (dto.media?.url) {
      return {
        kind: dto.media.kind,
        url: dto.media.url,
        caption: dto.media.caption,
        filename: dto.media.filename,
      };
    }
    const text = (dto.text ?? '').trim();
    if (!text) throw new BadRequestException('Informe o texto, a mídia ou o template da mensagem.');
    return { kind: 'text', body: text };
  }

  private async loadChatConnection(organizationId: string, chat: WhatsappChat): Promise<Connection> {
    const connection = await this.connectionsRepository.findById(chat.connection_id);
    if (!connection || connection.organization_id !== organizationId || connection.provider_key !== WHATSAPP_PROVIDER_KEY) {
      throw new NotFoundException('Conexão da conversa não encontrada.');
    }
    if (connection.status !== 'ACTIVE') {
      throw new ConflictException('A conexão WhatsApp desta conversa não está ativa. Verifique em WhatsApp → Números.');
    }
    return connection;
  }
}
