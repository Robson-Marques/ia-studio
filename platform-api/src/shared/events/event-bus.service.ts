// Event Bus central (diretriz 7): porta UNICA de publicacao de eventos.
//   1) Persiste o envelope em automation_event_log (dedup por source_event_id).
//   2) Emite no EventEmitter2 (assinantes sincronos no MESMO processo —
//      compat com os listeners existentes).
//   3) Enfileira no broker (QUEUES.EVENTS) pro consumo pelos workers
//      (diretriz 33) — jobId = source_event_id (idempotencia).
// Replay: re-emite + re-enfileira um evento persistido (jobId derivado pra
// nao colidir com o job original).
import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AutomationEventLog, Prisma } from '@prisma/client';
import { EventEnvelope } from './event-envelope';
import { EventLogRepository } from './event-log.repository';
import { IMessageBroker, MESSAGE_BROKER, QUEUES } from '../broker/message-broker.interface';

export interface PublishResult {
  deduped: boolean;
  event_log_id: string | null;
}

@Injectable()
export class EventBusService {
  private readonly logger = new Logger(EventBusService.name);

  constructor(
    private readonly repository: EventLogRepository,
    private readonly emitter: EventEmitter2,
    @Inject(MESSAGE_BROKER) private readonly broker: IMessageBroker,
  ) {}

  /** Publica um envelope: persiste (dedup) + EventEmitter2 + broker. */
  async publish(envelope: EventEnvelope): Promise<PublishResult> {
    let logId: string | null = null;
    try {
      const row = await this.repository.create({
        event: envelope.event,
        trace_id: envelope.trace_id,
        source_event_id: envelope.source_event_id,
        occurred_at: new Date(envelope.occurred_at),
        payload: (envelope.payload ?? {}) as Prisma.InputJsonValue,
      });
      logId = row.id;
    } catch (e) {
      // P2002 = source_event_id repetido → evento ja publicado (reentrega).
      if ((e as { code?: string }).code === 'P2002') {
        this.logger.warn(`Evento ${envelope.event} deduplicado (source_event_id=${envelope.source_event_id}).`);
        return { deduped: true, event_log_id: null };
      }
      // Persistencia nunca derruba o fluxo de negocio — segue emitindo.
      this.logger.warn(`Falha ao persistir evento ${envelope.event}: ${(e as Error).message}`);
    }

    this.dispatch(envelope, envelope.source_event_id);
    return { deduped: false, event_log_id: logId };
  }

  /** Replay de um evento persistido (perm automation.events.retry). */
  async replay(eventLogId: string): Promise<AutomationEventLog> {
    const row = await this.repository.findById(eventLogId);
    if (!row) {
      throw new NotFoundException('Evento não encontrado.');
    }
    const envelope: EventEnvelope = {
      event: row.event,
      trace_id: row.trace_id,
      source_event_id: row.source_event_id,
      occurred_at: row.occurred_at.toISOString(),
      payload: (row.payload ?? {}) as Record<string, unknown>,
    };
    // jobId derivado: nao colide com o job original nem com replays anteriores.
    this.dispatch(envelope, `${row.source_event_id}:replay:${row.replay_count + 1}`);
    return this.repository.markReplayed(row.id);
  }

  private dispatch(envelope: EventEnvelope, jobId: string): void {
    // Assinantes sincronos do processo (compat EventEmitter2).
    this.emitter.emit(envelope.event, envelope);
    // Workers (diretriz 33) — enqueue nunca lanca pro caller.
    void this.broker
      .enqueue(QUEUES.EVENTS, envelope.event, envelope, { jobId })
      .catch((e) => this.logger.warn(`Falha ao enfileirar evento ${envelope.event}: ${(e as Error).message}`));
  }
}
