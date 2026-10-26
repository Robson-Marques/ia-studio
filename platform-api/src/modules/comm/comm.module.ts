// Comunicação WhatsApp via Central Nivoo: onboarding, sincronização, inbox,
// smart-send, templates e atendimento. Ver README.md deste diretório.
import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';

import { WhatsappChatsRepository } from './whatsapp/whatsapp-chats.repository';
import { WhatsappTemplatesRepository } from './whatsapp/whatsapp-templates.repository';
import { WhatsappOrchestratorService } from './whatsapp/whatsapp-orchestrator.service';
import { EmailOrchestratorService } from './email/email-orchestrator.service';
import { WhatsappInboxService } from './whatsapp/whatsapp-inbox.service';
import { WhatsappSmartSendService } from './whatsapp/whatsapp-smart-send.service';
import { WhatsappTemplatesService } from './whatsapp/whatsapp-templates.service';
import { NivooSyncService } from './whatsapp/nivoo-sync.service';
import { WhatsappInboxController } from './whatsapp/whatsapp-inbox.controller';
import { WhatsappTemplatesController } from './whatsapp/whatsapp-templates.controller';
import { WhatsappNumbersController } from './whatsapp/whatsapp-numbers.controller';
import { WhatsappAssistantRepository } from './whatsapp/whatsapp-assistant.repository';
import { WhatsappAssistantService } from './whatsapp/whatsapp-assistant.service';
import { ConnectchatInboxService } from './connectchat/connectchat-inbox.service';
import { ConnectchatInboxController } from './connectchat/connectchat-inbox.controller';
import { NivooConnectionsService } from './whatsapp/nivoo-connections.service';

import { AttendanceRepository } from './attendance/attendance.repository';
import { ChatEventsService } from './attendance/chat-events.service';
import { ChatScopeResolver } from './attendance/chat-scope.resolver';
import { ChatAssignmentService } from './attendance/chat-assignment.service';
import { ReplyGateService } from './attendance/reply-gate.service';
import { AttendanceAdminService } from './attendance/attendance-admin.service';
import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceAdminController } from './attendance/attendance-admin.controller';

@Module({
  imports: [IntegrationModule],
  controllers: [
    WhatsappInboxController,
    WhatsappTemplatesController,
    WhatsappNumbersController,
    ConnectchatInboxController,
    AttendanceController,
    AttendanceAdminController,
  ],
  providers: [
    // WhatsApp
    WhatsappChatsRepository,
    WhatsappTemplatesRepository,
    WhatsappOrchestratorService,
    EmailOrchestratorService,
    WhatsappInboxService,
    WhatsappSmartSendService,
    WhatsappTemplatesService,
    NivooSyncService,
    WhatsappAssistantRepository,
    WhatsappAssistantService,
    ConnectchatInboxService,
    NivooConnectionsService,
    // Atendimento
    AttendanceRepository,
    ChatEventsService,
    ChatScopeResolver,
    ChatAssignmentService,
    ReplyGateService,
    AttendanceAdminService,
  ],
  // Orchestrator + smart-send + email sao a porta de envio das Fases 4-7
  // (automacao/IA/notificacoes).
  exports: [WhatsappOrchestratorService, WhatsappSmartSendService, WhatsappInboxService, ChatAssignmentService, EmailOrchestratorService, WhatsappAssistantService],
})
export class CommModule {}
