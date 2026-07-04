# scripts/ — Instalação, Atualização e Backup (Fase 8)

Scripts de operação de produção do IA Studio. Modelo consagrado no Aquapark.

**Ambiente-alvo:** Debian 13, executando como **root** (nenhum script usa `sudo`
para si — apenas `sudo -u postgres` para falar com o Postgres). Caminho fixo de
produção: `/opt/iastudio`. Processos PM2: `iastudio-api` + `iastudio-worker`.

> A máquina do Robson **não tem Node** — o build acontece **somente no servidor**
> (via `install.sh` ou pelo painel de Atualização do Console, que chama
> `upgrade.sh`). Nunca peça build local.

## Scripts

| Script | O que faz |
|---|---|
| `install.sh` | **Wizard interativo** (`bash scripts/install.sh` sem args) OU headless. Pergunta: modo `single` (painel + Console no mesmo domínio, Console em `/console/`) ou `multi` (painel/Console/API em domínios separados — recomendado), domínios, SSL Let's Encrypt (e-mail), **nome/e-mail/senha do admin** da plataforma, criar org Demo (s/N), opções avançadas (keep-deps/keep-db). Instala Node 20, PM2, PostgreSQL + **pgvector** (`CREATE EXTENSION vector`), Redis, Nginx, Certbot; cria `iastudio_db`; gera `.env` (segredos aleatórios + `PLATFORM_ADMIN_EMAIL/PASSWORD` + `SEED_DEMO` + `GOOGLE_*`); `prisma db push`; build api + admin + console; sobe PM2 `iastudio-api` + `iastudio-worker`; **verifica o seed** (aguarda a API subir e aborta se o admin não existir em `core_users`); Nginx + SSL. Flags headless: `--mode= --domain[-admin/-console/-api]= --email= --admin-email= --admin-password= [--no-demo --keep-deps --keep-db --no-ssl]`. |
| `uninstall.sh` | **Wizard interativo** com menu: PURGE TOTAL, keep-deps, keep-db, keep-all. PURGE exige digitar `REMOVER`. Headless: `--purge` (default) / `--keep-deps` / `--keep-db` / `--keep-all` / `--yes`. Remove PM2 (`iastudio-api`+`iastudio-worker`), `/opt/iastudio`, banco/Redis/Nginx/Node conforme o modo. Backups em `/opt/iastudio-backups` são preservados. |
| `upgrade.sh <tag> <upgrade_id>` | Atualiza para uma tag git em **13 fases**, gravando uma linha por fase em `system_upgrades.log_lines` (String[], via `array_append`; o Console faz polling 2s). Args **posicionais** (como o `SystemService` chama) ou flags `--to/--upgrade-id/--repo-path`. `set -euo pipefail`: falha aborta e marca a row `FAILED` + `error_step` **sem rollback destrutivo** (backup é a 2ª fase). Rebuilda api + admin + console (lê modo/domínios de `/root/.iastudio-credentials`) e faz `pm2 restart iastudio-api iastudio-worker`. |
| `backup-full.sh [nome]` | Pacote completo de migração `.tar.gz`: `db.sql` + `storage/` + `manifest.json` com segredos do `.env` (ENCRYPTION_KEY, JWT_SECRET…). Imprime o caminho do arquivo. |
| `restore-full.sh <arquivo.tar.gz> [restore_id]` | Restauração completa (banco + storage + segredos). Roda via **`systemd-run`** (fora da árvore do PM2, evita treekill); `trap EXIT` garante o restart com `pm2 delete + start` para reler o `.env`. |
| `restore-backup.sh <dump.sql[.gz]>` | Restaura **só o banco** (stop PM2 → restore → start). |
| `ecosystem.config.js` | Definição PM2 dos apps `iastudio-api` e `iastudio-worker` (fork, cwd `/opt/iastudio/platform-api`, env de produção com `WORKER_INLINE=off`). |

## Fases do `upgrade.sh`

`PREFLIGHT → BACKUP → GIT_FETCH → GIT_CHECKOUT → API_INSTALL → PRISMA_PUSH →
API_BUILD → ADMIN_BUILD → CONSOLE_BUILD → ROTATE_BACKUPS (mantém 7) →
DONE/MARK_SUCCESS → RESTART (pm2 restart iastudio-api iastudio-worker)`.
Cada `*_BUILD` faz `npm install` + `vite build`/`nest build` na mesma fase.

O log ao vivo é gravado com `psql … array_append(log_lines, …)` na row de
`system_upgrades` criada pelo backend antes do spawn.

## Como o backend chama os scripts

`SystemService` (`platform-api/src/modules/system/`) dispara os scripts com
`child_process.spawn` **detached** e `stdio: 'ignore'` (o log fica na row do
banco, escrito pelo próprio script). O caminho da pasta `scripts/` vem da env
`IASTUDIO_SCRIPTS_DIR` (default `/opt/iastudio/scripts`). Backups ficam em
`IASTUDIO_BACKUP_DIR` (default `/opt/iastudio-backups`).

## Variáveis de ambiente relevantes

| Env | Default | Uso |
|---|---|---|
| `IASTUDIO_SCRIPTS_DIR` | `/opt/iastudio/scripts` | onde o backend acha os scripts |
| `IASTUDIO_BACKUP_DIR` | `/opt/iastudio-backups` | pasta de backups/dumps |
| `IASTUDIO_STORAGE_DIR` | `platform-api/storage` | arquivos do Storage Manager |
| `SERVER_NAME` | `_` | `server_name` do Nginx no install |
| `DB_PASS` | aleatório | senha do role `iastudio` (só no install) |
