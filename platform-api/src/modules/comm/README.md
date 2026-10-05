# Módulo `comm` — Communication Platform / WhatsApp Meta Cloud API (Fase 3)

Canal WhatsApp **oficial-only (Meta Cloud API)**, portado do Aquapark para a
instalação dedicada. Não há organização, workspace, ambiente, limite comercial
nem dependência de solução não oficial.

## Arquitetura

- **Conexão = `Connection` do Integration Manager** (`provider_key = 'whatsapp-meta'`). NÃO existe tabela própria de conexão (diretriz 52).
  - **Secret da conexão** (Secrets Manager, AES-256-GCM): `access_token`, `app_secret`, `verify_token`.
  - **`Connection.config`** (não sensível): `phone_number_id`, `waba_id` (roteiam o webhook), `department`, `is_default` + espelho do sync (`display_name`, `phone`, `quality_rating`, `messaging_limit`).
- **Provider `WhatsappMetaProvider`** (`integration/registry/providers/whatsapp-meta.provider.ts`): `connect` valida o token (GET phone number), `health` (token/número/templates), `execute` (`sendText`/`sendTemplate`/`sendMedia`/`sendRich`/`listTemplates`/`createTemplate`/`syncStatus`/`downloadMedia`) e `discover` (números da WABA + templates). A conexão pertence somente à instalação local.
- **Cliente Graph API**: `shared/integration/meta-graph.client.ts` (fetch nativo + `MetaApiError` com o código Meta — ex.: **131047** = fora da janela de 24h). Tipos `RichMessage`/`NormalizedMessage`/janela em `shared/integration/whatsapp.types.ts`.

## Sub-áreas

| Pasta | Responsabilidade |
|---|---|
| `whatsapp/whatsapp-orchestrator.service.ts` | **Meta Orchestrator** — o chamador NUNCA conhece o número: resolve a Connection por `criteria` (connectionId explícito → tag/departamento → `is_default` → maior `priority` entre ACTIVE); envia via `ConnectionsService.execute` (IntegrationLog + `last_used_at`), grava o outbound na inbox (a Meta não ecoa) e calcula `windowState(connection, phone)`. |
| `whatsapp/whatsapp-webhook.controller.ts` | Rota pública **`GET/POST /api/webhooks/whatsapp`** (VERSION_NEUTRAL, sem `/v1`). GET valida `hub.verify_token` contra o secret das conexões locais whatsapp-meta. POST valida **HMAC `x-hub-signature-256`** (rawBody) com o `app_secret` da conexão dona do `phone_number_id` e despacha por `field`. |
| `whatsapp/whatsapp-inbound.service.ts` | Persiste chat/mensagem (dedup por `wamid`; `unread_count`, `last_inbound_at` = base da janela de 24h), reabre conversa CLOSED (SYSTEM), atualiza ACKs (sent/delivered/read/failed → IntegrationLog em falha), sincroniza status de template e **emite `whatsapp.inbound.message`** com `trace_id` e `source_event_id`. |
| `whatsapp/whatsapp-smart-send.service.ts` | **Smart-send**: dentro da janela de 24h → texto livre; fora (`expired`/`none`) → template HSM (`coldTemplate` no 1º contato); recusa Meta **131047** → backstop no template. `skipIfWithinWindow` p/ emissores que não interrompem conversa ativa. Porta de envio das Fases 4-5. |
| `whatsapp/whatsapp-inbox.*` | Conversas: listagem com **escopo de visibilidade** (abas mine/unassigned/team/all ∩ perms `comm.whatsapp.view.*`), mensagens, janela, envio manual (reply gate + janela; fora de 24h exige template — 409 amigável), proxy de mídia inbound (`downloadMedia` base64). |
| `whatsapp/whatsapp-templates.*` | Catálogo `comm_whatsapp_templates` **bidirecional**: criar no painel → publica na Meta (DRAFT→PENDING); sync puxa a WABA (status/razão de rejeição) e publica rascunhos. |
| `whatsapp/whatsapp-sync.service.ts` | **Cron a cada 10 min** (`@nestjs/schedule`): por conexão ACTIVE → display name, qualidade, limite de mensagens, templates → `comm_whatsapp_sync_state` + espelho no config; mudança de qualidade gera IntegrationLog. |
| `whatsapp/whatsapp-numbers.controller.ts` | Painel **Números**: conexões whatsapp-meta com qualidade/limite/status/health + sync manual. |
| `attendance/` | **Central de Atendimento**: `chat-assignment.service` (claim/release/transfer/close/reopen/takeover com **lock otimista** — 2º concorrente recebe 409 — e trilha `comm_whatsapp_chat_events`), `reply-gate.service` (claim implícito; conversa de outro → 409 `NEEDS_TAKEOVER_CONFIRMATION` → reenvio com `confirm_takeover`), `chat-scope.resolver` (cache 30s), state machine `OPEN ↔ IN_PROGRESS → CLOSED` (reopen → sempre OPEN), equipes/filas/membros com **soft-delete** + checagem de integridade. |

## Tabelas (`comm_*`, locais à instância dedicada)

`comm_whatsapp_chats`, `comm_whatsapp_messages`, `comm_whatsapp_chat_events`, `comm_whatsapp_templates`, `comm_whatsapp_sync_state`, `comm_attendance_teams`, `comm_attendance_queues`, `comm_attendance_members`.

## ACL (grupo "WhatsApp")

`comm.whatsapp.view.{assigned,unassigned,team,all}`, `reply.{assigned,team,all}`, `claim`, `transfer`, `close`, `teams.{read,manage}`, `queues.{read,manage}`, `templates.{read,manage}`, `numbers.read`. Perfil de sistema **Atendente WhatsApp** criado no provisionamento; Administrador herda tudo; Operador herda os `*.read`.

## Endpoints principais

- `GET/POST /api/webhooks/whatsapp` (@Public + throttle) — webhook Meta.
- `GET /comm/whatsapp/scope|chats|chats/:id|chats/:id/messages|chats/:id/window|chats/:id/media/:mediaId`
- `POST /comm/whatsapp/chats/:id/{send,read,claim,release,transfer,close,reopen}` + `GET :id/timeline`
- `POST /comm/whatsapp/send` — envio pelo orchestrator (criteria tag/departamento; sem número).
- `GET/POST /comm/whatsapp/templates` + `POST /comm/whatsapp/templates/sync`
- `GET /comm/whatsapp/numbers` + `POST /comm/whatsapp/numbers/:id/sync`
- `GET/POST/PATCH /comm/attendance/{teams,queues}` + membros + `GET /comm/attendance/users`

## Wizard Meta (Connection Wizard)

Passo informativo **"Fluxo oficial (Embedded Signup)" — EM BREVE** (exige App Meta aprovado / Tech Provider) + modo **manual** (Phone Number ID, WABA ID, Access Token, App Secret, Verify Token) + passo de roteamento (departamento, conexão padrão) + teste final. A definição no catálogo local é atualizada no boot (`REFRESH_KEYS`) porque o wizard da Fase 2 não capturava app_secret/verify_token.

## Decisões e limitações desta fase (documentadas)

1. **`phone_number_id`/`waba_id` ficam no `config`** (não no Secret): são identificadores não sensíveis e o webhook precisa deles para rotear sem decifrar os secrets locais.
2. **Realtime = polling 5s** no front (lista + conversa aberta). WebSocket fica pra fase posterior (Notification Center/Event Bus — Fase 4).
3. **Mídia outbound por URL pública** (a Meta baixa por link); upload via Storage Manager entra quando o fluxo de anexos for necessário. **Mídia inbound** é baixada da Meta sob demanda (proxy autenticado, base64) — sem armazenamento local nesta fase.
4. **Embedded Signup/OAuth**: arquitetura pronta no wizard (passo informativo); ativação depende da aprovação do App Meta.
5. Cron de sync roda no processo da API (worker BullMQ separado chega na Fase 4 com o Message Broker — diretriz 33; o sync é idempotente e guarda estado no banco).
6. Webhook responde 200 pra payloads de números desconhecidos (não vaza existência; a Meta não fica re-tentando).
