// Inbox de conversas: listagem com escopo de visibilidade (abas Minhas /
// Não atribuídas / Minha Equipe / Todas), mensagens, envio (reply gate +
// janela de 24h + orchestrator) e proxy de midia inbound (download da Meta).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CommChatStatus, CommMessageDirection, Connection, Prisma, WhatsappChat, WhatsappMessage } from '@prisma/client';
import { WhatsappChatsRepository } from './whatsapp-chats.repository';
import { WhatsappOrchestratorService, WHATSAPP_PROVIDER_KEY } from './whatsapp-orchestrator.service';
import { ChatScopeResolver, AttendanceScope } from '../attendance/chat-scope.resolver';
import { ReplyGateService } from '../attendance/reply-gate.service';
import { AttendanceRepository } from '../attendance/attendance.repository';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import {
  MetaApiError,
  META_MEDIA_LIMITS,
  META_REENGAGEMENT_CODE,
} from '../../../shared/integration/meta-graph.client';
import { RichMessage, WindowState, computeWindowState } from '../../../shared/integration/whatsapp.types';
import { SendChatMessageDto } from '../dto/send-chat-message.dto';

export type MediaKind = 'image' | 'audio' | 'video' | 'document';

export interface UploadMediaArgs {
  kind: MediaKind;
  data: Buffer;
  mimeType: string;
  filename: string;
  caption?: string;
  confirmTakeover?: boolean;
}

export type ChatTab = 'mine' | 'unassigned' | 'ia' | 'team' | 'all';

export interface ChatView extends WhatsappChat {
  current_handler_name?: string | null;
}

export interface ListChatsArgs {
  user: AuthenticatedUser;
  tab?: ChatTab;
  status?: CommChatStatus;
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
        c.current_handler_type === 'USER' && c.current_handler_id
          ? (names.get(c.current_handler_id) ?? null)
          : c.current_handler_type === 'BOT'
            ? 'IA'
            : null,
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
      // "Aguardando" = ninguém atendendo (nem humano nem IA) → fila do humano.
      tabWhere = { current_handler_id: null };
    } else if (tab === 'ia') {
      // Conversas que a IA está conduzindo — separadas pra não confundir a fila.
      tabWhere = { current_handler_type: 'BOT' };
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
    user: AuthenticatedUser,
    opts: { status?: CommChatStatus; search?: string; connectionId?: string } = {},
  ): Promise<{ mine: number; unassigned: number; ia: number; team: number; all: number }> {
    const scope = await this.scopeResolver.resolve(user);
    const tabs: ChatTab[] = ['mine', 'unassigned', 'ia', 'team', 'all'];
    const [mine, unassigned, ia, team, all] = await Promise.all(
      tabs.map((tab) =>
        this.chats.countChats({
          status: opts.status,
          connectionId: opts.connectionId,
          search: opts.search,
          visibilityWhere: this.buildTabVisibilityWhere(scope, tab) as never,
        }),
      ),
    );
    return { mine, unassigned, ia, team, all };
  }

  async getChat(chatId: string): Promise<ChatView> {
    const chat = await this.chats.findChatById(chatId);
    if (!chat) throw new NotFoundException('Conversa não encontrada.');
    let handlerName: string | null = null;
    if (chat.current_handler_type === 'BOT') {
      handlerName = 'IA';
    } else if (chat.current_handler_type === 'USER' && chat.current_handler_id) {
      const names = await this.attendance.userNames([chat.current_handler_id]);
      handlerName = names.get(chat.current_handler_id) ?? null;
    }
    return { ...chat, current_handler_name: handlerName };
  }

  /** Vincula o cliente (titular do cadastro) a este WhatsApp — grava o CPF/ref/
   *  nome no chat. Trocável: outro CPF re-vincula. Usado pela tool da IA. */
  async linkCustomer(
    chatId: string,
    data: { document?: string | null; ref?: string | null; name?: string | null },
  ): Promise<WhatsappChat> {
    await this.getChat(chatId);
    return this.chats.updateChat(chatId, {
      linked_customer_document: data.document ?? null,
      linked_customer_ref: data.ref ?? null,
      linked_customer_name: data.name ?? null,
      linked_at: new Date(),
    });
  }

  /** Desvincula o cliente deste WhatsApp (ação do atendente). */
  async unlinkCustomer(chatId: string): Promise<WhatsappChat> {
    await this.getChat(chatId);
    return this.chats.updateChat(chatId, {
      linked_customer_document: null,
      linked_customer_ref: null,
      linked_customer_name: null,
      linked_at: null,
    });
  }

  async listMessages(chatId: string, take = 50, before?: string): Promise<WhatsappMessage[]> {
    await this.getChat(chatId);
    const beforeDate = before ? new Date(before) : undefined;
    const messages = await this.chats.listMessages(chatId, take, beforeDate);
    return messages.reverse(); // ordem cronologica pra UI
  }

  // Último wamid de mensagem RECEBIDA do cliente (ignora as de saída) — usado
  // pelo debounce do assistente pra não se auto-descartar por causa da própria
  // resposta que acabou de enviar. Best-effort.
  async lastIncomingExternalId(chatId: string): Promise<string | null> {
    await this.getChat(chatId);
    const anchor = await this.chats.findLastIncomingAnchor(chatId);
    return anchor?.external_id ?? null;
  }

  async markRead(chatId: string): Promise<WhatsappChat> {
    await this.getChat(chatId);
    // Recibo de leitura no WhatsApp do cliente (tick azul) — sem "digitando"
    // (o atendente só abriu a conversa). Best-effort: nunca quebra a leitura local.
    await this.orchestrator.markReadByChat(chatId, { typing: false }).catch(() => undefined);
    return this.chats.markRead(chatId);
  }

  // Dispara "digitando…" no WhatsApp do cliente enquanto o atendente escreve.
  // A Meta ancora no wamid da última incoming; some ao enviar a resposta ou em
  // ~25s. Best-effort (é UX): devolve {ok} sem lançar.
  async sendTyping(chatId: string): Promise<{ ok: boolean }> {
    await this.getChat(chatId);
    await this.orchestrator.markReadByChat(chatId, { typing: true }).catch(() => undefined);
    return { ok: true };
  }

  // ─── Janela de 24h ──────────────────────────────────

  async windowState(chatId: string): Promise<{ state: WindowState; expires_at: string | null }> {
    const chat = await this.getChat(chatId);
    const state = computeWindowState(chat.last_inbound_at);
    const expiresAt = chat.last_inbound_at
      ? new Date(chat.last_inbound_at.getTime() + 24 * 60 * 60 * 1000).toISOString()
      : null;
    return { state, expires_at: expiresAt };
  }

  // ─── Envio (reply gate + janela + orchestrator) ─────

  async send(
    user: AuthenticatedUser,
    chatId: string,
    dto: SendChatMessageDto,
  ): Promise<{ wamid: string | null; via: 'text' | 'media' | 'template' }> {
    const chat = await this.getChat(chatId);
    const message = this.buildRichMessage(dto);
    const via: 'text' | 'media' | 'template' =
      message.kind === 'template' ? 'template' : message.kind === 'text' ? 'text' : 'media';
    const result = await this.deliver(user, chat, message, dto.confirm_takeover === true, via === 'template');
    return { wamid: result.wamid, via };
  }

  /**
   * Upload de arquivo/audio gravado no aparelho: sobe o binario pra Meta
   * (media_id) e envia pela MESMA porta do texto/midia (reply gate + janela de
   * 24h + takeover 409). Nao duplica a logica de envio — reusa deliver().
   */
  async uploadAndSendMedia(
    user: AuthenticatedUser,
    chatId: string,
    args: UploadMediaArgs,
  ): Promise<{ wamid: string | null; via: 'media' }> {
    const chat = await this.getChat(chatId);
    // Validacao de tamanho por tipo (limites da Cloud API) — erro amigavel.
    const limit = META_MEDIA_LIMITS[args.kind];
    if (args.data.length > limit) {
      const mb = Math.round(limit / (1024 * 1024));
      throw new BadRequestException(
        `Arquivo muito grande para ${args.kind} — o limite da Meta é ${mb} MB.`,
      );
    }
    if (args.data.length === 0) throw new BadRequestException('Arquivo vazio.');

    // Reply gate + janela ANTES do upload (evita subir binario que a Meta
    // recusaria depois). loadChatConnection valida a conexao ativa.
    const scope = await this.scopeResolver.resolve(user);
    await this.replyGate.assertCanReply(chat, scope, args.confirmTakeover === true);
    if (computeWindowState(chat.last_inbound_at) !== 'within') {
      throw new ConflictException(
        'Janela de 24h expirada — a Meta só aceita template aprovado. Selecione um template para reabrir a conversa.',
      );
    }
    const connection = await this.loadChatConnection(chat);

    // Sobe o binario e recebe o media_id (caminho separado do execute()).
    let mediaId: string;
    try {
      const uploaded = await this.connections.uploadMedia(connection.id, {
        data: args.data,
        mimeType: args.mimeType,
        filename: args.filename,
      });
      mediaId = uploaded.media_id;
    } catch (err) {
      if (err instanceof MetaApiError) throw new BadRequestException(err.message);
      throw err;
    }

    const message: RichMessage = {
      kind: args.kind,
      mediaId,
      caption: args.caption,
      filename: args.kind === 'document' ? args.filename : undefined,
    };
    // Reaproveita o mesmo envio (ja passou pelo reply gate/janela acima, mas
    // deliver revalida — barato e mantem uma porta unica de envio).
    const result = await this.deliver(user, chat, message, args.confirmTakeover === true, false);
    return { wamid: result.wamid, via: 'media' };
  }

  /**
   * Porta unica de envio manual numa conversa: reply gate (claim/takeover 409)
   * + janela de 24h + envio via conexao + SLA de 1a resposta. text/midia/template
   * passam por aqui — sem duplicar a logica de 24h/takeover.
   */
  private async deliver(
    user: AuthenticatedUser,
    chat: ChatView,
    message: RichMessage,
    confirmTakeover: boolean,
    isTemplate: boolean,
  ): Promise<{ wamid: string | null }> {
    const scope = await this.scopeResolver.resolve(user);

    // Reply gate: claim implicito / takeover confirmado / 403 / 409.
    await this.replyGate.assertCanReply(chat, scope, confirmTakeover);

    // Janela de 24h: texto livre/midia manual so DENTRO da janela (template
    // aprovado e o caminho fora dela — a UI ja avisa e sugere).
    if (!isTemplate) {
      const state = computeWindowState(chat.last_inbound_at);
      if (state !== 'within') {
        throw new ConflictException(
          'Janela de 24h expirada — a Meta só aceita template aprovado. Selecione um template para reabrir a conversa.',
        );
      }
    }

    const connection = await this.loadChatConnection(chat);
    try {
      const result = await this.orchestrator.sendViaConnection(connection, chat.phone, message, `user:${user.sub}`);
      // SLA: primeira resposta humana (idempotente — so grava se null).
      if (!chat.first_response_at) {
        await this.chats
          .updateChatConditional(chat.id, { first_response_at: null }, { first_response_at: new Date() })
          .catch(() => 0);
      }
      return { wamid: result.wamid };
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
    chatId: string,
    mediaId: string,
  ): Promise<{ base64: string; mime: string }> {
    const chat = await this.getChat(chatId);
    const result = (await this.connections.execute(chat.connection_id, 'downloadMedia', {
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

  private async loadChatConnection(chat: WhatsappChat): Promise<Connection> {
    const connection = await this.connectionsRepository.findById(chat.connection_id);
    if (!connection || connection.provider_key !== WHATSAPP_PROVIDER_KEY) {
      throw new NotFoundException('Conexão da conversa não encontrada.');
    }
    if (connection.status !== 'ACTIVE') {
      throw new ConflictException('A conexão WhatsApp desta conversa não está ativa. Verifique em WhatsApp → Números.');
    }
    return connection;
  }
}
