// Acoes de atendimento por conversa: claim/release/transfer/close/reopen +
// timeline (trilha). Toda acao passa pelo escopo do ator + lock otimista
// (2o concorrente recebe 409) + @Auditable.
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { Auditable } from '../../../shared/audit/auditable.decorator';
import { ChatAssignmentService, TransferTarget } from './chat-assignment.service';
import { ChatScopeResolver } from './chat-scope.resolver';
import { ChatEventsService } from './chat-events.service';
import { CloseChatDto, TransferChatDto } from '../dto/transfer-chat.dto';

const ANY_VIEW = [
  PERMISSIONS.COMM_WHATSAPP_VIEW_ASSIGNED,
  PERMISSIONS.COMM_WHATSAPP_VIEW_UNASSIGNED,
  PERMISSIONS.COMM_WHATSAPP_VIEW_TEAM,
  PERMISSIONS.COMM_WHATSAPP_VIEW_ALL,
];

@ApiTags('Comm — WhatsApp Atendimento')
@ApiBearerAuth()
@Controller('comm/whatsapp/chats')
export class AttendanceController {
  constructor(
    private readonly assignment: ChatAssignmentService,
    private readonly scopeResolver: ChatScopeResolver,
    private readonly events: ChatEventsService,
  ) {}

  @Post(':id/claim')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_CLAIM)
  @Auditable({ action: 'comm.whatsapp.chat.claim', entityType: 'WhatsappChat', extractEntityId: (args) => args[1] as string })
  async claim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const scope = await this.scopeResolver.resolve(user);
    return this.assignment.claim(id, scope);
  }

  @Post(':id/release')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_CLAIM)
  @Auditable({ action: 'comm.whatsapp.chat.release', entityType: 'WhatsappChat', extractEntityId: (args) => args[1] as string })
  async release(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const scope = await this.scopeResolver.resolve(user);
    return this.assignment.release(id, scope);
  }

  @Post(':id/transfer')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TRANSFER)
  @Auditable({ action: 'comm.whatsapp.chat.transfer', entityType: 'WhatsappChat', extractEntityId: (args) => args[1] as string })
  async transfer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: TransferChatDto,
  ) {
    const scope = await this.scopeResolver.resolve(user);
    const target: TransferTarget = { type: dto.type, id: dto.id } as TransferTarget;
    return this.assignment.transfer(id, scope, target, dto.reason);
  }

  @Post(':id/close')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_CLOSE)
  @Auditable({ action: 'comm.whatsapp.chat.close', entityType: 'WhatsappChat', extractEntityId: (args) => args[1] as string })
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CloseChatDto,
  ) {
    const scope = await this.scopeResolver.resolve(user);
    return this.assignment.close(id, scope, dto.reason);
  }

  @Post(':id/reopen')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_CLOSE)
  @Auditable({ action: 'comm.whatsapp.chat.reopen', entityType: 'WhatsappChat', extractEntityId: (args) => args[1] as string })
  async reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const scope = await this.scopeResolver.resolve(user);
    return this.assignment.reopen(id, scope);
  }

  /** Trilha de atendimento (TimelineModal). */
  @Get(':id/timeline')
  @RequirePermissions(...ANY_VIEW)
  timeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.events.timeline(id);
  }
}
