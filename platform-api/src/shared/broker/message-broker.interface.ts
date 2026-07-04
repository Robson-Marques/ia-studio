// Broker abstraido (diretriz 8): interface unica IMessageBroker com
// implementacao BullMQ na V1. RabbitMQ/Kafka/SQS entram depois como novas
// implementacoes — NENHUM modulo importa bullmq/ioredis diretamente; todos
// injetam o token MESSAGE_BROKER e usam so esta interface.

export const MESSAGE_BROKER = 'MESSAGE_BROKER';

export interface EnqueueOptions {
  /** Atraso em ms antes do job ficar elegivel. */
  delay?: number;
  /** Tentativas totais (default 3) com backoff exponencial. */
  attempts?: number;
  /** Base do backoff exponencial em ms (default 5000). */
  backoffMs?: number;
  /**
   * Idempotencia: jobs com o mesmo jobId nao duplicam na fila.
   * Padrao da plataforma: jobId = source_event_id do envelope.
   */
  jobId?: string;
}

export interface ProcessOptions {
  concurrency?: number;
}

export interface BrokerJob<T = unknown> {
  id: string;
  name: string;
  data: T;
  attemptsMade: number;
}

export type BrokerHandler<T = unknown> = (job: BrokerJob<T>) => Promise<void>;

export interface IMessageBroker {
  /** Enfileira um job. Retorna o id do job (ou 'inline:*' no fallback local). */
  enqueue(queue: string, name: string, data: unknown, opts?: EnqueueOptions): Promise<string>;
  /** Registra o processor da fila (worker/inline). */
  process(queue: string, handler: BrokerHandler, opts?: ProcessOptions): void;
  /** true quando o backend real (Redis) esta disponivel. */
  isAvailable(): boolean;
}

// Filas oficiais da Fase 4.
export const QUEUES = {
  /** Envelope de evento publicado no bus → dispatcher de gatilhos. */
  EVENTS: 'automation-events',
  /** Execucao de workflow (job = { execution_id } ou continuacao). */
  EXECUTIONS: 'automation-executions',
  /** Entrega de notificacoes do Notification Center. */
  NOTIFICATIONS: 'automation-notifications',
} as const;
