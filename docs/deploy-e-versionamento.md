# Deploy, Versionamento, Atualização e Backup — runbook

> Runbook vivo do deploy do IA Studio (implementado e em produção). Modelo idêntico ao consagrado no Aquapark: produção em `/opt/iastudio`, PM2, release por tag `vX.Y.Z` aplicada pelo painel Configurações > Atualização.

## Premissas (iguais ao Aquapark)

- Servidor Debian 13, executando como **root** (sem `sudo` em nenhum script).
- Caminho fixo de produção: `/opt/iastudio`. Processo PM2: `iastudio-api` (modo `fork`).
- A máquina Windows do Robson **não tem Node** — build só acontece no servidor, via painel de Atualização. Nunca pedir build local.
- Banco: PostgreSQL 15+, banco único `iastudio_db`, extensão **pgvector**. Redis local para BullMQ.
- Prisma: `db push --accept-data-loss` (sem migrations), schema é a fonte única da verdade.

## Scripts (`scripts/`)

| Script | Responsabilidade |
|---|---|
| `install.sh` | Instala Node 20 LTS, PM2, PostgreSQL 15 + pgvector, Redis, Nginx; cria `iastudio_db`; gera `.env` (JWT_SECRET, ENCRYPTION_KEY, DATABASE_URL, REDIS_URL); `prisma db push`; build api + admin; seed do admin DEV **pela mesma DATABASE_URL da app, com verificação final** (aborta se 0 usuários — lição v1.9.9 do Aquapark); PM2 start + nginx reverse proxy |
| `uninstall.sh` | PURGE total: PM2, código, PostgreSQL, Redis, Node, Nginx |
| `upgrade.sh` | 13 fases com log por fase em `system_upgrades.log_lines`: PREFLIGHT → BACKUP (pg_dump.gz) → GIT_FETCH → GIT_CHECKOUT → API_INSTALL → PRISMA_PUSH → API_BUILD → ADMIN_INSTALL → ADMIN_BUILD → ROTATE_BACKUPS (mantém 7) → MARK_SUCCESS → RESTART pm2. `set -euo pipefail` (falha = produção fica na versão anterior). Spawn detached |
| `restore-backup.sh` | Restaura dump do banco (para PM2 → restore → start) |
| `backup-full.sh` / `restore-full.sh` | Pacote completo de migração: `db.sql` + arquivos + `manifest.json` com segredos do `.env` (ENCRYPTION_KEY, JWT_SECRET...). Restore roda via **systemd-run** (não como filho do PM2 — evita treekill), `trap EXIT` garante restart, `pm2 delete + start ecosystem` para reler env |

## Versionamento git (fluxo padrão de release)

1. Entrada `## vX.Y.Z - AAAA-MM-DD` no `CHANGELOG.md` (raiz) ANTES do commit (a tela de Atualização lê dele).
2. Commit + push `main`; tag **anotada e imutável** `vX.Y.Z` + push da tag. Corrigiu? Número NOVO — nunca reusar tag.
3. **Sempre confirmar o número da versão com o Robson antes de taggear.**
4. Identidade git: `Robson <robson.marques.jr@gmail.com>`.
5. Comandos entregues em PowerShell no diretório do repo (padrão Aquapark):

```powershell
git add -A
git commit -m "vX.Y.Z - resumo"
git push origin main
git tag -a vX.Y.Z -m "resumo"
git push origin vX.Y.Z
```

## Painel de Atualização e Backup (Configurações > Atualização)

Aba **Atualização**:
- Cards "Versão atual" / "Disponível" / "Backups retidos"; lista de tags > atual (cache 5min).
- Botão "Atualizar" (perm `system.upgrade`) → ConfirmDialog destrutivo → POST `/system/upgrade` (202, row `system_upgrades` RUNNING) → spawn `upgrade.sh` → polling 2s com log ao vivo → toast + reload na transição RUNNING→SUCCESS.
- Notificação in-app pós-upgrade e checagem semanal de versão nova (cron).
- Lock órfão: banner após 10min com "Liberar lock" (marca FAILED, não reverte nada).

Aba **Backup e Restauração**:
- Gerar backup completo, listar, baixar (stream), subir (multipart), excluir, restaurar — com os 5 patrasques (ConfirmDialog, disclaimer, tooltip, loading, permission gate).
- Perms super-only: `system.backup`, `system.restore`. Guard anti path-traversal no nome do arquivo. 1 operação por vez (lock).

## Models Prisma

`SystemUpgrade` (`system_upgrades`: from/to_version, status RUNNING|SUCCESS|FAILED, log_lines, error_step) e `SystemRestore` (`system_restores`: kind BACKUP|RESTORE, status, log_lines, file_name).

## Regra permanente (desde já)

Ao concluir qualquer mudança de código em produção futura, entregar ao Robson os comandos de release (PowerShell acima) e o aviso de `db push` destrutivo quando o schema mudar. Feature flags: valor de produção mora no **default do código**; env só para override. Toggles de usuário moram no **banco** (`system_settings`), configuráveis pela UI, e viajam no backup.

## Segredos e credenciais de build — fonte única no `.env`

**Todo segredo consumido durante o `upgrade.sh` (npm install, prisma, builds) mora em `${API_DIR}/.env` — nunca no `.bashrc` do root, nem no `ecosystem.config.js` do PM2.** A partir da v0.9.81 o `upgrade.sh` faz `set -a; source "$ENV_FILE"; set +a` antes das fases de build, então qualquer var no `.env` fica visível para os processos filhos sem depender de herança do PM2.

Exemplos:
- **`GITLAB_PACKAGE_TOKEN`** — credencial somente de leitura do GitLab da Nivoo, usada pelo `.npmrc` do `platform-admin` para autenticar em `@studio-ux-ds/*`. O `install.sh` aceita `--gitlab-package-token=...` em modo headless. Adicionar em servidor existente: `echo "GITLAB_PACKAGE_TOKEN=..." >> /opt/iastudio/platform-api/.env`.
- `DATABASE_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET` — mesmo padrão. Já estão no `.env` gerado pelo `install.sh`.

**Armadilha comum:** um arquivo antes criado manualmente no servidor (como `platform-admin/.npmrc`) que depois passa a ser **versionado** por um commit — o `git checkout <tag_nova>` recusa com `error: The following untracked working tree files would be overwritten by checkout`. Antes de aplicar a tag que introduz o versionamento, apagar/mover o arquivo untracked do servidor:

```bash
mv /opt/iastudio/platform-admin/.npmrc /opt/iastudio/platform-admin/.npmrc.pre-tag
```

Depois de aplicar, comparar (`diff`) e apagar o backup se idênticos.
