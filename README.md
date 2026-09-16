# IA Studio

Estrutura-base para aplicações dedicadas de automação, integrações, IA e
comunicação. Cada cliente recebe uma instância independente: aplicação, banco,
Redis, processos, armazenamento, backups e domínio próprios. Não há Console
SaaS, tenants, organizações, workspaces, planos ou licenciamento comercial no
produto executado.

## Estrutura

| Pasta | Responsabilidade |
|---|---|
| `platform-api/` | API NestJS/Fastify, Prisma/PostgreSQL e workers. |
| `platform-admin/` | Painel local da instância (React/Vite/Studio UX). |
| `scripts/` | Instalação e manutenção por identificador de instância. |
| `docs/` | Baseline, RFC, Capability Contract e operação. |

## Administração da instalação

O administrador local encontra atualização, backup e restauração em
**Configurações → Administração da instalação**. A interface usa as rotas
`/api/v1/system/*`, exige a permissão `system.maintain` e atua exclusivamente na
instância autenticada.

## Desenvolvimento

```bash
# API (porta 3000)
cd platform-api && npm install && npx prisma db push && npm run start:dev

# Painel local (porta 5173, proxy /api → 3000)
cd platform-admin && npm install && npm run dev
```

Requisitos: Node 20 LTS, PostgreSQL 15+ e Redis. Em produção, use a instalação
dedicada com ID explícito; nunca aponte scripts de schema, restore ou upgrade à
base SaaS histórica. Swagger: `http://localhost:3000/api/docs`.

## Fontes de verdade

1. `docs/architecture-baseline.md` — fronteiras e maturidade recuperadas.
2. `docs/rfcs/RFC-001-conversao-saas-instalacao-dedicada.md` — decisão de arquitetura.
3. `docs/capabilities/saas-to-dedicated-installation.md` — contrato e Acceptance.
4. `docs/capabilities/saas-to-dedicated-s3-console-matrix.md` — aposentadoria do Console.
