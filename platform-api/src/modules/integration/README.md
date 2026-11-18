# Integration Manager (Fase 2)

Plataforma de integrações do IA Studio — diretrizes 1, 2, 5, 21, 43, 48, 51, 52 e a spec do Connection Wizard.

**Linguagem oficial (diretriz 52):** **Provider** = tipo/conector (IXC, OpenAI, Meta…); **Instance (Connection)** = a conexão nomeada configurada. Conexão **NUNCA é excluída** — não existe endpoint DELETE; só mudança de estado via state machine.

## Submódulos

| Pasta | Responde a pergunta |
|---|---|
| `registry/` | "Quais implementações IProvider existem e como resolvê-las por key?" |
| `catalog/` | "Quais providers ativos e implementados esta instalação pode configurar?" |
| `connections/` | "Como criar/testar/operar as Instances e registrar seus logs de integração?" |
| `secrets/` | "Onde vivem as credenciais cifradas e quem pode acessá-las?" |
| `storage/` | "Como qualquer módulo grava/lê arquivos (Local ou S3)?" |

## registry/ — Provider Registry (diretriz 2)

- `ProviderRegistryService`: mapa em memória `key → IProvider`. Proibido switch por `provider_key` fora daqui.
- Interface única em `src/shared/integration/provider.interface.ts`: `metadata() / connect / disconnect / health / execute(operation, params) / discover` com `ctx = { connection, secrets: SecretsAccessor, logger }`.
- `ProviderSeedService` (boot, create-if-missing): semeia `ProviderDefinition` (`integration_providers`) a partir do `metadata()` das implementações. O catálogo é local à instância.
- Implementações da Fase 2 (`registry/providers/`):
  - **ixc** (ERP): contrato ISP e operações genéricas com Basic Auth. A extensão
    de leitura `atendimento.listar_chamados_recentes` retorna no máximo cinco
    `su_ticket` do cliente, em ordem decrescente, para uma tool ISP projetar ao
    assistente; não grava nem oferece busca livre ao modelo.
  - **openai / anthropic** (AI): health = GET `/v1/models` com a API Key; `discover` lista modelos.
  - **postgresql** (DATABASE): health via socket TCP (`require('net')`) — sem driver `pg` nesta fase.
  - **smtp / s3**: health stub OK (validação de configuração; handshake real nas Fases 7 / Storage).
  - **whatsapp-nivoo**: método oficial; consome a Central Nivoo/Meta, com chave interna no Secrets Manager e onboarding hospedado pela Central.
  - **whatsapp-waha**: método não oficial por QR Code; container e chave técnica provisionados localmente, uma sessão e um segredo HMAC por Connection, várias conexões e automações desligadas por padrão. `whatsapp-meta` direto e `whatsapp-ycloud` permanecem aposentados; conexões/logs históricos ficam, segredos exclusivos são removidos.

## catalog/ (diretrizes 1/43/48)

- `ProviderCatalogService` lista somente `ProviderDefinition` ativo com
  implementação registrada e valida o provider antes de criar ou editar uma
  conexão.
- Uma definição ou conexão histórica sem implementação registrada é preservada
  no banco, mas não aparece na lista operacional nem pode voltar a ser usada
  por uma tool, fluxo ou wizard.
- Não existe instalação ou desinstalação de conector: o provider já acompanha a
  instalação; a ação operacional é configurar uma Connection.
- O estado físico legado de instalação não é lido nem escrito, para que upgrades
  existentes permaneçam não destrutivos.

## connections/ (diretriz 52 + Connection Wizard)

- `GET /connections` e `GET /connections/providers` → somente conexões e
  providers com implementação registrada que podem operar ou ser configurados.
  Perm `integrations.connections.read`.
- `POST /connections` `{ provider_key, name, config, secrets }` → exige provider disponível → cria Secret (campos secretos do wizard **nunca** entram no `config`; defesa extra: `stripSecretFields` pelo `wizard_schema`) → Connection `PENDING_AUTH` → `connect()`+`health()` → `ACTIVE`/`ERROR`.
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
- `StorageService.save(buffer, meta)` grava `StorageFile` local à instância. Seleção do driver: env `STORAGE_DRIVER` (`local` default | `s3`), sem metering comercial.
- `GET /storage/files` e `GET /storage/files/:id` fazem download autenticado local. Sem perm própria de storage nesta fase — gating por `integrations.connections.read`.

## ACL

Grupo "Integrações" em `permissions.constants.ts`: `integrations.connections.read/write/execute`, `integrations.secrets.read/manage`, `integrations.logs.read`. Administrador herda tudo (`ALL_PERMISSIONS`); Operador herda os `.read` automaticamente.

## Auditoria e logs

- Mutations sensíveis → `AuditLogService.record` (create/update/estado de connection, create/rotate de secret).
- Chamadas a providers → `IntegrationLog` (`integration_logs`), natureza própria (diretriz 55) — nunca derruba a operação.

## Envs

| Env | Default | Uso |
|---|---|---|
| `STORAGE_DRIVER` | `local` | Driver do Storage Manager (`local`/`s3`) |
| `STORAGE_LOCAL_PATH` | `./storage` | Raiz do driver local |
| `S3_ENDPOINT/S3_REGION/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY` | — | Config do S3Driver quando não vem de connection |
| `ENCRYPTION_KEY` | — (obrigatória em prod) | AES-256-GCM dos secrets |
