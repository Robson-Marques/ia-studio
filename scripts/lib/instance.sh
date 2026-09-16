#!/usr/bin/env bash
# Contrato operacional de uma instância dedicada IA Studio.
# Todo script de operação deve carregar este arquivo antes de compor caminhos,
# nomes de banco, processos PM2, Redis, backup ou vhost.
set -euo pipefail

INSTANCE_ROOT_BASE="${IASTUDIO_INSTANCE_ROOT_BASE:-/opt/iastudio/instances}"
INSTANCE_CONFIG_BASE="${IASTUDIO_INSTANCE_CONFIG_BASE:-/etc/iastudio/instances}"
INSTANCE_DATA_BASE="${IASTUDIO_INSTANCE_DATA_BASE:-/var/lib/iastudio/instances}"
INSTANCE_BACKUP_BASE="${IASTUDIO_INSTANCE_BACKUP_BASE:-/var/backups/iastudio}"

fail_instance() { echo "ERRO: $*" >&2; exit 2; }

validate_instance_id() {
  local value="$1"
  [[ "$value" =~ ^[a-z][a-z0-9-]{2,31}$ ]] || fail_instance 'instance-id deve ter 3–32 caracteres: minúsculas, números e hífen; começa por letra.'
  [[ "$value" != 'shared' && "$value" != 'default' && "$value" != 'production' ]] || fail_instance 'instance-id reservado.'
}

set_instance() {
  IASTUDIO_INSTANCE_ID="$1"
  validate_instance_id "$IASTUDIO_INSTANCE_ID"
  export IASTUDIO_INSTANCE_ID
  IASTUDIO_INSTANCE_KEY="${IASTUDIO_INSTANCE_ID//-/_}"
  export IASTUDIO_INSTANCE_KEY
  IASTUDIO_APP_DIR="$INSTANCE_ROOT_BASE/$IASTUDIO_INSTANCE_ID"
  IASTUDIO_CONFIG_FILE="$INSTANCE_CONFIG_BASE/$IASTUDIO_INSTANCE_ID.env"
  IASTUDIO_DATA_DIR="$INSTANCE_DATA_BASE/$IASTUDIO_INSTANCE_ID"
  IASTUDIO_BACKUP_DIR="$INSTANCE_BACKUP_BASE/$IASTUDIO_INSTANCE_ID"
  IASTUDIO_STORAGE_DIR="$IASTUDIO_DATA_DIR/storage"
  IASTUDIO_SCRIPTS_DIR="$IASTUDIO_APP_DIR/scripts"
  export IASTUDIO_APP_DIR IASTUDIO_CONFIG_FILE IASTUDIO_DATA_DIR IASTUDIO_BACKUP_DIR IASTUDIO_STORAGE_DIR IASTUDIO_SCRIPTS_DIR
  IASTUDIO_DB_NAME="iastudio_${IASTUDIO_INSTANCE_KEY}"
  IASTUDIO_DB_USER="iastudio_${IASTUDIO_INSTANCE_KEY}"
  IASTUDIO_PM2_API="iastudio-${IASTUDIO_INSTANCE_ID}-api"
  IASTUDIO_PM2_WORKER="iastudio-${IASTUDIO_INSTANCE_ID}-worker"
  IASTUDIO_REDIS_PREFIX="iastudio:${IASTUDIO_INSTANCE_ID}"
  IASTUDIO_NGINX_SITE="iastudio-${IASTUDIO_INSTANCE_ID}"
  export IASTUDIO_DB_NAME IASTUDIO_DB_USER IASTUDIO_PM2_API IASTUDIO_PM2_WORKER IASTUDIO_REDIS_PREFIX IASTUDIO_NGINX_SITE
}

load_instance_config() {
  [ -f "$IASTUDIO_CONFIG_FILE" ] || fail_instance "configuração da instância não encontrada: $IASTUDIO_CONFIG_FILE"
  set -a
  # shellcheck disable=SC1090
  . "$IASTUDIO_CONFIG_FILE"
  set +a
  [ "${IASTUDIO_INSTANCE_ID:-}" = "$1" ] || fail_instance 'configuração pertence a outra instância.'
}

assert_owned_path() {
  local candidate="$1" root="$2"
  case "$candidate" in "$root"|"$root"/*) ;; *) fail_instance "caminho fora da instância: $candidate" ;; esac
}

instance_usage() {
  cat <<'EOF'
Uso: --instance-id <cliente-slug>. O identificador é obrigatório e nunca é
inferido de host, banco, diretório ou variável global.
EOF
}

acquire_instance_lock() {
  [ "${IASTUDIO_INSTANCE_LOCK_HELD:-}" = "$IASTUDIO_INSTANCE_ID" ] && return 0
  command -v flock >/dev/null || fail_instance 'flock é obrigatório para serializar a operação da instância.'
  mkdir -p /var/lock
  # O id já foi validado por set_instance; o lock nunca é compartilhado entre
  # clientes e impede dois install/upgrade/restore concorrentes da mesma base.
  exec 9>"/var/lock/iastudio-${IASTUDIO_INSTANCE_ID}.lock"
  flock -n 9 || fail_instance "já existe uma operação em andamento para a instância $IASTUDIO_INSTANCE_ID."
  export IASTUDIO_INSTANCE_LOCK_HELD="$IASTUDIO_INSTANCE_ID"
}
