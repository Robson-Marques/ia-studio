#!/usr/bin/env bash
# Contrato operacional de uma aplicação dedicada derivada do IA Studio.
# A base é clonada para o repositório da vertente do cliente; cada instalação
# desse produto ocupa recursos próprios no host, sem assumir uma coleção de
# cópias idênticas do mesmo checkout.
set -euo pipefail

APPLICATION_ROOT_BASE="${IASTUDIO_APPLICATION_ROOT_BASE:-/opt}"
APPLICATION_CONFIG_BASE="${IASTUDIO_APPLICATION_CONFIG_BASE:-/etc/iastudio/apps}"
APPLICATION_DATA_BASE="${IASTUDIO_APPLICATION_DATA_BASE:-/var/lib/iastudio/apps}"
APPLICATION_BACKUP_BASE="${IASTUDIO_APPLICATION_BACKUP_BASE:-/var/backups/iastudio/apps}"

fail_instance() { echo "ERRO: $*" >&2; exit 2; }

# psql/pg_dump/pg_restore não entendem parâmetros específicos do Prisma na URL
# (ex.: `?schema=public`). A aplicação/Prisma consome DATABASE_URL COM o
# parâmetro; as ferramentas libpq recebem a MESMA URL SEM a query string do ORM.
# Fonte única desta normalização: todo script operacional que fala com o
# PostgreSQL usa `db_url_for_psql` em vez de passar $DATABASE_URL cru — evita o
# erro `invalid URI query parameter: "schema"` e o patch manual recorrente.
db_url_for_psql() {
  local url="${1:-${DATABASE_URL:-}}"
  [ -n "$url" ] || fail_instance 'DATABASE_URL ausente para operação PostgreSQL.'
  printf '%s' "${url%%\?*}"
}

validate_app_id() {
  local value="$1"
  [[ "$value" =~ ^[a-z][a-z0-9-]{2,31}$ ]] || fail_instance 'app-id deve ter 3–32 caracteres: minúsculas, números e hífen; começa por letra.'
  [[ "$value" != 'shared' && "$value" != 'default' && "$value" != 'production' ]] || fail_instance 'app-id reservado.'
}

set_application() {
  IASTUDIO_APP_ID="$1"
  validate_app_id "$IASTUDIO_APP_ID"
  export IASTUDIO_APP_ID
  IASTUDIO_APP_KEY="${IASTUDIO_APP_ID//-/_}"
  export IASTUDIO_APP_KEY
  IASTUDIO_APP_DIR="$APPLICATION_ROOT_BASE/$IASTUDIO_APP_ID"
  IASTUDIO_CONFIG_FILE="$APPLICATION_CONFIG_BASE/$IASTUDIO_APP_ID.env"
  IASTUDIO_DATA_DIR="$APPLICATION_DATA_BASE/$IASTUDIO_APP_ID"
  IASTUDIO_BACKUP_DIR="$APPLICATION_BACKUP_BASE/$IASTUDIO_APP_ID"
  IASTUDIO_STORAGE_DIR="$IASTUDIO_DATA_DIR/storage"
  IASTUDIO_SCRIPTS_DIR="$IASTUDIO_APP_DIR/scripts"
  export IASTUDIO_APP_DIR IASTUDIO_CONFIG_FILE IASTUDIO_DATA_DIR IASTUDIO_BACKUP_DIR IASTUDIO_STORAGE_DIR IASTUDIO_SCRIPTS_DIR
  IASTUDIO_DB_NAME="iastudio_${IASTUDIO_APP_KEY}"
  IASTUDIO_DB_USER="iastudio_${IASTUDIO_APP_KEY}"
  IASTUDIO_PM2_API="iastudio-${IASTUDIO_APP_ID}-api"
  IASTUDIO_PM2_WORKER="iastudio-${IASTUDIO_APP_ID}-worker"
  IASTUDIO_REDIS_PREFIX="iastudio:${IASTUDIO_APP_ID}"
  IASTUDIO_NGINX_SITE="iastudio-${IASTUDIO_APP_ID}"
  export IASTUDIO_DB_NAME IASTUDIO_DB_USER IASTUDIO_PM2_API IASTUDIO_PM2_WORKER IASTUDIO_REDIS_PREFIX IASTUDIO_NGINX_SITE
}

load_application_config() {
  [ -f "$IASTUDIO_CONFIG_FILE" ] || fail_instance "configuração da aplicação não encontrada: $IASTUDIO_CONFIG_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$IASTUDIO_CONFIG_FILE"
  set +a
  [ "${IASTUDIO_APP_ID:-}" = "$1" ] || fail_instance 'configuração pertence a outra aplicação.'
}

assert_owned_path() {
  local candidate="$1" root="$2"
  case "$candidate" in "$root"|"$root"/*) ;; *) fail_instance "caminho fora da aplicação: $candidate" ;; esac
}

application_usage() {
  cat <<'EOF'
Uso: --app-id <produto-slug>. O identificador da aplicação é obrigatório e
nunca é inferido de host, banco, diretório ou variável global.
EOF
}

acquire_application_lock() {
  [ "${IASTUDIO_APPLICATION_LOCK_HELD:-}" = "$IASTUDIO_APP_ID" ] && return 0
  command -v flock >/dev/null || fail_instance 'flock é obrigatório para serializar a operação da aplicação.'
  mkdir -p /var/lock
  # O id já foi validado por set_application; o lock nunca é compartilhado
  # entre aplicações e impede install/upgrade/restore concorrentes da mesma.
  exec 9>"/var/lock/iastudio-${IASTUDIO_APP_ID}.lock"
  flock -n 9 || fail_instance "já existe uma operação em andamento para a aplicação $IASTUDIO_APP_ID."
  export IASTUDIO_APPLICATION_LOCK_HELD="$IASTUDIO_APP_ID"
}
