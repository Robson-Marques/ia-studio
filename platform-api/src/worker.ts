// Entrypoint do WORKER (diretriz 33) — segundo processo Nest SEM HTTP:
// consome as filas do broker (execucoes, eventos, notificacoes) e roda o
// SchedulerCron. Producao: PM2 iastudio-worker + WORKER_INLINE=off na API.
// Dev: opcional — com WORKER_INLINE=on (default) a API processa inline.
import 'dotenv/config';

// Papel do processo ANTES do bootstrap: liga os processors incondicionalmente.
process.env['IASTUDIO_ROLE'] = 'worker';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('IAStudioWorker');
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'warn', 'error'],
  });
  app.enableShutdownHooks();
  logger.log('Worker IA Studio no ar — processando execuções, agendamentos e notificações.');
}
bootstrap();
