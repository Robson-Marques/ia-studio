#!/usr/bin/env bash
# Remove exclusivamente uma aplicação dedicada. Nunca remove dependências
# compartilhadas do host (PostgreSQL, Redis, Nginx, Node, PM2 ou certificados).
set -euo pipefail
umask 077
[ "$(id -u)" -eq 0 ] || { echo 'ERRO: execute como root.' >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib/instance.sh"

APP_ID=''
CONFIRM=''
KEEP_DATA=0
usage() {
  cat <<'EOF'
Uso:
  bash scripts/uninstall-dedicated.sh --app-id <produto> --confirm <produto> [--keep-data]

Remove somente os processos, vhost e diretório da aplicação. Sem --keep-data,
remove também apenas o banco/role, Redis DB, storage, backups e configuração da
aplicação indicada. PostgreSQL, Redis, Nginx, Node, PM2 e outras aplicações são
sempre preservados.
EOF
}
while (($#)); do
  case "$1" in
    --app-id) APP_ID="${2:?valor ausente}"; shift 2 ;;
    --confirm) CONFIRM="${2:?valor ausente}"; shift 2 ;;
    --keep-data) KEEP_DATA=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail_instance "argumento desconhecido: $1" ;;
  esac
done
[ -n "$APP_ID" ] || { usage >&2; exit 2; }
set_application "$APP_ID"
[ "$CONFIRM" = "$IASTUDIO_APP_ID" ] || fail_instance 'confirmação deve ser exatamente o app-id.'
load_application_config "$IASTUDIO_APP_ID"
acquire_application_lock

assert_owned_path "$IASTUDIO_APP_DIR" "$APPLICATION_ROOT_BASE"
assert_owned_path "$IASTUDIO_DATA_DIR" "$APPLICATION_DATA_BASE"
assert_owned_path "$IASTUDIO_BACKUP_DIR" "$APPLICATION_BACKUP_BASE"
assert_owned_path "$IASTUDIO_CONFIG_FILE" "$APPLICATION_CONFIG_BASE"

pm2 delete "$IASTUDIO_PM2_API" "$IASTUDIO_PM2_WORKER" >/dev/null 2>&1 || true
pm2 save --force >/dev/null 2>&1 || true

# O runtime WAHA é exclusivo desta aplicação. O container nunca sobrevive à
# remoção do app; o volume de sessões segue a mesma política de --keep-data.
if command -v docker >/dev/null 2>&1; then
  docker rm -f "${IASTUDIO_APP_ID}-waha" >/dev/null 2>&1 || true
  if [ "$KEEP_DATA" != 1 ]; then
    docker volume rm "${IASTUDIO_APP_ID}-waha-sessions" >/dev/null 2>&1 || true
  fi
fi

rm -f "/etc/nginx/sites-enabled/$IASTUDIO_NGINX_SITE" "/etc/nginx/sites-available/$IASTUDIO_NGINX_SITE"
nginx -t && systemctl reload nginx

rm -rf -- "$IASTUDIO_APP_DIR"
rm -rf -- "/var/log/iastudio/$IASTUDIO_APP_ID"

if [ "$KEEP_DATA" = 1 ]; then
  echo "Aplicação $IASTUDIO_APP_ID removida; dados, backup e configuração foram preservados."
  exit 0
fi

redis-cli -n "${REDIS_DB:?REDIS_DB ausente na configuração da aplicação}" FLUSHDB >/dev/null
su -s /bin/sh postgres -c "psql -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS $IASTUDIO_DB_NAME;'"
su -s /bin/sh postgres -c "psql -v ON_ERROR_STOP=1 -c 'DROP ROLE IF EXISTS $IASTUDIO_DB_USER;'"
rm -rf -- "$IASTUDIO_DATA_DIR" "$IASTUDIO_BACKUP_DIR"
rm -f -- "$IASTUDIO_CONFIG_FILE"

echo "Aplicação $IASTUDIO_APP_ID removida sem afetar recursos compartilhados ou outras aplicações."
