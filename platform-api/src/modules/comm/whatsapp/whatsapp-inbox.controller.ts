// Conversas WhatsApp — listagem/mensagens/envio/janela/midia + envio pelo
// Meta Orchestrator (criterios; sem numero). ACL granular por endpoint.
import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CommChatStatus } from '@prisma/client';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { WhatsappInboxService, ChatTab, MediaKind } from './whatsapp-inbox.service';
import { WhatsappOrchestratorService } from './whatsapp-orchestrator.service';
import { SendChatMessageDto } from '../dto/send-chat-message.dto';
import { OrchestratorSendDto } from '../dto/orchestrator-send.dto';
import { RichMessage } from '../../../shared/integration/whatsapp.types';

const ANY_VIEW = [
  PERMISSIONS.COMM_WHATSAPP_VIEW_ASSIGNED,
  PERMISSIONS.COMM_WHATSAPP_VIEW_UNASSIGNED,
  PERMISSIONS.COMM_WHATSAPP_VIEW_TEAM,
  PERMISSIONS.COMM_WHATSAPP_VIEW_ALL,
];

const ANY_REPLY = [
  PERMISSIONS.COMM_WHATSAPP_REPLY_ASSIGNED,
  PERMISSIONS.COMM_WHATSAPP_REPLY_TEAM,
  PERMISSIONS.COMM_WHATSAPP_REPLY_ALL,
];

@ApiTags('Comm — WhatsApp Conversas')
@ApiBearerAuth()
@Controller('comm/whatsapp')
export class WhatsappInboxController {
  constructor(
    private readonly inbox: WhatsappInboxService,
    private readonly orchestrator: WhatsappOrchestratorService,
  ) {}

  /** Escopo do ator (abas visiveis, acoes permitidas) — a UI se monta daqui. */
  @Get('scope')
  @RequirePermissions(...ANY_VIEW)
  scope(@CurrentUser() user: AuthenticatedUser) {
    return this.inbox.resolveScope(user);
  }

  @Get('chats')
  @RequirePermissions(...ANY_VIEW)
  listChats(
    @CurrentUser() user: AuthenticatedUser,
    @Query('tab') tab?: ChatTab,
    @Query('status') status?: CommChatStatus,
    @Query('connection_id') connectionId?: string,
    @Query('search') search?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.inbox.listChats({
      user,
      tab,
      status,
      connectionId,
      search,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  /** Contagem de conversas por aba (badges) — mesmo escopo/filtros do listChats. */
  @Get('chats/counts')
  @RequirePermissions(...ANY_VIEW)
  countChats(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: CommChatStatus,
    @Query('search') search?: string,
    @Query('connection_id') connectionId?: string,
  ) {
    return this.inbox.countChatsByScope(user, {
      status,
      search,
      connectionId,
    });
  }

  @Get('chats/:id')
  @RequirePermissions(...ANY_VIEW)
  getChat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.inbox.getChat(id);
  }

  /** Desvincula o cliente deste WhatsApp (ação do atendente). */
  @Post('chats/:id/unlink-customer')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_CLAIM)
  unlinkCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.inbox.unlinkCustomer(id);
  }

  @Get('chats/:id/messages')
  @RequirePermissions(...ANY_VIEW)
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('take') take?: string,
    @Query('before') before?: string,
  ) {
    return this.inbox.listMessages(
      id,
      take ? Number(take) : undefined,
      before,
    );
  }

  @Get('chats/:id/window')
  @RequirePermissions(...ANY_VIEW)
  windowState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.inbox.windowState(id);
  }

  @Post('chats/:id/read')
  @RequirePermissions(...ANY_VIEW)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.inbox.markRead(id);
  }

  @Post('chats/:id/typing')
  @RequirePermissions(...ANY_REPLY)
  typing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.inbox.sendTyping(id);
  }

  @Post('chats/:id/send')
  @RequirePermissions(...ANY_REPLY)
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendChatMessageDto,
  ) {
    return this.inbox.send(user, id, dto);
  }

  /**
   * Upload real de arquivo/audio gravado no aparelho (multipart/form-data):
   * campos `file` + `kind` (image|audio|video|document) + `caption?` +
   * `confirm_takeover?`. O binario sobe pra Meta (media_id) e a mensagem sai
   * pela MESMA porta do /send (reply gate + janela de 24h + takeover 409).
   */
  @Post('chats/:id/media/upload')
  @RequirePermissions(...ANY_REPLY)
  @ApiOperation({ summary: 'Envia mídia por upload do aparelho (multipart/form-data)' })
  async uploadMedia(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Req() req: FastifyRequest,
  ) {
    // @fastify/multipart registrado no bootstrap. Le o arquivo + campos anexos.
    const reqAny = req as FastifyRequest & {
      isMultipart?: () => boolean;
      file?: () => Promise<
        | {
            filename: string;
            mimetype: string;
            toBuffer: () => Promise<Buffer>;
            fields?: Record<string, { value?: string } | Array<{ value?: string }>>;
          }
        | undefined
      >;
    };
    if (typeof reqAny.isMultipart === 'function' && !reqAny.isMultipart()) {
      throw new BadRequestException('Envie o arquivo como multipart/form-data.');
    }
    if (typeof reqAny.file !== 'function') {
      throw new BadRequestException('Upload multipart indisponível (plugin não registrado).');
    }
    const data = await reqAny.file();
    if (!data) throw new BadRequestException('Nenhum arquivo recebido.');

    const readField = (name: string): string | undefined => {
      // Cast pra escapar do union Multipart (MultipartFile | MultipartValue) —
      // só o value de campo interessa; MultipartFile não tem `.value`.
      const f = (data.fields as Record<string, unknown> | undefined)?.[name];
      const single = Array.isArray(f) ? f[0] : f;
      const value = (single as { value?: unknown } | undefined)?.value;
      return typeof value === 'string' ? value : undefined;
    };
    const rawKind = (readField('kind') ?? '').trim();
    const validKinds: MediaKind[] = ['image', 'audio', 'video', 'document'];
    if (!validKinds.includes(rawKind as MediaKind)) {
      throw new BadRequestException('Campo "kind" inválido (use image, audio, video ou document).');
    }
    const buffer = await data.toBuffer();

    return this.inbox.uploadAndSendMedia(user, id, {
      kind: rawKind as MediaKind,
      data: buffer,
      mimeType: data.mimetype || 'application/octet-stream',
      filename: data.filename || 'arquivo',
      caption: readField('caption'),
      confirmTakeover: readField('confirm_takeover') === 'true',
    });
  }

  @Get('chats/:id/media/:mediaId')
  @RequirePermissions(...ANY_VIEW)
  media(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
  ) {
    return this.inbox.downloadMedia(id, mediaId);
  }

  /**
   * Envio pelo Meta Orchestrator (sem conversa aberta): criterios de
   * tag/departamento resolvem a conexao — o chamador nunca indica numero.
   */
  @Post('send')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_REPLY_ALL, PERMISSIONS.INTEGRATIONS_CONNECTIONS_EXECUTE)
  orchestratorSend(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: OrchestratorSendDto,
  ) {
    return this.orchestrator.send(
      {
        phone: dto.phone,
        criteria: dto.criteria,
        sender: `user:${user.sub}`,
      },
      dto.message as unknown as RichMessage,
    );
  }
}
