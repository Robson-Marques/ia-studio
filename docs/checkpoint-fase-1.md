# Checkpoint — Fase 0 + Fase 1 (02/07/2026)

## Entregue
- **Fase 0:** monorepo (platform-api, platform-admin, platform-console), CLAUDE.md, README, CHANGELOG v0.1.0, ARCHITECTURE_LOCK.md, docs normativos (58 diretrizes, plano, deploy).
- **platform-api** (108 arquivos): schema Prisma com 18 models (core_/licensing_/billing_/system_), auth JWT 2 atores (scrypt, cache, revogação), Organizations→Workspaces→Environments com provisionamento transacional, usuários (soft-delete) + convites, perfis + catálogo de permissões, feature flags com overrides e precedência, auditoria com diff/IP/UA + security logs, Licensing (3 planos seed, chave, trial, LimitsService + UsageService), Billing isolado (nada o importa), seed idempotente (platform admin + org Demo), Swagger em /api/docs.
- **platform-admin** (painel do cliente, 42 arquivos): login, shell com seletor de workspace/ambiente + dark/light, Usuários e Convites, aceite público de convite, Perfis com editor por grupo, Workspaces/Ambientes, Auditoria, Minha Conta (plano/consumo/recursos).
- **platform-console** (40 arquivos): app isolado (UI kit próprio, token separado, gate is_platform_admin), Clientes/tenants com detalhe (licença: trocar plano/status/gerar chave), Planos (9 limites + 11 features), Flags globais + overrides, Consumo, Auditoria global.

## Verificação executada (sandbox Linux, Node 22)
- `npx prisma generate` ✅ · `tsc --noEmit` **0 erros** ✅ · `nest build` ✅
- Boot real da API: todos os módulos/rotas inicializam; único erro = banco inexistente no sandbox (esperado) ✅
- `vite build` dos dois painéis ✅
- Correções aplicadas pós-verificação: chaves de permissão do front alinhadas ao catálogo (`core.*`); `@fastify/static` adicionado ao package.json.

## Não testado ainda (pendências para o primeiro run real)
- Fluxo ponta-a-ponta com PostgreSQL (db push + seed + login + CRUDs) — exige banco.
- Contratos exatos entre front e API em endpoints secundários (o front trata formatos defensivamente; validar: PATCH environments, overrides de flags, PATCH licenses, GET /console/organizations/:id, formato de /console/usage).
- Credenciais seed: platform admin `admin@iastudio.local` / `admin123` (Console); org demo `admin@demo.local` / `demo123` (Painel do Cliente). Trocar em produção.

## Próxima frente (após validação humana)
Fase 2 — Integration Manager: Marketplace, Provider Registry (IProvider), Secrets Manager, Connection Wizard, Storage Manager, estados de conexão.
