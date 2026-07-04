# IA Studio — platform-api (Fase 1)

API da plataforma **IA Studio** (SaaS multi-tenant). Monolito modular **NestJS 10 + Fastify 4 + Prisma 5** sobre PostgreSQL único (`iastudio_db`).

Fase 1 entrega o **Core SaaS**: autenticação com 2 atores, Organizations → Workspaces → Environments, usuários/convites/perfis (ACL granular), feature flags segmentadas, settings, auditoria com diff, Licensing (planos/licenças/limites/metering) e o schema/CRUD mínimo de Billing.

## Rodando

```bash
cp .env.example .env        # ajustar DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY
npm install
npx prisma db push --accept-data-loss   # PROIBIDO migrations — schema.prisma é a fonte única
npx prisma generate
npm run build
npm run start                # ou start:dev
```

Swagger: `http://localhost:3000/api/docs`. Prefixo global: `/api/v1`.

### Variáveis de ambiente

| Env | Descrição |
|---|---|
| `DATABASE_URL` | PostgreSQL (`iastudio_db`) |
| `JWT_SECRET` | Segredo JWT (≥32 chars — obrigatório em produção) |
| `ENCRYPTION_KEY` | Chave AES-256-GCM (≥32 chars em produção) — base do Secrets Manager (Fase 2) |
| `PORT` | Porta HTTP (default 3000) |
| `CORS_ORIGINS` | Origens permitidas, separadas por vírgula |
| `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` | Credenciais do admin de plataforma no seed (defaults `admin@iastudio.local` / `admin123` — trocar!) |
| `NODE_ENV` | `production` ativa exigência de segredos fortes |
| `THROTTLE_TTL_MS` / `THROTTLE_LIMIT` | Rate limit global (default 1000 req/min) |

## Seed de primeira instalação

No boot, **se não houver nenhum usuário**, o `SeedService` cria (idempotente):
- Planos **Starter** (trial 14d, limites da diretriz 39), **Professional** e **Enterprise** (`limits: {}` = ilimitado, todas as features);
- **Admin de plataforma** (`PLATFORM_ADMIN_EMAIL`) — ator do Console;
- Organization **Demo** completa (workspace Principal + ambiente Produção + perfis Administrador/Operador + licença TRIAL + assinatura TRIALING + usuário `admin@demo.local` / `demo123`).

## Autenticação e ACL

- **Login único** (`POST /api/v1/auth/login`) para os dois atores: `is_platform_admin=true` → ator `platform` (Console); demais → ator `org`. JWT de 8h (`{ sub, email, actor, organization_id, profile_id }`).
- Guards globais (nesta ordem): `ThrottlerGuard` → `JwtAuthGuard` (`@Public()` isenta) → `PlatformAdminGuard` (`@PlatformAdminOnly()` nas rotas `/console/*`) → `PermissionsGuard` (`@RequirePermissions(...)`, lógica OR).
- Permissões de usuário org = perfil do usuário ∪ perfil do `WorkspaceMember` quando o header `x-workspace-id` está presente. Platform admin tem bypass (`['*']`).
- Catálogo em `src/shared/permissions.constants.ts`: `core.users.read/write/inactivate`, `core.invites.read/write`, `core.profiles.read/write`, `core.workspaces.read/write`, `core.environments.read/write`, `core.audit.read`, `core.settings.read/write`, `account.read`, `license.read`. Perfis de sistema: **Administrador** (todas) e **Operador** (`*.read`).

### Escopo de tenant

- Ator `org`: **toda** query é filtrada pela `organization_id` do JWT (nunca do input).
- Platform admin nos endpoints não-console pode operar uma org via query `?organization_id=`.
- Headers opcionais `x-workspace-id` / `x-environment-id` indicam o escopo operacional (helpers em `src/shared/auth/tenant.util.ts`, com `validateWorkspaceScope` validando contra a org).

## Módulos e endpoints (prefixo `/api/v1`)

### core/auth
- `POST /auth/login` (público, 5/min) — JWT 8h; grava SecurityLog e `last_login_at`. Licença suspensa **não** bloqueia login (restrição é por feature/limite).
- `GET /auth/me` — user + organization + workspaces + permissões efetivas + status da licença.
- `POST /auth/change-password` — troca senha e **revoga tokens antigos** (`jwt_revoked_at`).

### core/organizations (Console)
- `GET|POST /console/organizations`, `GET|PATCH /console/organizations/:id` — `@PlatformAdminOnly`.
- `POST` provisiona: workspace **Principal** + ambiente **Produção** (PRODUCTION, default) + perfis de sistema + **licença TRIAL** do plano (default Starter) + **assinatura TRIALING** (+ admin inicial opcional). Sem DELETE (desativar via `is_active`).

### core/workspaces
- `GET|POST /workspaces`, `GET|PATCH /workspaces/:id` (`core.workspaces.*`) — criação checa limite `workspaces` do plano; todo workspace nasce com ambiente Produção default.
- `GET|POST /workspaces/:id/environments`, `PATCH /workspaces/:id/environments/:envId` (`core.environments.*`) — 1 ambiente por `kind` por workspace; `is_default` único.

### core/users
- `GET|POST /users`, `GET|PATCH /users/:id` (`core.users.read/write`) — criação/reativação checam limite `users`.
- `DELETE /users/:id` (`core.users.inactivate`) — **soft-delete** (`deleted_at` + `is_active=false` + revogação de sessão). Nunca hard-delete. `POST /users/:id/activate` reativa.
- Membros de workspace: `GET|POST /users/:id/workspaces`, `DELETE /users/:id/workspaces/:workspaceId`.

### core/invites
- `GET|POST /invites`, `DELETE /invites/:id` (`core.invites.*`) — token uuid, expira em 7 dias; revogar = expirar (registro preservado). V1: link copiado manualmente (sem envio de email).
- `POST /auth/invites/:token/accept` (público) — cria o usuário com a senha enviada (ou vincula usuário existente da org) + membership/perfil pré-definidos; grava `INVITE_ACCEPTED`.

### core/profiles
- `GET|POST /profiles`, `GET|PATCH|DELETE /profiles/:id` (`core.profiles.*`) — perfis de sistema não editáveis; soft-delete bloqueado se em uso.
- `GET /profiles/permissions-catalog` — catálogo (permissões + grupos + labels pt-BR).

### core/flags
- `GET /flags/effective` — resolve todas as flags pro ator (precedência override **user > profile > workspace > org > flag global**; `expires_at` vencido = OFF).
- Console: `GET|POST /console/flags`, `PATCH /console/flags/:id`, `POST /console/flags/:id/overrides`, `DELETE /console/flags/:id/overrides/:overrideId`.
- Interno: `FeatureFlagsService.isEnabled(key, ctx)` (cache 30s). Flag desconhecida = OFF (automatismo nasce OFF).

### core/settings
- `GET /settings`, `GET /settings/:key`, `PUT /settings/:key` (`core.settings.*`) — chave/valor Json por organization (toggles de usuário moram no banco).

### core/audit
- `GET /audit` (`core.audit.read`) — trilha da própria org (filtros entity/action/actor/período + paginação).
- `GET /console/audit` (`@PlatformAdminOnly`) — visão global, filtro opcional por org.
- Escrita: `AuditLogService.record()` (old_value/new_value com **redact** de password/token/secret/api_key) + decorator `@Auditable` simples. Security logs separados (`SecurityLogService` — diretriz 55).

### licensing
- Console: `GET|POST|PATCH /console/licensing/plans`; `GET /console/licensing/licenses`, `PATCH /:id`, `POST /:id/activate`, `POST /:id/regenerate-key` (chave `XXXX-XXXX-XXXX-XXXX`).
- Org: `GET /account/license` (`license.read`/`account.read`) — plano, limites efetivos, uso do mês.
- Interno: `LimitsService.checkLimit(orgId, metric, incremento)` (métricas medidas) e `assertCountWithin(...)` (métricas estruturais: users, workspaces...); `UsageService.increment/getUsage` (upsert por `organization/workspace/metric/period YYYY-MM`). Licença RESTRICTED/SUSPENDED/EXPIRED bloqueia criação de recursos — **nunca apaga dados**.

### billing (Console)
- `GET|POST /console/billing/subscriptions`, `PATCH /:id`; `GET|POST /console/billing/coupons`; `GET|POST /console/billing/charges`, `PATCH /charges/:id/status`.
- `BillingService.evaluateStatus()` é **stub documentado** (grace → RESTRICTED → SUSPENDED; cadeia Billing→Licensing entra na fase do gateway). **Nenhum módulo consulta Billing** (diretriz 53) — o módulo não exporta providers.

## Convenções (herdadas do CLAUDE.md)

- `schema.prisma` é a fonte única — evolução via `npx prisma db push --accept-data-loss` (proibido migrations/ALTER TABLE).
- Lógica em services; acesso a DB **só** via `*.repository.ts`; DTOs `class-validator`; sem `any`; `Logger` do Nest; mensagens de erro em pt-BR.
- Toda tabela operacional carrega `organization_id` (e `workspace_id`/`environment_id` quando aplicável).
- Crypto AES-256-GCM em `src/shared/crypto/crypto.util.ts` (base do Secrets Manager — Fase 2).

## Estrutura

```
platform-api/
├── prisma/schema.prisma          # core_* / licensing_* / billing_* / system_settings
├── src/
│   ├── main.ts                   # Fastify + /api/v1 + Swagger /api/docs + CORS
│   ├── app.module.ts             # guards globais (Throttler → Jwt → PlatformAdmin → Permissions)
│   ├── shared/
│   │   ├── prisma/               # PrismaService (@Global)
│   │   ├── crypto/crypto.util.ts # AES-256-GCM
│   │   ├── permissions.constants.ts
│   │   ├── auth/                 # strategy, guards, decorators, password.util, tenant.util
│   │   └── audit/                # request-context (ALS), AuditLogService, SecurityLogService, @Auditable
│   └── modules/
│       ├── core/{auth,organizations,workspaces,users,invites,profiles,flags,settings,audit,seed}/
│       ├── licensing/            # plans, licenses, LimitsService, UsageService, /account/license
│       └── billing/              # console CRUD + evaluateStatus() stub
```
