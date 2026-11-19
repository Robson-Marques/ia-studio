# Módulo `automation` — Automation Platform (Fase 4)

> Event Bus + Workflow Engine + Scheduler + Execution Monitor + Catálogo de
> Templates + Notification Center. Diretrizes: 3 (versões estilo git), 7 (Event
> Bus), 8 (broker abstraído), 11 (templates), 12 (scheduler visual), 13
> (monitor), 22 (notificações), 27 (dry-run), 29 (export/import), 33 (workers),
> 49 (pipeline do engine).

## Arquitetura

```
shared/broker/        IMessageBroker (token MESSAGE_BROKER) + BullMqBroker (único arquivo que importa bullmq/ioredis)
shared/events/        EventBusService (publish/replay) + automation_event_log (dedup por source_event_id @unique)
modules/automation/
├── engine/           NodeRegistry (definition+executor+validator), VariableResolver ({{input.*}}/{{vars.*}}/{{workflow.*}}/{{env.*}}),
│   │                 WorkflowEngineService (DAG, edges com condição, dry-run, pausa via broker), ExecutionsRepository
│   └── nodes/        core (TRIGGER_MANUAL/EVENT/SCHEDULE/WEBHOOK, CONDITION, DELAY) · integration (HTTP_REQUEST, CONNECTION_EXECUTE)
│                     · comm (WHATSAPP_SEND, EMAIL_SEND stub Fase 7, NOTIFY) · platform (TEMPLATE_RENDER, EVENT_PUBLISH)
├── workflows/        CRUD + versões IMUTÁVEIS (publicar = apontar current_version; rollback = repontar) + execute + export/import
├── executions/       Execution Monitor (filtros, timeline por nó, retry, cancel)
├── scheduler/        schedule.util (computeNextRuns puro: interval/daily/weekly/monthly/cron/business_day + calendário),
│                     SchedulerService (sync no publish, preview, calendários), SchedulerCron (a cada minuto, gated)
├── templates/        Catálogo multi-canal (WHATSAPP/EMAIL/SMS/PUSH/PDF/HTML/MARKDOWN) + render {{variáveis}}
├── notifications/    NotificationCenterService (canal explícito > fallback whatsapp→email→in-app) + sino in-app + log de entrega
├── events/           GET /automation/events + POST /:id/replay
├── webhooks/         POST /api/webhooks/flows/:token (@Public + throttle) — TRIGGER_WEBHOOK
└── worker/           processors.gate (WORKER_INLINE/IASTUDIO_ROLE) + AutomationProcessors (3 filas)
```

## Fluxo de execução (diretriz 33 — a API enfileira, o worker executa)

1. Gatilho (manual/evento/agendamento/webhook) → `WorkflowsService.startExecution`
   cria `automation_executions` (QUEUED, dedup por `source_event_id`) e
   enfileira em `automation-executions` (jobId = execution.id).
2. Processor chama `WorkflowEngineService.run`: percorre o grafo, interpola
   variáveis, executa cada nó via NodeRegistry, grava `automation_execution_logs`
   por nó. `DELAY` > 30s pausa e re-agenda a continuação via broker (estado no
   job, nada em memória). Cancelamento é cooperativo (checado entre nós).
3. Evento publicado no bus (`EventBusService.publish`): persiste (dedup) →
   EventEmitter2 (assinantes síncronos, compat Fase 3) → fila `automation-events`
   → dispatcher casa com fluxos PUBLICADOS de gatilho `event` da própria
   instalação.

## Worker vs inline (fallback dev)

- `src/worker.ts` (`npm run start:worker`) → processo dedicado (`IASTUDIO_ROLE=worker`).
- `WORKER_INLINE` (default **on**): a API também processa as filas — dev funciona
  sem Redis/worker. Produção: install liga `WORKER_INLINE=off` + PM2 `iastudio-worker`.
- Sem Redis (`REDIS_URL`), o BullMqBroker loga warn e cai em fallback em memória
  (dispatch direto no processo, delay via setTimeout) — só pra dev.

## Endpoints (prefixo /api/v1)

| Rota | Perm |
|---|---|
| GET/POST `automation/workflows`, GET/PATCH `/:id`, POST `/:id/archive` | `automation.workflows.read/write` |
| GET `automation/workflows/nodes/catalog`, GET `/:id/versions`, GET `/:id/export` | `automation.workflows.read` |
| POST `/:id/versions` (salvar = nova versão), POST `import` | `automation.workflows.write` |
| POST `/:id/publish` (publicar/rollback), POST `/:id/webhook-token/rotate` | `automation.workflows.publish` |
| POST `/:id/execute` (input JSON + dry_run) | `automation.workflows.execute` |
| GET `automation/executions[/:id]` | `automation.executions.read` |
| POST `automation/executions/:id/retry|cancel` | `automation.executions.retry` |
| POST `automation/schedule/preview`, GET `automation/schedule[, /calendars]` | `automation.workflows.read` |
| POST/PATCH/DELETE `automation/schedule/calendars` | `automation.calendars.manage` |
| CRUD `automation/templates` + POST `/:id/render` | `automation.templates.read/write` |
| GET `automation/events`, POST `/:id/replay` | `automation.events.read/retry` |
| GET `automation/notifications/log`, POST `send` | `automation.notifications.read` |
| GET `automation/notifications/inbox`, POST `inbox/:id/read`, `inbox/read-all` | autenticado (escopo do próprio usuário) |
| POST `/api/webhooks/flows/:token` | pública (@Public + throttle + token opaco) |

## Decisões

- **Editor em lista vertical** nesta fase; o canvas React Flow (Fase 5) consome o
  MESMO grafo `{nodes, edges}` — Canvas é só representação visual.
- **EMAIL_SEND/e-mail do hub são stub** até a Fase 7 (Email Platform) — logam e
  seguem, nunca quebram o fluxo.
- **Preferência de canal do destinatário** no Notification Center: reservado
  (sem cadastro na Fase 4) — resolução usa canal explícito > fallback.
- Horários do scheduler no fuso do servidor.
- `executions_month` (limite do plano) é conferido contra o consumo medido
  `executions` do período corrente.
