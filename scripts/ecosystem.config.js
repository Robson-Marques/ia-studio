// PM2 — definição dos processos de uma aplicação dedicada IA Studio.
// Dois apps (modo fork):
//   * <aplicação>-api    → API HTTP (NestJS + Fastify).
//   * <aplicação>-worker → workers BullMQ em processo separado (diretriz 33):
//                       estado em Redis/Postgres, nunca em memoria do processo.
//
// O cwd e os nomes vêm do ambiente da aplicação. As variáveis vêm do
// arquivo .env (carregado por dotenv/config no bootstrap) — aqui declaramos
// apenas o minimo que diferencia cada processo. `pm2 start ecosystem.config.js`
// (ou `pm2 reload`) re-le este arquivo; o restore usa `pm2 delete + start` pra
// forcar a releitura do .env apos uma restauracao.
const appDir = process.env.IASTUDIO_APP_DIR;
const apiName = process.env.IASTUDIO_PM2_API;
const workerName = process.env.IASTUDIO_PM2_WORKER;

if (!appDir || !apiName || !workerName) {
  throw new Error('IASTUDIO_APP_DIR, IASTUDIO_PM2_API e IASTUDIO_PM2_WORKER são obrigatórios.');
}

module.exports = {
  apps: [
    {
      name: apiName,
      cwd: `${appDir}/platform-api`,
      script: 'dist/main.js',
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
        // A API nao processa filas inline em producao — quem processa e o worker.
        WORKER_INLINE: 'off',
      },
    },
    {
      name: workerName,
      cwd: `${appDir}/platform-api`,
      script: 'dist/worker.js',
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '600M',
      env: {
        NODE_ENV: 'production',
        // Marca o processo como worker dedicado (consome BullMQ + crons).
        WORKER_INLINE: 'off',
        WORKER_ROLE: 'worker',
      },
    },
  ],
};
