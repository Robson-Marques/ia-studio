# Módulo `system/` — Atualização, Backup e Restauração (Fase 8)

Infra **global da instância** (sem tenant). Todas as rotas são exclusivas do
Console (`@PlatformAdminOnly()` + `@Controller('console/system')`). Os serviços
disparam os scripts de `scripts/` via `child_process.spawn` (detached); o log ao
vivo é gravado direto na row do banco pelo próprio script (upgrade) ou pelo
callback do spawn (backup).

## Endpoints

| Método | Rota | O que faz |
|---|---|---|
| GET | `/console/system/version` | Versão atual (tag do HEAD ou `## vX.Y.Z` do CHANGELOG) + tags disponíveis > atual. Cache 5min. |
| POST | `/console/system/upgrade` | `{version}` → cria row `system_upgrades` RUNNING + spawn `upgrade.sh <tag> <id>`. **202**. |
| GET | `/console/system/upgrade/current` | Status + `log_lines` ao vivo (polling 2s). Marca `orphaned` se RUNNING > 10min. |
| GET | `/console/system/upgrade/history` | Últimas 20 atualizações. |
| POST | `/console/system/upgrade/release-lock` | Lock órfão (>10min) → marca FAILED sem reverter nada. |
| GET | `/console/system/backups` | Lista pacotes (`.tar.gz`/`.sql`/`.sql.gz`) com tamanho e data. |
| GET | `/console/system/backups/current` | Operação de backup/restore em andamento (se houver). |
| POST | `/console/system/backups` | Gera backup completo (spawn `backup-full.sh`, row `system_restores` kind=BACKUP). **202**. |
| GET | `/console/system/backups/:file/download` | Stream do arquivo (Content-Disposition attachment). Guard anti path-traversal. |
| POST | `/console/system/backups/upload` | Upload multipart (`@fastify/multipart`). Nome validado (path-traversal). **201**. |
| DELETE | `/console/system/backups/:file` | Exclui um pacote. Guard anti path-traversal. |
| POST | `/console/system/restore` | `{file}` → restaura backup completo via `restore-full.sh` (systemd-run). **202**. |

## Decisões

- **Lock de 1 operação por vez.** Upgrade: row `system_upgrades` com `status=RUNNING`
  (`findRunningUpgrade`). Backup/Restore: row `system_restores` RUNNING
  (`findRunningRestore`). Um novo pedido enquanto há RUNNING → **409**.
- **Lock órfão.** Se um upgrade fica RUNNING > 10min (`ORPHAN_MS`), o
  `current` retorna `orphaned=true` e o Console mostra o banner "Liberar lock".
  `release-lock` marca **FAILED** sem tocar no processo nem reverter dados.
- **Leitura da versão.** `git describe --tags --exact-match` (se o HEAD aponta
  numa tag `vX.Y.Z`), com fallback para o primeiro `## vX.Y.Z` do `CHANGELOG.md`.
  Tags disponíveis = `git tag v*` filtradas > atual, ordenadas desc.
- **Guard anti path-traversal.** `resolveBackupPath` (em `system.paths.ts`) só
  aceita `[A-Za-z0-9._-]+`, resolve dentro de `IASTUDIO_BACKUP_DIR` e confere
  que o caminho final não escapa da pasta (defesa em profundidade). Também
  valida a extensão `vX.Y.Z` da tag no DTO (o valor vira argumento do script).
- **Restore fora da árvore do PM2.** `restore-full.sh` faz `pm2 delete` — se
  rodasse como filho do PM2 o treekill abortaria o próprio restore. Por isso o
  `BackupService` o dispara via **`systemd-run`** (unidade transiente).
- **Multipart.** `@fastify/multipart` (adicionado ao `package.json`) é registrado
  no `main.ts`. Se ausente, o boot só loga aviso e o endpoint de upload responde
  400 — o resto do módulo funciona normalmente.
- **Auditoria.** `system.upgrade.start`/`release-lock`, `system.backup.create`/
  `upload`/`delete`, `system.restore.start` — via `AuditLogService.record()`.

## Envs

`IASTUDIO_SCRIPTS_DIR` (default `/opt/iastudio/scripts`), `IASTUDIO_BACKUP_DIR`
(default `/opt/iastudio-backups`), `IASTUDIO_APP_DIR` (default `/opt/iastudio`).
