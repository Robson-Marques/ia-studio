// Automation Platform (Fase 4 — diretrizes 3/7/8/11/12/13/22/27/29/33/49):
// Workflow Engine + Node Registry + Scheduler + Execution Monitor + Catalogo
// de Templates + Notification Center + webhook publico + processors.
// Ver README.md deste diretorio.
import { Module } from '@nestjs/common';
import { IntegrationModule } from '../integration/integration.module';
import { CommModule } from '../comm/comm.module';

// Engine
import { NodeRegistryService } from './engine/node-registry.service';
import { WorkflowEngineService } from './engine/workflow-engine.service';
import { ExecutionsRepository } from './engine/executions.repository';
import { CoreNodes } from './engine/nodes/core.nodes';
import { IntegrationNodes } from './engine/nodes/integration.nodes';
import { CommNodes } from './engine/nodes/comm.nodes';
import { PlatformNodes } from './engine/nodes/platform.nodes';

// Workflows
import { WorkflowsRepository } from './workflows/workflows.repository';
import { WorkflowsService } from './workflows/workflows.service';
import { WorkflowsController } from './workflows/workflows.controller';

// Executions (monitor)
import { ExecutionsService } from './executions/executions.service';
import { ExecutionsController } from './executions/executions.controller';

// Scheduler
import { SchedulesRepository } from './scheduler/schedules.repository';
import { SchedulerService } from './scheduler/scheduler.service';
import { SchedulerCron } from './scheduler/scheduler.cron';
import { ScheduleController } from './scheduler/schedule.controller';

// Templates
import { TemplatesRepository } from './templates/templates.repository';
import { TemplatesService } from './templates/templates.service';
import { TemplatesController } from './templates/templates.controller';

// Notifications
import { NotificationsRepository } from './notifications/notifications.repository';
import { NotificationCenterService } from './notifications/notification-center.service';
import { NotificationsController } from './notifications/notifications.controller';

// Event Bus (API) + webhook publico + processors
import { AutomationEventsController } from './events/events.controller';
import { FlowsWebhookController } from './webhooks/flows-webhook.controller';
import { AutomationProcessors } from './worker/automation.processors';

@Module({
  imports: [IntegrationModule, CommModule],
  controllers: [
    WorkflowsController,
    ExecutionsController,
    ScheduleController,
    TemplatesController,
    NotificationsController,
    AutomationEventsController,
    FlowsWebhookController,
  ],
  providers: [
    // Engine + nos
    NodeRegistryService,
    WorkflowEngineService,
    ExecutionsRepository,
    CoreNodes,
    IntegrationNodes,
    CommNodes,
    PlatformNodes,
    // Workflows
    WorkflowsRepository,
    WorkflowsService,
    // Monitor
    ExecutionsService,
    // Scheduler
    SchedulesRepository,
    SchedulerService,
    SchedulerCron,
    // Templates
    TemplatesRepository,
    TemplatesService,
    // Notifications
    NotificationsRepository,
    NotificationCenterService,
    // Processors (worker/inline)
    AutomationProcessors,
  ],
  // NodeRegistryService exportado pra Fase 5: o AiModule registra o no AGENT
  // (agent.nodes.ts) sem que a Automacao importe o AiModule (evita ciclo).
  exports: [NotificationCenterService, WorkflowsService, NodeRegistryService],
})
export class AutomationModule {}
