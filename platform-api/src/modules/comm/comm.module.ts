// Communication Platform (Fase 3) — WhatsApp Meta Cloud API oficial-only:
// Meta Orchestrator + inbox/conversas + smart-send (janela 24h) + templates
// bidirecionais + sync continuo + Central de Atendimento (equipes/filas/
// claim/transfer/takeover). Ver README.md deste diretorio.
import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
import { LicensingModule } from '../licensing/licensing.module';

import { WhatsappChatsRepository } from './whatsapp/whatsapp-chats.repository';
import { WhatsappTemplatesRepository } from './whatsapp/whatsapp-templates.repository';
import { WhatsappOrchestratorService } from './whatsapp/whatsapp-orchestrator.service';
import { EmailOrchestratorService } from './email/email-orchestrator.service';
import { WhatsappInboundService } from './whatsapp/whatsapp-inbound.service';
import { WhatsappInboxService } from './whatsapp/whatsapp-inbox.service';
import { WhatsappSmartSendService } from './whatsapp/whatsapp-smart-send.service';
import { WhatsappTemplatesService } from './whatsapp/whatsapp-templates.service';
import { WhatsappSyncService } from './whatsapp/whatsapp-sync.service';
import { WhatsappWebhookController } from './whatsapp/whatsapp-webhook.controller';
import { WhatsappInboxController } from './whatsapp/whatsapp-inbox.controller';
import { WhatsappTemplatesController } from './whatsapp/whatsapp-templates.controller';
import { WhatsappNumbersController } from './whatsapp/whatsapp-numbers.controller';

import { AttendanceRepository } from './attendance/attendance.repository';
import { ChatEventsService } from './attendance/chat-events.service';
import { ChatScopeResolver } from './attendance/chat-scope.resolver';
import { ChatAssignmentService } from './attendance/chat-assignment.service';
import { ReplyGateService } from './attendance/reply-gate.service';
import { AttendanceAdminService } from './attendance/attendance-admin.service';
import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceAdminController } from './attendance/attendance-admin.controller';

@Module({
  imports: [IntegrationModule, LicensingModule],
  controllers: [
    WhatsappWebhookController,
    WhatsappInboxController,
    WhatsappTemplatesController,
    WhatsappNumbersController,
    AttendanceController,
    AttendanceAdminController,
  ],
  providers: [
    // WhatsApp
    WhatsappChatsRepository,
    WhatsappTemplatesRepository,
    WhatsappOrchestratorService,
    EmailOrchestratorService,
    WhatsappInboundService,
    WhatsappInboxService,
    WhatsappSmartSendService,
    WhatsappTemplatesService,
    WhatsappSyncService,
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
  exports: [WhatsappOrchestratorService, WhatsappSmartSendService, WhatsappInboxService, EmailOrchestratorService],
})
export class CommModule {}
