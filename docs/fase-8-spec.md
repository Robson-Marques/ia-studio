# Fase 8 — FINAL: Instalação, Atualização, Backup, Dashboards (spec de execução)

> Consolida `docs/deploy-e-versionamento.md` (spec completa) em plano de execução. Modelo Aquapark. Produção: Debian root (sem sudo), `/opt/iastudio`, PM2 `iastudio-api` (+ `iastudio-worker`), Postgres 15+pgvector, Redis, Nginx. Máquina do Robson não tem Node — build só no servidor via painel. Data: 03/07/2026. Convenções iguais às fases 1–7.

## 1. Scripts (`scripts/` na raiz do monorepo) — bash, `set -euo pipefail`
- **`install.sh`**: instala Node 20 LTS, PM2, PostgreSQL 15 + **pgvector** (`CREATE EXTENSION IF NOT EXISTS vector;` no `iastudio_db`), Redis, Nginx; cria banco `iastudio_db`; gera `.env` (JWT_SECRET, ENCRYPTION_KEY, DATABASE_URL, REDIS_URL, GOOGLE_* placeholders); `npx prisma db push`; build api (`npm ci && npm run build`) + admin + console; **seed pela MESMA DATABASE_URL da app com verificação final** (aborta se 0 usuários — lição v1.9.9); PM2 start `iastudio-api` (+ `iastudio-worker` com WORKER_INLINE=off); Nginx reverse proxy (admin + console + /api).
- **`uninstall.sh`**: PURGE total (PM2, código, Postgres, Redis, Node, Nginx) com confirmação.
- **`upgrade.sh`**: 13 fases com log por fase gravado em `system_upgrades.log_lines` (append via um pequeno client psql/node): PREFLIGHT → BACKUP (pg_dump.gz) → GIT_FETCH → GIT_CHECKOUT (tag recebida por arg) → API_INSTALL → PRISMA_PUSH → API_BUILD → ADMIN_INSTALL → ADMIN_BUILD → CONSOLE_BUILD → ROTATE_BACKUPS (mantém 7) → MARK_SUCCESS → RESTART (pm2 reload). Falha = produção fica na versão anterior (não faz rollback destrutivo). Spawn detached; marca a row `system_upgrades` (RUNNING→SUCCESS/FAILED, error_step).
- **`backup-full.sh` / `restore-full.sh`**: pacote de migração (`db.sql` + arquivos de storage + `manifest.json` com segredos do `.env`: ENCRYPTION_KEY, JWT_SECRET...). Restore via **systemd-run** (não como filho do PM2 — evita treekill), `trap EXIT` garante restart, `pm2 delete + start ecosystem` pra reler env. **`restore-backup.sh`**: restaura só o dump do banco (stop PM2 → restore → start).
- **`ecosystem.config.js`** (PM2): apps `iastudio-api` e `iastudio-worker` (fork), cwd `/opt/iastudio/platform-api`, env de produção.
Scripts são idempotentes onde possível, comentados em pt-BR, e não pedem build local.

## 2. Schema (models finais)
- `SystemUpgrade` (`system_upgrades`): id, from_version?, to_version, status (RUNNING|SUCCESS|FAILED), log_lines String[] @default([]), error_step?, started_by?, started_at, finished_at?, created_at. Índice por created_at.
- `SystemRestore` (`system_restores`): id, kind (BACKUP|RESTORE), status (RUNNING|SUCCESS|FAILED), file_name?, log_lines String[], error?, started_by?, started_at, finished_at?, created_at.
- Namespace `system_*` (já permitido no CLAUDE.md). Sem tenant (é infra global da instância).

## 3. Backend — módulo `src/modules/system/` (platform-admin only)
Controllers `@PlatformAdminOnly() @Controller('console/system')` (mesmo padrão de `console/organizations`). Perms: reutilizar o mecanismo do Console; adicionar constantes `system.upgrade`, `system.backup`, `system.restore` no catálogo de permissões do Console (ver como `console.*` é definido — seguir o MESMO lugar/mecanismo; se o Console usa is_platform_admin bypass + catálogo próprio, adicionar lá).
- **Atualização:** `GET /console/system/version` (versão atual do CHANGELOG/git + tags disponíveis > atual, cache 5min), `POST /console/system/upgrade` (body {version}; cria row `system_upgrades` RUNNING; **spawn detached** de `scripts/upgrade.sh <tag>`; retorna 202), `GET /console/system/upgrade/current` (polling 2s: status + log_lines ao vivo), lock órfão (banner após 10min → `POST .../release-lock` marca FAILED sem reverter). Notificação in-app pós-upgrade + checagem semanal (cron).
- **Backup:** `GET /console/system/backups` (listar), `POST /console/system/backups` (gerar — spawn backup-full.sh, row system_restores kind=BACKUP), `GET /console/system/backups/:file/download` (stream; guard anti path-traversal no nome), `POST /console/system/backups/upload` (multipart), `DELETE /console/system/backups/:file`, `POST /console/system/restore` (spawn restore-full.sh via systemd-run; row kind=RESTORE). 1 operação por vez (lock). Perms super-only `system.backup`/`system.restore`.
- Serviços chamam os scripts via `child_process.spawn` (detached, stdio pra arquivo/append no log_lines). Guardas: só 1 upgrade/restore por vez; validar nome de arquivo (sem `..`/`/`). Auditar (`@Auditable`) upgrade/restore/backup.

## 4. Frontend — Console (`platform-console`)
- `services/system.js` (padrão do console: `api` + `extractErrorMessage`/`normalizeList`).
- `pages/Atualizacao.jsx` com 2 abas (`Tabs`):
  - **Atualização:** cards "Versão atual" / "Disponível" / "Backups retidos"; lista de tags > atual; botão "Atualizar" (perm `system.upgrade`) → ConfirmDialog destrutivo → POST upgrade → **polling 2s com log ao vivo** (viewer de linhas) → toast + reload na transição RUNNING→SUCCESS; banner de lock órfão (>10min) com "Liberar lock".
  - **Backup e Restauração:** gerar/listar/baixar (stream)/subir (multipart)/excluir/restaurar — **5 patrasques** (ConfirmDialog + disclaimer + tooltip + loading + permission gate `system.backup`/`system.restore`). 1 operação por vez.
- Rota `/atualizacao` (`PermissionRoute perm="system.upgrade"` ou `system.read` conforme catálogo) em `App.jsx`; nav no `Sidebar.jsx` do console (ícone `RefreshCw`/`DatabaseBackup`).

## 5. Dashboards consolidados
- Backend: módulo/endpoints de agregação read-only (diretriz 34 — Analytics lê agregações, não logs crus). `GET /console/dashboards/overview` (global: nº orgs, execuções, custos IA, tokens, mensagens WhatsApp, emails, filas/health) e, no painel do cliente, `GET /automation|ai .../summary` já existentes reaproveitados numa tela Dashboard consolidada. Escopo pragmático: números agregados dos contadores já existentes (UsageRecord, execuções, ai_cost_records, notifications), health das conexões, tamanho das filas (se broker Redis disponível; senão “n/d”).
- Frontend: enriquecer o `Dashboard.jsx` do platform-admin (cards + mini-tabelas) e/ou uma tela no Console. Sem libs de chart novas além das já permitidas (recharts no admin, se já usado; senão StatCards + tabelas).

## 6. Release (entregar ao Robson)
- Entrada `## vX.Y.Z - 2026-07-03` no `CHANGELOG.md` (a tela de Atualização lê dele) — **confirmar o número com o Robson antes de taggear** (nunca reusar tag).
- Comandos PowerShell (identidade `Robson <robson.marques.jr@gmail.com>`):
```powershell
git add -A
git commit -m "vX.Y.Z - resumo"
git push origin main
git tag -a vX.Y.Z -m "resumo"
git push origin vX.Y.Z
```
- Avisar: `db push` das Fases 5-8 é destrutivo; pgvector obrigatório; envs GOOGLE_* para email.

## 7. Fechamento
README de `scripts/` e do módulo `system/`; CHANGELOG (bloco Fase 8); `docs/checkpoint-fase-8.md`; atualizar estado (todas as fases ✅). Gate estático roda no servidor via install/upgrade (mount bloqueia no sandbox). **NÃO taggear nem executar release — só entregar os comandos e pedir o número da versão ao Robson.**
