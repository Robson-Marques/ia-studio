# IA Studio

Plataforma SaaS multi-tenant de **Automação Empresarial, Integrações, IA e Comunicação**. Totalmente genérica e orientada a integrações — a primeira solução oficial é para provedores (ISP), com o Altarede como primeiro Provider ERP.

## Estrutura

| Pasta | O que é |
|---|---|
| `platform-api/` | Backend NestJS 10 + Fastify + Prisma/PostgreSQL (monolito modular + workers BullMQ) |
| `platform-admin/` | Painel do Cliente (React 18 + Vite + Tailwind) |
| `platform-console/` | Console administrativo do SaaS (React 18 + Vite + Tailwind) |
| `docs/` | Diretrizes (58), plano de execução, deploy, specs por fase |
| `scripts/` | install/uninstall/upgrade/backup (fase final) |

## Documentos normativos

1. `CLAUDE.md` — regra máxima do projeto
2. `docs/plano-de-execucao.md` — fases e entregas
3. `docs/diretrizes-arquiteturais.md` — 58 diretrizes aprovadas
4. `docs/deploy-e-versionamento.md` — release por tag git + painel de Atualização/Backup
5. `RELATORIO-ANALISE-E-ARQUITETURA.md` — análise do Aquapark/Altarede e arquitetura

## Desenvolvimento

```bash
# API (porta 3000)
cd platform-api && npm install && npx prisma db push && npm run start:dev

# Painel do Cliente (porta 5173, proxy /api → 3000)
cd platform-admin && npm install && npm run dev

# Console (porta 5174, proxy /api → 3000)
cd platform-console && npm install && npm run dev
```

Requisitos: Node 20 LTS, PostgreSQL 15+ (banco `iastudio_db`), Redis (fases 4+).
Swagger: `http://localhost:3000/api/docs`.
