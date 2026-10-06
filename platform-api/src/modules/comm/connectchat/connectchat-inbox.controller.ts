import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { ConnectchatInboxService } from './connectchat-inbox.service';
import { AckConnectchatReceiptDto } from './dto/ack-connectchat-receipt.dto';
import { EditConnectchatMessageDto } from './dto/edit-connectchat-message.dto';
import { SendConnectchatMessageDto } from './dto/send-connectchat-message.dto';

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
