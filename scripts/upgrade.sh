#!/bin/bash
# ============================================================
# IA Studio - upgrade.sh v1.0
# Aplica um upgrade de versao (git tag) com backup automatico, build e restart.
# Roda como ROOT no servidor (repo em /opt/iastudio).
#
# Disparado pelo painel de Atualizacao do Console (spawn detached), que ja criou
# a row em system_upgrades (status=RUNNING) e chama com args POSICIONAIS:
#     bash scripts/upgrade.sh <tag> <upgrade_id>
# (tambem aceita --to / --upgrade-id / --repo-path para uso manual)
#
# Cada fase grava UMA linha em system_upgrades.log_lines (String[]) via psql
# array_append — o front faz polling a cada 2s. Falha em qualquer fase:
# status=FAILED + error_step + exit 1. Backup ANTES de qualquer mudanca.
# ============================================================

set -euo pipefail
[ "$(id -u)" -ne 0 ] && echo "ERRO: execute como root" && exit 1

# ---------- AUTO-CÓPIA (roda de /tmp, nao de dentro do repo) ----------
# O `git checkout <tag>` mais abaixo REESCREVE este proprio arquivo, e o bash le
# o script em pedacos conforme executa — trocar o arquivo no meio da execucao
# pode fazer o bash continuar num offset que agora aponta pra outro conteudo.
# Copiando pra /tmp e reexecutando de la, o arquivo em execucao nao e mais o que
# o git substitui. Idempotente via UPGRADE_SELF_COPIED.
if [ "${UPGRADE_SELF_COPIED:-}" != "1" ]; then
  _self_copy="/tmp/iastudio-upgrade-$$.sh"
  cp -- "$0" "$_self_copy"
  export UPGRADE_SELF_COPIED=1
  exec bash "$_self_copy" "$@"
fi

# ---------- ARGS (posicionais OU flags) ----------
TO_VERSION=""; UPGRADE_ID=""; REPO_PATH="/opt/iastudio"; DO_RESTART=1
POS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --to)          TO_VERSION="$2"; shift 2 ;;
    --upgrade-id)  UPGRADE_ID="$2"; shift 2 ;;
    --repo-path)   REPO_PATH="$2"; shift 2 ;;
    --no-restart)  DO_RESTART=0; shift ;;
    *)             POS+=("$1"); shift ;;
  esac
done
[ -z "${TO_VERSION}" ] && [ "${#POS[@]}" -ge 1 ] && TO_VERSION="${POS[0]}"
[ -z "${UPGRADE_ID}" ] && [ "${#POS[@]}" -ge 2 ] && UPGRADE_ID="${POS[1]}"

[ -z "$TO_VERSION" ]  && echo "ERRO: versao (tag) obrigatoria" && exit 1
[ -z "$UPGRADE_ID" ]  && echo "ERRO: upgrade-id obrigatorio" && exit 1
[ ! -d "$REPO_PATH" ] && echo "ERRO: repo nao encontrado: $REPO_PATH" && exit 1

API_DIR="$REPO_PATH/platform-api"
ADMIN_DIR="$REPO_PATH/platform-admin"
CONSOLE_DIR="$REPO_PATH/platform-console"
BACKUP_DIR="${IASTUDIO_BACKUP_DIR:-/opt/iastudio-backups}"
ENV_FILE="$API_DIR/.env"
CRED_FILE="/root/.iastudio-credentials"
mkdir -p "$BACKUP_DIR"

[ ! -f "$ENV_FILE" ] && echo "ERRO: .env nao encontrado em $ENV_FILE" && exit 1
DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//;s/^'\''//;s/'\''$//')
[ -z "$DATABASE_URL" ] && echo "ERRO: DATABASE_URL ausente em $ENV_FILE" && exit 1

# Exporta o .env inteiro para o ambiente do bash — assim NODE_AUTH_TOKEN (usado
# pelo .npmrc do platform-admin para autenticar em GitHub Packages @studio-ux-ds/*)
# e quaisquer outras vars secretas ficam visiveis para os `npm install`/`prisma`/
# builds das fases seguintes, sem depender de env passada pelo PM2 nem do .bashrc
# do root (que nao e carregado em spawn detached). Fonte unica de segredos = .env.
# `set -a` marca toda variavel atribuida a partir daqui como export automatico.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# Modo/dominios pra rebuildar os fronts com a mesma URL da API/base do install.
MODE="single"; DOMAIN=""; DOMAIN_API=""
# shellcheck disable=SC1090
[ -f "$CRED_FILE" ] && source "$CRED_FILE" 2>/dev/null || true

# pm2 spawn herda NODE_ENV=production -> npm pula devDependencies (tsc/vite
# quebram). Forcamos development pro build ter @types/* e as ferramentas.
unset NPM_CONFIG_PRODUCTION
export NODE_ENV=development

# ---------- LOG EM system_upgrades.log_lines (String[]) ----------
sql_escape() { printf '%s' "$1" | sed "s/'/''/g"; }
log_db() {
  local step="$1"; local msg="$2"; local line ts
  ts=$(date -u +%H:%M:%S)
  line=$(sql_escape "[$ts][$step] $msg")
  echo "[$step] $msg"
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL || true
UPDATE system_upgrades
SET log_lines = array_append(COALESCE(log_lines, ARRAY[]::text[]), '$line')
WHERE id = '$UPGRADE_ID';
SQL
}
# Volta o repo para a versao de origem quando a falha aconteceu DEPOIS do
# checkout. Sem isto, o `GET /system/version` (que le a tag do deploy) passava a
# responder a versao NOVA enquanto o `dist` servido continuava o da ANTIGA — e o
# painel, vendo "atual = versao nova", mostrava "Nenhuma versao disponivel" e
# nao deixava reaplicar. Obrigava a publicar uma tag nova so pra reexecutar o
# mesmo codigo (aconteceu em v0.9.94 e v0.9.95). E o pior: e a forma classica do
# "release fantasma" — versao nova anunciada com codigo antigo rodando.
CHECKED_OUT=0
revert_checkout() {
  [ "$CHECKED_OUT" = "1" ] || return 0
  [ -n "${FROM_VERSION:-}" ] && [ "$FROM_VERSION" != "unknown" ] || {
    log_db "ROLLBACK" "AVISO: nao foi possivel identificar a versao de origem — repo segue em $TO_VERSION"
    return 0
  }
  log_db "ROLLBACK" "voltando o repo para $FROM_VERSION (o build falhou; o dist em uso e o de $FROM_VERSION)"
  if (cd "$REPO_PATH" && git checkout -- . 2>/dev/null; git checkout "$FROM_VERSION" 2>/tmp/iastudio_git_revert.err); then
    log_db "ROLLBACK" "repo de volta em $FROM_VERSION — a versao segue disponivel para reaplicar no painel"
  else
    log_db "ROLLBACK" "AVISO: falhou ao voltar para $FROM_VERSION: $(head -c 300 /tmp/iastudio_git_revert.err)"
  fi
}

mark_failed() {
  local step="$1"; local msg="$2"
  log_db "$step" "ERRO: $msg"
  # Desfaz o checkout ANTES de marcar FAILED: assim, quando o front recarregar,
  # a versao lida ja e a antiga e o painel volta a oferecer o upgrade.
  revert_checkout
  local s; s=$(sql_escape "$step")
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL || true
UPDATE system_upgrades
SET status='FAILED', finished_at=now(), error_step='$s'
WHERE id = '$UPGRADE_ID';
SQL
  echo "UPGRADE ABORTADO no passo $step: $msg" >&2
  exit 1
}
trap 'mark_failed "UNEXPECTED" "Erro inesperado na linha $LINENO"' ERR

# ---------- 1) PREFLIGHT ----------
log_db "PREFLIGHT" "Validando upgrade-id e ambiente"
STATUS_NOW=$(psql "$DATABASE_URL" -X -tA -c "SELECT status FROM system_upgrades WHERE id = '$UPGRADE_ID'" 2>/dev/null || echo "")
[ -z "$STATUS_NOW" ]           && mark_failed "PREFLIGHT" "upgrade-id $UPGRADE_ID nao existe"
[ "$STATUS_NOW" != "RUNNING" ] && mark_failed "PREFLIGHT" "upgrade-id nao esta RUNNING (atual=$STATUS_NOW)"
FROM_VERSION=$(cd "$REPO_PATH" && git describe --tags --abbrev=0 2>/dev/null || echo "unknown")
log_db "PREFLIGHT" "from=$FROM_VERSION to=$TO_VERSION repo=$REPO_PATH"

# ---------- 2) BACKUP ----------
TS=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/iastudio_db_${FROM_VERSION}-to-${TO_VERSION}_${TS}.sql.gz"
log_db "BACKUP" "pg_dump -> $(basename "$BACKUP_FILE")"
if ! pg_dump "$DATABASE_URL" 2>/tmp/iastudio_pgdump.err | gzip > "$BACKUP_FILE"; then
  mark_failed "BACKUP" "pg_dump falhou: $(head -c 400 /tmp/iastudio_pgdump.err)"
fi
log_db "BACKUP" "backup concluido ($(du -h "$BACKUP_FILE" | cut -f1))"

# ---------- 3) GIT_FETCH ----------
log_db "GIT_FETCH" "git fetch --tags origin"
cd "$REPO_PATH"
git fetch --tags origin 2>/tmp/iastudio_git.err || mark_failed "GIT_FETCH" "git fetch falhou: $(head -c 400 /tmp/iastudio_git.err)"
git rev-parse --verify "$TO_VERSION" >/dev/null 2>&1 || mark_failed "GIT_FETCH" "tag $TO_VERSION nao existe no repo"

# ---------- 4) GIT_CHECKOUT ----------
# Descarta mudancas em arquivos VERSIONADOS (package-lock reescrito no build).
# .env / ecosystem.config.js / dist NAO sao versionados -> preservados.
git checkout -- . 2>/dev/null || true
log_db "GIT_CHECKOUT" "git checkout $TO_VERSION"
git checkout "$TO_VERSION" 2>/tmp/iastudio_git.err || mark_failed "GIT_CHECKOUT" "git checkout falhou: $(head -c 400 /tmp/iastudio_git.err)"
# A partir daqui uma falha precisa voltar o repo (ver revert_checkout).
CHECKED_OUT=1

# ---------- 5) API_INSTALL ----------
log_db "API_INSTALL" "npm install (platform-api)"
cd "$API_DIR"
npm install --no-audit --no-fund 2>/tmp/iastudio_npm.err >/dev/null || mark_failed "API_INSTALL" "npm install falhou: $(tail -c 600 /tmp/iastudio_npm.err)"

# ---------- 6) PRISMA_PUSH ----------
log_db "PRISMA_PUSH" "prisma db push + generate"
npx prisma db push --accept-data-loss 2>/tmp/iastudio_prisma.err >/dev/null || mark_failed "PRISMA_PUSH" "db push falhou: $(tail -c 600 /tmp/iastudio_prisma.err)"
npx prisma generate 2>>/tmp/iastudio_prisma.err >/dev/null || mark_failed "PRISMA_PUSH" "prisma generate falhou: $(tail -c 600 /tmp/iastudio_prisma.err)"

# ---------- 7) API_BUILD ----------
log_db "API_BUILD" "nest build"
npm run build 2>/tmp/iastudio_build.err >/dev/null || mark_failed "API_BUILD" "nest build falhou: $(tail -c 800 /tmp/iastudio_build.err)"

# Helper de build de front (usa MODE/dominios do .iastudio-credentials).
build_front() {
  local dir="$1"; local api_url="$2"; local base="$3"; local step="$4"
  [ ! -f "$dir/package.json" ] && { log_db "$step" "front ausente ($dir) — pulado"; return 0; }
  cd "$dir"
  npm install --no-audit --no-fund 2>/tmp/iastudio_npm.err >/dev/null || mark_failed "$step" "npm install falhou: $(tail -c 600 /tmp/iastudio_npm.err)"
  VITE_API_URL="$api_url" npm run build -- --base="$base" 2>/tmp/iastudio_build.err >/dev/null || mark_failed "$step" "vite build falhou: $(tail -c 800 /tmp/iastudio_build.err)"
}

# URLs iguais as do install (single = relativo; multi = dominio da API).
if [ "$MODE" = "single" ]; then
  ADMIN_API="/api/v1"; ADMIN_BASE="/"
  CONSOLE_API="/api/v1"; CONSOLE_BASE="/console/"
else
  ADMIN_API="https://${DOMAIN_API}/api/v1"; ADMIN_BASE="/"
  CONSOLE_API="https://${DOMAIN_API}/api/v1"; CONSOLE_BASE="/"
fi

# ---------- 8-9) ADMIN ----------
log_db "ADMIN_BUILD" "npm install + vite build (platform-admin)"
build_front "$ADMIN_DIR" "$ADMIN_API" "$ADMIN_BASE" "ADMIN_BUILD"
log_db "ADMIN_BUILD" "painel do cliente publicado"

# ---------- 10) CONSOLE ----------
log_db "CONSOLE_BUILD" "npm install + vite build (platform-console)"
build_front "$CONSOLE_DIR" "$CONSOLE_API" "$CONSOLE_BASE" "CONSOLE_BUILD"
log_db "CONSOLE_BUILD" "console publicado"

# ---------- 11) ROTATE_BACKUPS (mantem 7) ----------
log_db "ROTATE_BACKUPS" "mantendo os 7 backups mais recentes"
ls -1t "$BACKUP_DIR"/iastudio_db_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
log_db "ROTATE_BACKUPS" "rotacao concluida"

# ---------- 12) MARK_SUCCESS (antes do restart) ----------
log_db "DONE" "Upgrade aplicado ($FROM_VERSION -> $TO_VERSION)"
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >/dev/null <<SQL
UPDATE system_upgrades SET status='SUCCESS', finished_at=now() WHERE id = '$UPGRADE_ID';
SQL
trap - ERR

# ---------- 13) RESTART ----------
# WORKER PRIMEIRO, API POR ULTIMO — e cada um em seu proprio comando. O worker
# roda o assistente/crons e registra as tools em memoria: se ele nao reiniciar,
# codigo/tool novos NUNCA entram (bug real: o worker ficou 19h sem reiniciar
# enquanto o api reiniciava a cada deploy, e a tool nova do diagnostico dava
# "sem handler"). O restart do API e o momento de risco pro proprio upgrade.sh
# (mesmo detached) — por isso ele fica por ULTIMO, quando o worker ja pegou o
# codigo novo. Um comando combinado deixava o worker de fora num restart parcial.
if [ "$DO_RESTART" -eq 1 ]; then
  echo "[RESTART] pm2 restart iastudio-worker"
  pm2 restart iastudio-worker --update-env 2>/dev/null \
    || pm2 start "$API_DIR/ecosystem.config.js" --only iastudio-worker 2>/dev/null \
    || echo "AVISO: restart do iastudio-worker retornou nao-zero (verifique pm2 list)"
  echo "[RESTART] pm2 restart iastudio-api"
  pm2 restart iastudio-api --update-env 2>/dev/null \
    || pm2 start "$API_DIR/ecosystem.config.js" --only iastudio-api 2>/dev/null \
    || echo "AVISO: restart do iastudio-api retornou nao-zero (verifique pm2 list)"
else
  echo "[RESTART] pulado (--no-restart)"
fi

echo ""
echo "=============================================="
echo " UPGRADE $FROM_VERSION -> $TO_VERSION CONCLUIDO"
echo " backup: $BACKUP_FILE"
echo "=============================================="
exit 0
