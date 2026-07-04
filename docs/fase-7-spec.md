# Fase 7 — Email + Resource Model + Mapper + DevTools (spec de execução)

> Diretrizes 9/23/24/25/28/56/57. Duas frentes: (A) Email Platform (Gmail OAuth2 + SMTP real + EMAIL_SEND real), (B) Resource Model + Mapper + Resource Explorer + Schema Discovery + Console do Desenvolvedor + Developer Center (API keys). Data: 03/07/2026. Convenções iguais às fases 1–6 (namespacing, tenant, sem `any`, ACL, `@Auditable`, automatismos OFF, IA/fluxo nunca chama API direto, provider só via Registry).

---

## FRENTE A — Email Platform

### A.1 Provider `google-workspace` (categoria PRODUCTIVITY/COMMUNICATION) — Gmail OAuth2
- Já existe `smtp.provider.ts` (stub) e o node `EMAIL_SEND` stub em `automation/engine/nodes/comm.nodes.ts`. Completar.
- **OAuth2 (envs `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT`):** infra nova de OAuth no Integration Manager (a Fase 3 só fez token manual). Implementar:
  - `GET /api/integrations/oauth/google/start?connection_id=...` (autenticado) → devolve a URL de consentimento (scopes gmail.send, gmail.readonly, gmail.modify, userinfo.email) com `state` assinado (org+connection).
  - `GET /api/integrations/oauth/google/callback` (público) → troca `code` por access+refresh, grava no **Secret** da connection (`oauth_meta` com expires_at; refresh token cifrado DENTRO do encrypted_value), muda a connection de PENDING_AUTH→ACTIVE.
  - Refresh automático: helper no provider que renova o access token quando expira (usa refresh do secret), atualiza `oauth_meta`. Reautenticação quando refresh falha → connection TOKEN_EXPIRED.
- **execute() (Gmail REST via HTTP, sem SDK):** `email.send` (raw MIME base64url via `gmail.googleapis.com/gmail/v1/users/me/messages/send`), `email.list`/`email.search` (`q=`), `email.get`, `email.labels`, `email.threads`. discover() = labels + endereço.
- **Wizard:** passo "Entrar com Google" (botão que chama o start do OAuth) + modo manual/service-account opcional. metadata secretKind OAUTH.

### A.2 SMTP real (`smtp.provider.ts`)
- Dep `nodemailer`. `health()` = handshake real (verify()); `execute('email.send', {to,subject,html,text,attachments})` via transporter (host/port/security do config + user/pass do secret). from_email default do config.

### A.3 EMAIL_SEND real + Notification Center + tool IA
- No `EMAIL_SEND` node: resolver conexão de email (Email Orchestrator simples por tag/categoria, ou connection_id explícito) → `ConnectionsService.execute(connId, 'email.send', {...})`. Suporta template (Catálogo da Fase 4, canal EMAIL). dry-run loga.
- Notification Center: canal `email` passa a entregar de verdade (hoje fallback). 
- Tool IA `enviar_email` (Fase 5) passa de stub a real (via connection execute).
- Metering `emails` no UsageService; limite de plano `google_accounts`/`email_sends_month` conforme formato existente.

### A.4 ACL Email
Reusar `integrations.connections.*`. Se precisar de leitura de inbox no painel (opcional V1), `comm.email.read` — senão manter só envio. Manter enxuto.

---

## FRENTE B — Resource Model + Mapper + Explorer + DevTools

### B.1 Resource Model canônico (diretriz 9) — módulo `src/modules/resource/`
- Entidades canônicas como **modelo lógico** (não uma tabela por entidade de negócio — a plataforma NÃO é dona dos dados). Definir um catálogo de tipos canônicos em código: `Customer, Person, Company, Product, Order, Invoice, Payment, Contract, Ticket, ServiceOrder, Lead` — cada um com um schema de campos canônicos (id, name, document, email, phone, amount, due_date, status, ...). Extensões verticais (diretriz 50) como atributos extras (ISP: connection_status, olt, cto, slot) — declaradas, não hardcoded no core.
- Schema (`resource_*`): `ResourceMapping` (`resource_mappings`): id, org/ws/env, provider_key, connection_id?, resource_type (Customer/Invoice/...), source_operation (ex.: `cliente.dados`), field_map Json (`{canonicalField: sourcePath}`), extensions Json?, is_active. `ResourceMappingLog`? opcional. **Nenhum dado de negócio persistido** — só o mapeamento.

### B.2 Mapper + Mapper Inteligente (diretrizes 24/25)
- `ResourceMapperService.toCanonical(mapping, rawRecord)` aplica field_map → objeto canônico. `fromCanonical` opcional.
- **Mapper Inteligente (25):** endpoint que, dada uma amostra (via `discover()`/`execute` do provider) + os campos canônicos, a IA (LlmProviderService da Fase 5) **sugere** o field_map (nome/tipo/amostra). **Sugestão nunca aplica sozinha** — usuário revisa e confirma (automatismo OFF).
- Mapeamento concreto do Altarede: `Person/Customer ← cliente/dados`, `Invoice ← financeiro/boleto_aberto*`, `ServiceOrder/Ticket ← os/cadastrar + atendimento/*`, `Product ← cliente/planos`, extensão ISP (status via cliente/acesso, conectividade). Semear esses mappings (idempotente) como exemplo.

### B.3 Schema Discovery (diretriz 24) — providers de banco
- Providers DATABASE (PostgreSQL/SQL Server) — se ainda não existem, criar stubs mínimos no Registry com `discover()` que lista tabelas/campos/tipos (via connection). Se já há stub, ampliar discover(). Alimenta o Mapper e o Explorer.

### B.4 Resource Explorer (diretriz 23) — read-only
- `GET /api/resource/explore?connection_id&resource_type&query` → usa o mapping ativo + `IProvider.execute()` → lista/busca/detalhe **read-only** de dados canônicos (Clientes, Faturas, OS...). É também a tela de teste vivo do Mapper.

### B.5 Console do Desenvolvedor (diretriz 28) — "Postman interno"
- Módulo `src/modules/devtools/` (perm própria `devtools.*`): testar `IProvider.execute()` com payload livre, HTTP, **SQL read-only por default** (via connection DATABASE), tools da IA e chamadas de IA — tudo via conexões do Integration Manager, com auditoria (`@Auditable`) e IntegrationLog. Sem persistir dados de negócio.

### B.6 Developer Center / API Keys (diretriz 57) — camadas Internal→SDK→Public
- Schema `developer_*`: `ApiKey` (`developer_api_keys`): id, org, name, prefix, hashed_key (scrypt/sha), scopes String[], last_used_at, expires_at?, revoked_at?, created_by. Endpoints: criar (retorna a chave uma vez), listar (só metadados), revogar. Guard `ApiKeyGuard` para a **Public API** versionada (`/api/v1/...`) — uma fachada estável; nunca expor endpoints internos direto. OpenAPI/Swagger já habilitado (Fase 1) — documentar a v1 pública.

### B.7 ACL frentes B
Grupos: "Recursos" (`resource.mappings.read/write`, `resource.explore.read`, `resource.mapper.suggest`), "Desenvolvedor" (`devtools.use`, `developer.apikeys.read`, `developer.apikeys.manage`). Labels pt-BR. Administrador herda tudo; Operador `.read`. Perfil opcional "Desenvolvedor".

---

## Frontend (`platform-admin`)
- **Email:** o wizard de conexão google-workspace/smtp já sai do metadata (Connection Wizard declarativo) — garantir o botão "Entrar com Google" (abre a URL do start do OAuth em nova aba/popup e faz polling do status da connection). Nada de tela nova grande; reusar Conexões/Wizard.
- **Recursos:** `pages/Recursos/Mapeamentos.jsx` (CRUD de ResourceMapping + botão "Sugerir com IA" que traz o field_map sugerido pra revisão) e `pages/Recursos/Explorer.jsx` (selecionar conexão+tipo → listar/buscar/detalhe read-only). Serviço `services/resource.js`.
- **DevTools:** `pages/Desenvolvedor/Console.jsx` (Postman interno: escolher conexão/operação/SQL/tool/IA + payload → executar → resposta+log) e `pages/Desenvolvedor/ApiKeys.jsx` (criar/listar/revogar, mostrar a chave uma vez com aviso). Serviço `services/devtools.js`.
- Rotas `/recursos/*`, `/desenvolvedor/*` com `PermissionRoute`. Nav: grupos "Recursos" e "Desenvolvedor" (ícones `Database`/`Boxes`, `Terminal`/`KeyRound`).

## Verificação e fechamento
Gate estático (prisma generate + tsc + vite) roda no servidor (mount pode bloquear). Revisão de seams via file tools. READMEs dos módulos; CHANGELOG; checkpoint/estado. `db push` destrutivo. Deps novas: `nodemailer` (+ `@types/nodemailer`).

## Fora de escopo
MS365/IMAP (arquitetura pronta, produto depois). Analytics separado (diretriz 34) = Fase 8. GraphQL, SDK publicável npm = pós-V1. Nenhum dado de negócio persistido em lugar nenhum.
