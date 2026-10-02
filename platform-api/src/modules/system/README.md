# Módulo `system/` — Atualização, Backup e Restauração (Fase 8)

Infra **local da aplicação** (sem tenant). Todas as rotas são exclusivas da
administração local (`system.maintain` + `@Controller('system')`). Os serviços
disparam os scripts de `scripts/` via unidade transiente do `systemd`; o próprio
script grava log e estado terminal na row local, sem depender de callback em
memória do processo API.

## Endpoints

| Método | Rota | O que faz |
|---|---|---|
| GET | `/system/version` | Versão atual (tag do HEAD ou `## vX.Y.Z` do CHANGELOG) + tags disponíveis > atual. Cache 5min. |
| POST | `/system/upgrade` | `{version}` → cria row `system_upgrades` RUNNING + spawn `upgrade.sh <tag> <id>`. **202**. |
| GET | `/system/upgrade/current` | Status + `log_lines` ao vivo (polling 2s). Marca `orphaned` se RUNNING > 10min. |
| GET | `/system/upgrade/history` | Últimas 20 atualizações. |
| POST | `/system/upgrade/release-lock` | Lock órfão (>10min) → marca FAILED sem reverter nada. |
| GET | `/system/backups` | Lista pacotes (`.tar.gz`/`.sql`/`.sql.gz`) com tamanho e data. |
| GET | `/system/backups/current` | Operação em andamento; use `?id=<operationId>` para acompanhar o resultado terminal da operação iniciada. |
| POST | `/system/backups` | Gera backup completo (spawn `backup-full.sh`, row `system_restores` kind=BACKUP). **202**. |
| GET | `/system/backups/:file/download` | Stream do arquivo (Content-Disposition attachment). Guard anti path-traversal. |
| POST | `/system/backups/upload` | Upload multipart (`@fastify/multipart`). Nome validado (path-traversal). **201**. |
| DELETE | `/system/backups/:file` | Exclui um pacote. Guard anti path-traversal. |
| POST | `/system/restore` | `{file}` → restaura backup completo via `restore-full.sh` (systemd-run). **202**. |

## Decisões

- **Lock de 1 operação por vez.** Upgrade: row `system_upgrades` com `status=RUNNING`
  (`findRunningUpgrade`). Backup/Restore: row `system_restores` RUNNING
  (`findRunningRestore`). Um novo pedido enquanto há RUNNING → **409**.
- **Lock órfão.** Se um upgrade fica RUNNING > 10min (`ORPHAN_MS`), o
  `current` retorna `orphaned=true` e a administração local mostra o banner "Liberar lock".
  `release-lock` marca **FAILED** sem tocar no processo nem reverter dados.
- **Leitura da versão.** `git describe --tags --exact-match` (se o HEAD aponta
  numa tag `vX.Y.Z`), com fallback para o primeiro `## vX.Y.Z` do `CHANGELOG.md`.
  Tags disponíveis = `git tag v*` filtradas > atual, ordenadas desc.
- **Guard anti path-traversal.** `resolveBackupPath` (em `system.paths.ts`) só
  aceita `[A-Za-z0-9._-]+`, resolve dentro de `IASTUDIO_BACKUP_DIR` e confere
  que o caminho final não escapa da pasta (defesa em profundidade). Também
  valida a extensão `vX.Y.Z` da tag no DTO (o valor vira argumento do script).
- **Operações fora da árvore do PM2.** Backup e restore usam **`systemd-run`**.
  O backup também se auto-reporta no banco: restart da API não pode deixá-lo
  preso em `RUNNING`. Operação órfã por mais de 30 minutos é marcada `FAILED`
  com erro explícito e libera o lock local.
- **Multipart.** `@fastify/multipart` (adicionado ao `package.json`) é registrado
  no `main.ts`. Se ausente, o boot só loga aviso e o endpoint de upload responde
  400 — o resto do módulo funciona normalmente.
- **Auditoria.** `system.upgrade.start`/`release-lock`, `system.backup.create`/
  `upload`/`delete`, `system.restore.start` — via `AuditLogService.record()`.

## Envs

`IASTUDIO_APP_ID`, `IASTUDIO_SCRIPTS_DIR`, `IASTUDIO_BACKUP_DIR`,
`IASTUDIO_APP_DIR`, `IASTUDIO_PM2_API` e `IASTUDIO_PM2_WORKER` são definidos
pela instalação. Não há caminho, processo ou backup global de fallback.
