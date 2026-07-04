// Implementacao BullMQ do IMessageBroker (diretriz 8). Unico arquivo do
// sistema que importa bullmq/ioredis.
//
// Resiliencia: Redis e OPCIONAL em dev — conexao lazy com poucas tentativas;
// sem Redis o broker loga warn UMA vez e cai num fallback em memoria
// (dispatch direto pro handler registrado no MESMO processo, respeitando
// delay via setTimeout). Producao roda com Redis + worker separado
// (diretriz 33) — o install liga WORKER_INLINE=off e sobe o processo worker.
//
// Retry: attempts (default 3) com backoff exponencial; job que esgota as
// tentativas e copiado pra fila <queue>:dlq (dead-letter).
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, Worker, Job, ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import {
  BrokerHandler,
  EnqueueOptions,
  IMessageBroker,
  ProcessOptions,
} from './message-broker.interface';

const PREFIX = 'iastudio';
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 5_000;

@Injectable()
export class BullMqBroker implements IMessageBroker, OnModuleDestroy {
  private readonly logger = new Logger(BullMqBroker.name);
  private connection: IORedis | null = null;
  private available = false;
  private connectAttempted = false;
  private warnedUnavailable = false;

  private readonly queues = new Map<string, Queue>();
  private readonly workers: Worker[] = [];
  /** Handlers locais — usados pelo fallback em memoria (sem Redis). */
  private readonly localHandlers = new Map<string, BrokerHandler>();
  private inlineSeq = 0;

  isAvailable(): boolean {
    return this.available;
  }

  async enqueue(queue: string, name: string, data: unknown, opts: EnqueueOptions = {}): Promise<string> {
    await this.ensureConnection();
    if (!this.available) {
      return this.enqueueInline(queue, name, data, opts);
    }
    try {
      const job = await this.getQueue(queue).add(name, data, {
        jobId: opts.jobId,
        delay: opts.delay,
        attempts: opts.attempts ?? DEFAULT_ATTEMPTS,
        backoff: { type: 'exponential', delay: opts.backoffMs ?? DEFAULT_BACKOFF_MS },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      });
      return job.id ?? 'unknown';
    } catch (e) {
      this.logger.warn(`Falha ao enfileirar em "${queue}" (${(e as Error).message}) — usando fallback em memória.`);
      return this.enqueueInline(queue, name, data, opts);
    }
  }

  process(queue: string, handler: BrokerHandler, opts: ProcessOptions = {}): void {
    // Sempre registra o handler local (fallback em memoria).
    this.localHandlers.set(queue, handler);

    void this.ensureConnection().then(() => {
      if (!this.available || !this.connection) return;
      const worker = new Worker(
        queue,
        async (job: Job) => {
          await handler({
            id: String(job.id ?? ''),
            name: job.name,
            data: job.data,
            attemptsMade: job.attemptsMade,
          });
        },
        {
          // Cast: bullmq empacota sua propria copia do ioredis; a instancia
          // vem do ioredis de topo. Mesmo objeto em runtime.
          connection: this.connection as unknown as ConnectionOptions,
          prefix: PREFIX,
          concurrency: opts.concurrency ?? 5,
        },
      );
      // DLQ: esgotou as tentativas → copia pra <queue>:dlq.
      worker.on('failed', (job, err) => {
        if (!job) return;
        const max = job.opts.attempts ?? DEFAULT_ATTEMPTS;
        if (job.attemptsMade >= max) {
          this.logger.error(`Job ${job.id} da fila "${queue}" esgotou ${max} tentativas: ${err?.message}`);
          void this.getQueue(`${queue}:dlq`)
            .add(job.name, { original_job_id: job.id, error: err?.message ?? 'desconhecido', data: job.data })
            .catch((e) => this.logger.warn(`Falha ao gravar na DLQ de "${queue}": ${(e as Error).message}`));
        }
      });
      worker.on('error', (err) => this.logger.warn(`Worker da fila "${queue}": ${err.message}`));
      this.workers.push(worker);
      this.logger.log(`Processor registrado na fila "${queue}" (concurrency=${opts.concurrency ?? 5}).`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    for (const w of this.workers) await w.close().catch(() => undefined);
    for (const q of this.queues.values()) await q.close().catch(() => undefined);
    if (this.connection) await this.connection.quit().catch(() => undefined);
  }

  // ─── Privados ───────────────────────────────────────

  /** Conexao lazy: 1 tentativa curta; sem Redis → warn unico + fallback. */
  private async ensureConnection(): Promise<void> {
    if (this.connectAttempted) return;
    this.connectAttempted = true;

    const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    try {
      const conn = new IORedis(url, {
        lazyConnect: true,
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 2_000)),
      });
      conn.on('error', () => {
        /* absorvido — disponibilidade controlada abaixo */
      });
      await conn.connect();
      await conn.ping();
      this.connection = conn;
      this.available = true;
      this.logger.log(`Broker BullMQ conectado ao Redis (${url.replace(/\/\/.*@/, '//***@')}).`);
    } catch (e) {
      this.available = false;
      this.connection = null;
      if (!this.warnedUnavailable) {
        this.warnedUnavailable = true;
        this.logger.warn(
          `Redis indisponível (${(e as Error).message}) — broker em FALLBACK em memória. ` +
            'Configure REDIS_URL pra habilitar filas persistentes e o worker separado.',
        );
      }
    }
  }

  private getQueue(name: string): Queue {
    let q = this.queues.get(name);
    if (!q) {
      if (!this.connection) throw new Error('Broker sem conexão Redis.');
      q = new Queue(name, { connection: this.connection as unknown as ConnectionOptions, prefix: PREFIX });
      this.queues.set(name, q);
    }
    return q;
  }

  /** Fallback em memoria: dispatch direto pro handler local do processo. */
  private enqueueInline(queue: string, name: string, data: unknown, opts: EnqueueOptions): string {
    const id = `inline:${++this.inlineSeq}`;
    const handler = this.localHandlers.get(queue);
    if (!handler) {
      this.logger.warn(`Fila "${queue}" sem processor local — job "${name}" descartado (sem Redis).`);
      return id;
    }
    const run = () =>
      void handler({ id, name, data, attemptsMade: 1 }).catch((e) =>
        this.logger.warn(`Job inline "${name}" na fila "${queue}" falhou: ${(e as Error).message}`),
      );
    if (opts.delay && opts.delay > 0) setTimeout(run, opts.delay);
    else setImmediate(run);
    return id;
  }
}
