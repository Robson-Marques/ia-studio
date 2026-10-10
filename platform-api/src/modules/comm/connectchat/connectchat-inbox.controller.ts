import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { Auditable } from '../../../shared/audit/auditable.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { ConnectchatInboxService } from './connectchat-inbox.service';
import { AckConnectchatReceiptDto } from './dto/ack-connectchat-receipt.dto';
import { EditConnectchatMessageDto } from './dto/edit-connectchat-message.dto';
import { SendConnectchatMessageDto } from './dto/send-connectchat-message.dto';
import { RequestConnectchatCustomerLinkDto } from './dto/request-connectchat-customer-link.dto';
import { CompleteConnectchatCustomerLinkDto } from './dto/complete-connectchat-customer-link.dto';
import { SetConnectchatTypingDto } from './dto/set-connectchat-typing.dto';

@ApiTags('Comm — ConnectChat')
@ApiBearerAuth()
@Controller('comm/connectchat')
export class ConnectchatInboxController {
  constructor(private readonly inbox: ConnectchatInboxService) {}

  @Get('health')
  @RequirePermissions(PERMISSIONS.COMM_CONNECTCHAT_READ)
  @ApiOperation({ summary: 'Verifica a comunicação do backend com o ConnectChat' })
  health() { return this.inbox.health(); }

  @Get('conversations')
  @RequirePermissions(PERMISSIONS.COMM_CONNECTCHAT_READ)
  listConversations() { return this.inbox.listConversations(); }

  @Post('conversations/:conversationId/customer-link-requests')
  @RequirePermissions(PERMISSIONS.COMM_CONNECTCHAT_LINK_CUSTOMER)
  @Auditable({ action: 'comm.connectchat.customer_link.request', entityType: 'ConnectchatConversation', extractEntityId: (args) => args[1] as string })
  requestCustomerLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: RequestConnectchatCustomerLinkDto,
  ) {
    return this.inbox.requestCustomerLink(user, conversationId, dto.customerId);
  }

  @Post('conversations/:conversationId/customer-unlink')
  @RequirePermissions(PERMISSIONS.COMM_CONNECTCHAT_LINK_CUSTOMER)
  @Auditable({ action: 'comm.connectchat.customer_link.disconnect', entityType: 'ConnectchatConversation', extractEntityId: (args) => args[1] as string })
  unlinkCustomer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
  ) {
    return this.inbox.unlinkCustomer(user, conversationId);
  }

  @Post('conversations/:conversationId/customer-link-requests/complete')
  @RequirePermissions(PERMISSIONS.COMM_CONNECTCHAT_LINK_CUSTOMER)
  @Auditable({ action: 'comm.connectchat.customer_link.complete', entityType: 'ConnectchatConversation', extractEntityId: (args) => args[1] as string })
  completeCustomerLink(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: CompleteConnectchatCustomerLinkDto,
  ) {
    return this.inbox.completeCustomerLink(user, conversationId, dto.requestId);
  }

  @Get('conversations/:conversationId/messages')
  @RequirePermissions(PERMISSIONS.COMM_CONNECTCHAT_READ)
  listMessages(
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Query('after_sequence') afterSequence?: string,
    @Query('limit') limit?: string,
  ) {
    return this.inbox.getMessages(conversationId, afterSequence, limit ? Number(limit) : undefined);
  }

  @Post('conversations/:conversationId/messages')
  @RequirePermissions(PERMISSIONS.COMM_CONNECTCHAT_WRITE)
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: SendConnectchatMessageDto,
  ) {
    return this.inbox.send(user, { conversationId, ...dto });
  }

  @Patch('messages/:messageId')
  @RequirePermissions(PERMISSIONS.COMM_CONNECTCHAT_WRITE)
  edit(@CurrentUser() user: AuthenticatedUser, @Param('messageId', new ParseUUIDPipe()) messageId: string, @Body() dto: EditConnectchatMessageDto) {
    return this.inbox.edit(user, messageId, dto.body);
  }

  @Post('conversations/:conversationId/typing')
  @RequirePermissions(PERMISSIONS.COMM_CONNECTCHAT_WRITE)
  setTyping(
    @CurrentUser() user: AuthenticatedUser,
    @Param('conversationId', new ParseUUIDPipe()) conversationId: string,
    @Body() dto: SetConnectchatTypingDto,
  ) {
    return this.inbox.setTyping(user, conversationId, dto.status);
  }

  @Get('conversations/:conversationId/typing')
  @RequirePermissions(PERMISSIONS.COMM_CONNECTCHAT_READ)
  getTyping(@Param('conversationId', new ParseUUIDPipe()) conversationId: string) {
    return this.inbox.getTyping(conversationId);
  }

  @Post('conversations/:conversationId/receipts/read')
  @RequirePermissions(PERMISSIONS.COMM_CONNECTCHAT_WRITE)
  markRead(@CurrentUser() user: AuthenticatedUser, @Param('conversationId', new ParseUUIDPipe()) conversationId: string, @Body() dto: AckConnectchatReceiptDto) {
    return this.inbox.markRead(user, conversationId, dto.sequence);
  }

  @Post('conversations/:conversationId/receipts/delivered')
  @RequirePermissions(PERMISSIONS.COMM_CONNECTCHAT_WRITE)
  markDelivered(@CurrentUser() user: AuthenticatedUser, @Param('conversationId', new ParseUUIDPipe()) conversationId: string, @Body() dto: AckConnectchatReceiptDto) {
    return this.inbox.markDelivered(user, conversationId, dto.sequence);
  }
}
