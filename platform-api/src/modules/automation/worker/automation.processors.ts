// Processors das filas da Fase 4 (diretriz 33: a API enfileira, o worker
// executa). Registrados no boot quando o processo e worker OU quando
// WORKER_INLINE=on (default — fallback dev sem Redis/worker).
//
//   automation-events        → dispatcher: evento publicado no bus casa com
//                              fluxos PUBLICADOS de gatilho 'event' e vira
//                              execucao (dedup por source_event_id).
//   automation-executions    → roda/retoma execucoes na engine.
//   automation-notifications → entrega do Notification Center.
import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { EventEnvelope } from '../../../shared/events/event-envelope';
import {
  BrokerJob,
  IMessageBroker,
  MESSAGE_BROKER,
  QUEUES,
} from '../../../shared/broker/message-broker.interface';
import { WorkflowEngineService, ResumeState } from '../engine/workflow-engine.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { WorkflowsRepository } from '../workflows/workflows.repository';
import { parseTrigger } from '../engine/workflow-graph';
import { NotificationCenterService, NotifyArgs } from '../notifications/notification-center.service';
import { processorsEnabled, isWorkerProcess } from './processors.gate';

interface ExecutionJob {
  execution_id: string;
  resume?: ResumeState;
}

@Injectable()
export class AutomationProcessors implements OnApplicationBootstrap {
  private readonly logger = new Logger(AutomationProcessors.name);

  constructor(
    @Inject(MESSAGE_BROKER) private readonly broker: IMessageBroker,
    private readonly engine: WorkflowEngineService,
    private readonly workflows: WorkflowsService,
    private readonly workflowsRepository: WorkflowsRepository,
    private readonly notifications: NotificationCenterService,
  ) {}

  onApplicationBootstrap(): void {
    if (!processorsEnabled()) {
      this.logger.log('Processors DESLIGADOS neste processo (WORKER_INLINE=off e não é worker).');
      return;
    }
    const mode = isWorkerProcess() ? 'worker dedicado' : 'inline (WORKER_INLINE=on)';
    this.logger.log(`Registrando processors de automação — modo: ${mode}.`);

    this.broker.process(QUEUES.EXECUTIONS, (job) => this.handleExecution(job as BrokerJob<ExecutionJob>), {
      concurrency: Number(process.env['AUTOMATION_EXEC_CONCURRENCY'] ?? 5),
    });
    this.broker.process(QUEUES.EVENTS, (job) => this.handleEvent(job as BrokerJob<EventEnvelope>), {
      concurrency: 5,
    });
    this.broker.process(QUEUES.NOTIFICATIONS, (job) => this.handleNotification(job as BrokerJob<NotifyArgs>), {
      concurrency: 5,
    });
  }

  // ─── Execucoes ──────────────────────────────────────

  private async handleExecution(job: BrokerJob<ExecutionJob>): Promise<void> {
    const { execution_id, resume } = job.data ?? ({} as ExecutionJob);
    if (!execution_id) return;
    await this.engine.run(execution_id, resume);
  }

  // ─── Dispatcher de eventos → gatilhos 'event' ───────

  // Debounce por CONVERSA do inbound de WhatsApp (porte do Aquapark
  // SdrTriggerListener): quando o cliente manda várias mensagens picadas, o
  // timer REINICIA a cada mensagem e só dispara UMA vez quando ele para de
  // digitar — o assistente lê o histórico completo e responde juntando tudo.
  // Sem isto, cada mensagem virava um run isolado (e a IA perdia contexto /
  // respondia solto). In-memory: coalesce por processo do worker.
  private static readonly INBOUND_EVENT = 'whatsapp.inbound.message';
  private static readonly INBOUND_DEBOUNCE_MS = Number(process.env['WHATSAPP_DEBOUNCE_MS'] ?? 8000);
  private readonly inboundDebounce = new Map<string, ReturnType<typeof setTimeout>>();

  private async handleEvent(job: BrokerJob<EventEnvelope>): Promise<void> {
    const envelope = job.data;
    if (!envelope?.event) return;

    // Agrupa a rajada de mensagens da mesma conversa num único disparo.
    const chatId =
      envelope.event === AutomationProcessors.INBOUND_EVENT
        ? ((envelope.payload as Record<string, unknown> | undefined)?.['chat_id'] as string | undefined)
        : undefined;
    if (chatId && AutomationProcessors.INBOUND_DEBOUNCE_MS > 0) {
      const existing = this.inboundDebounce.get(chatId);
      if (existing) clearTimeout(existing);
      const timer = setTimeout(() => {
        this.inboundDebounce.delete(chatId);
        // Dispara com o envelope da ÚLTIMA mensagem da rajada (as anteriores
        // estão no histórico que o assistente lê).
        void this.dispatchEvent(envelope).catch((e) =>
          this.logger.warn(`Inbound debounce chat ${chatId}: ${(e as Error).message}`),
        );
      }, AutomationProcessors.INBOUND_DEBOUNCE_MS);
      this.inboundDebounce.set(chatId, timer);
      return; // o run real acontece quando o cliente parar de digitar
    }

    await this.dispatchEvent(envelope);
  }

  // Casa o evento com os fluxos publicados de gatilho 'event' e vira execução.
  private async dispatchEvent(envelope: EventEnvelope): Promise<void> {
    const published = await this.workflowsRepository.findPublished();
    for (const workflow of published) {
      const version = await this.workflowsRepository.findVersion(workflow.id, workflow.current_version);
      if (!version) continue;
      const trigger = parseTrigger(version.trigger);
      if (trigger.type !== 'event' || trigger.event !== envelope.event) continue;

      try {
        const execution = await this.workflows.startExecution(workflow, {
          triggerType: 'EVENT',
          input: { event: envelope.event, ...envelope.payload },
          sourceEventId: envelope.source_event_id,
          traceId: envelope.trace_id,
        });
        if (execution) {
          this.logger.log(`Evento ${envelope.event} → fluxo ${workflow.name} (execução ${execution.id}).`);
        }
      } catch (e) {
        this.logger.warn(`Evento ${envelope.event} falhou ao disparar o fluxo ${workflow.id}: ${(e as Error).message}`);
      }
    }
  }

  // ─── Notificacoes ───────────────────────────────────

  private async handleNotification(job: BrokerJob<NotifyArgs>): Promise<void> {
    if (!job.data) return;
    await this.notifications.deliver(job.data);
  }
}
