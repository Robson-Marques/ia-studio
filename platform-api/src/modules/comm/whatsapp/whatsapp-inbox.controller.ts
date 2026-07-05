// Conversas WhatsApp — listagem/mensagens/envio/janela/midia + envio pelo
// Meta Orchestrator (criterios; sem numero). ACL granular por endpoint.
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CommChatStatus } from '@prisma/client';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { WhatsappInboxService, ChatTab } from './whatsapp-inbox.service';
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
    @Query('environment_id') environmentId?: string,
    @Query('connection_id') connectionId?: string,
    @Query('search') search?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.inbox.listChats({
      organizationId: resolveOrganizationId(user, orgQuery),
      user,
      tab,
      status,
      environmentId,
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
    @Query('environment_id') environmentId?: string,
    @Query('connection_id') connectionId?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.inbox.countChatsByScope(resolveOrganizationId(user, orgQuery), user, {
      status,
      search,
      environmentId,
      connectionId,
    });
  }

  @Get('chats/:id')
  @RequirePermissions(...ANY_VIEW)
  getChat(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.inbox.getChat(resolveOrganizationId(user, orgQuery), id);
  }

  @Get('chats/:id/messages')
  @RequirePermissions(...ANY_VIEW)
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('take') take?: string,
    @Query('before') before?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.inbox.listMessages(
      resolveOrganizationId(user, orgQuery),
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
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.inbox.windowState(resolveOrganizationId(user, orgQuery), id);
  }

  @Post('chats/:id/read')
  @RequirePermissions(...ANY_VIEW)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.inbox.markRead(resolveOrganizationId(user, orgQuery), id);
  }

  @Post('chats/:id/send')
  @RequirePermissions(...ANY_REPLY)
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SendChatMessageDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.inbox.send(resolveOrganizationId(user, orgQuery), user, id, dto);
  }

  @Get('chats/:id/media/:mediaId')
  @RequirePermissions(...ANY_VIEW)
  media(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.inbox.downloadMedia(resolveOrganizationId(user, orgQuery), id, mediaId);
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
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.orchestrator.send(
      {
        organizationId: resolveOrganizationId(user, orgQuery),
        workspaceId: dto.workspace_id,
        environmentId: dto.environment_id,
        phone: dto.phone,
        criteria: dto.criteria,
        sender: `user:${user.sub}`,
      },
      dto.message as unknown as RichMessage,
    );
  }
}
