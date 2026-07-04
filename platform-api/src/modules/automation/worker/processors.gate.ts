// Gate dos processors (diretriz 33): quem processa filas/cron?
//   - Processo worker (src/worker.ts seta IASTUDIO_ROLE=worker): SEMPRE.
//   - Processo da API: so com WORKER_INLINE=on (DEFAULT ON — fallback dev).
// Producao: install liga WORKER_INLINE=off e sobe o worker separado (PM2
// iastudio-worker). Regra de ouro: default de producao no codigo; env so
// override — aqui o default e ON deliberadamente porque a V1 dev-first nao
// exige Redis/worker pra funcionar.
export function isWorkerProcess(): boolean {
  return (process.env['IASTUDIO_ROLE'] ?? '') === 'worker';
}

export function processorsEnabled(): boolean {
  if (isWorkerProcess()) return true;
  return (process.env['WORKER_INLINE'] ?? 'on').toLowerCase() !== 'off';
}
