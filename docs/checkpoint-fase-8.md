# Checkpoint — Fase 8 (FINAL) + fechamento das 8 fases — 03/07/2026

## Status geral
**As 8 fases da V1 estão implementadas** (código completo). Fases 0–4 verificadas em sandbox em sessões anteriores; **Fases 5–8 revisadas estaticamente** (seams de integração conferidos via file tools), mas **sem o gate `tsc`/`vite`/`prisma generate` executado** — o mount do workspace↔sandbox não serviu conteúdo de arquivos nesta sessão. O gate roda no servidor via `scripts/install.sh` (1ª instalação) ou `scripts/upgrade.sh`.

## Fase 8 entregue
- **`scripts/`**: `install.sh`, `uninstall.sh`, `upgrade.sh` (13 fases, log por fase), `backup-full.sh`, `restore-full.sh`, `restore-backup.sh`, `ecosystem.config.js`, README. Modelo Aquapark, Debian root sem sudo, build só no servidor.
- **Schema `system_*`**: `SystemUpgrade`, `SystemRestore` (infra global).
- **Módulo `system/`** (`@PlatformAdminOnly() /console/system/*`): versão+tags, upgrade com log ao vivo, lock órfão, backups (gerar/listar/baixar/subir/excluir/restaurar) com guard anti path-traversal e 1-por-vez, auditado. `@fastify/multipart` adicionado.
- **Dashboards** (`dashboards/`): `/console/dashboards/overview` + `/dashboards/summary` (só agregações — diretriz 34).
- **Console**: `pages/Atualizacao.jsx` (2 abas) + `pages/DashboardConsolidado.jsx` + rotas/nav.

## Runbook de primeiro deploy (servidor Debian, root)
1. `git clone` do repositório em `/opt/iastudio` (ou o caminho do `install.sh`).
2. `bash scripts/install.sh` — instala tudo, cria `iastudio_db` + extensão pgvector, gera `.env`, roda `prisma db push` (aplica TODO o schema das 8 fases de uma vez), builda api+admin+console, seed com verificação, sobe PM2 + Nginx.
3. **É aqui que o gate estático acontece**: se `tsc`/`vite build` acusar erro pontual (tipo/campo Prisma) nas Fases 5–8, corrigir no código e re-buildar. Os erros esperados, se houver, são localizados (o grosso da lógica e todos os seams cross-module foram revisados).
4. Configurar `.env`: `GOOGLE_CLIENT_ID/SECRET/OAUTH_REDIRECT` (Gmail), chaves dos LLMs entram como Connections AI pelo painel.
5. Trocar as senhas de seed (`admin@iastudio.local`/`admin123` no Console; `admin@demo.local`/`demo123` no painel).

## Pendências para o Robson
1. **Rodar o gate no servidor** (item 3 acima) e reportar/corrigir erros pontuais.
2. **Versão do primeiro release definida pelo Robson: `v0.9.0`** (RC antes do 1.0 — passa pela 1ª rodada de correções no servidor). O CHANGELOG já traz `## v0.9.0 - 2026-07-03`.
3. Taggear com os comandos PowerShell entregues pelo Claude (identidade `Robson <robson.marques.jr@gmail.com>`), depois do build do servidor validar.

## Verificação estática (recap Fases 5–8)
Todos os imports cross-module resolvem a exports reais; models Prisma novos (ai_*, isp_*, resource_*, developer_*, system_*) com tenant/índices; módulos registrados em `app.module.ts`; ACL nova nos catálogos; fronts importam componentes existentes. Residual não verificável sem compilar: erros de tipo internos e nomes de campo Prisma nas queries novas — a corrigir no 1º build do servidor.
