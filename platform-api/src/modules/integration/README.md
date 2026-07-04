# Integration Manager (Fase 2)

Plataforma de integrações do IA Studio — diretrizes 1, 2, 5, 21, 43, 48, 51, 52 e a spec do Connection Wizard.

**Linguagem oficial (diretriz 52):** **Provider** = tipo/conector (Altarede, OpenAI, Meta…); **Instance (Connection)** = a conexão nomeada configurada. Conexão **NUNCA é excluída** — não existe endpoint DELETE; só mudança de estado via state machine.

## Submódulos

| Pasta | Responde a pergunta |
|---|---|
| `registry/` | "Quais implementações IProvider existem e como resolvê-las por key?" |
| `marketplace/` | "Quais conectores existem no catálogo e quais a organization instalou?" |
| `connections/` | "Como criar/testar/operar as Instances e registrar seus logs de integração?" |
| `secrets/` | "Onde vivem as credenciais cifradas e quem pode acessá-las?" |
| `storage/` | "Como qualquer módulo grava/lê arquivos (Local ou S3)?" |

## registry/ — Provider Registry (diretriz 2)

- `ProviderRegistryService`: mapa em memória `key → IProvider`. Proibido switch por `provider_key` fora daqui.
- Interface única em `src/shared/integration/provider.interface.ts`: `metadata() / connect / disconnect / health / execute(operation, params) / discover` com `ctx = { connection, secrets: SecretsAccessor, logger }`.
- `ProviderSeedService` (boot, create-if-missing): semeia `ProviderDefinition` (`integration_providers`) a partir do `metadata()` das implementações + `provider-catalog.ts` (whatsapp-meta, catálogo-only até a Fase 3). Nunca sobrescreve — curadoria posterior é do Console.
- Implementações da Fase 2 (`registry/providers/`):
  - **altarede** (ERP): stub HTTP genérico — `execute` chama a API com appkey/token do Secret. Operações: `cliente.dados`, `financeiro.boleto_aberto`, `cliente.acesso`, `cliente.desbloqueio`, `os.cadastrar`, `conectividade.listar_com_status`.
  - **openai / anthropic** (AI): health = GET `/v1/models` com a API Key; `discover` lista modelos.
  - **postgresql** (DATABASE): health via socket TCP (`require('net')`) — sem driver `pg` nesta fase.
  - **smtp / s3**: health stub OK (validação de configuração; handshake real nas Fases 7 / Storage).
  - **whatsapp-meta**: só definição de catálogo — implementação (Embedded Signup oficial) na Fase 3.

## marketplace/ (diretrizes 1/43/48)

- `GET /api/v1/marketplace` — catálogo com flag `installed` + `has_implementation`, filtros `category`/`search`. Perm `integrations.marketplace.read`.
- `POST /api/v1/marketplace/:key/install|uninstall` — perm `integrations.marketplace.manage`. Uninstall bloqueado se houver conexão não-DISABLED do provider.
- Console: `GET/POST/PATCH /api/v1/console/marketplace` — curadoria de `ProviderDefinition` (`@PlatformAdminOnly`). `key` é imutável.

## connections/ (diretriz 52 + Connection Wizard)

- `POST /connections` `{ provider_key, name, workspace_id, environment_id, config, secrets }` → valida escopo (tenant.util) → exige provider instalado → `LimitsService.assertCountWithin('connections')` → cria Secret (campos secretos do wizard **nunca** entram no `config`; defesa extra: `stripSecretFields` pelo `wizard_schema`) → Connection `PENDING_AUTH` → `connect()`+`health()` → `ACTIVE`/`ERROR`. Metering `UsageService.increment('connections')`.
- `PATCH /connections/:id` — nome/tags/prioridade. `PATCH /connections/:id/state` `{ action: enable|disable|maintenance }` — via `assertConnectionTransition` (`connection-state.machine.ts`). DISABLED/MAINTENANCE são estados "do usuário": health não os sobrepõe.
- `POST /connections/:id/test` — health → atualiza `last_health_at/last_health_ok/status`.
- `POST /connections/:id/execute` `{ operation, params }` — perm `integrations.connections.execute`; exige status ACTIVE; grava `IntegrationLog` (direção, operação, status, `duration_ms`, metas com redact, `trace_id`) — diretriz 55.
- `GET /connections/:id/logs` — perm `integrations.logs.read`.

## secrets/ (diretriz 5)

- Um Secret por conexão: `encrypted_value` = JSON `{campo: valor}` em **AES-256-GCM** (`shared/crypto`).
- `getDecryptedMap`/`accessorFor` são **internos** — nenhum endpoint devolve valor decifrado; `GET /secrets` lista só metadados (nome, kind, campos, `rotated_at`).
- `POST /secrets/:id/rotate` `{ values }` — perm `integrations.secrets.manage`; marca `rotated_at`; auditado (valores nunca logados).

## storage/ (diretriz 21)

- `IStorageDriver` (`put/get/delete/signedUrl?`): **LocalDriver** (`STORAGE_LOCAL_PATH`, default `./storage`, guard anti path-traversal) e **S3Driver** (SigV4 implementado com crypto nativo em `sigv4.util.ts` — sem SDK; AWS S3/R2/MinIO; config via envs `S3_*` ou `configure()` com dados de uma connection s3).
- `StorageService.save(buffer, meta)` → grava `StorageFile` + `UsageService.increment('storage_bytes')`. Seleção do driver: env `STORAGE_DRIVER` (`local` default | `s3`).
- `GET /storage/files` e `GET /storage/files/:id` (download autenticado, org-scoped). Sem perm própria de storage nesta fase — gating por `integrations.connections.read`.

## ACL

Grupo "Integrações" em `permissions.constants.ts`: `integrations.marketplace.read/manage`, `integrations.connections.read/write/execute`, `integrations.secrets.read/manage`, `integrations.logs.read`. Administrador herda tudo (`ALL_PERMISSIONS`); Operador herda os `.read` automaticamente.

## Auditoria e logs

- Mutations sensíveis → `AuditLogService.record` (install/uninstall, create/update/estado de connection, create/rotate de secret, curadoria de definition).
- Chamadas a providers → `IntegrationLog` (`integration_logs`), natureza própria (diretriz 55) — nunca derruba a operação.

## Envs

| Env | Default | Uso |
|---|---|---|
| `STORAGE_DRIVER` | `local` | Driver do Storage Manager (`local`/`s3`) |
| `STORAGE_LOCAL_PATH` | `./storage` | Raiz do driver local |
| `S3_ENDPOINT/S3_REGION/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY` | — | Config do S3Driver quando não vem de connection |
| `ENCRYPTION_KEY` | — (obrigatória em prod) | AES-256-GCM dos secrets |
