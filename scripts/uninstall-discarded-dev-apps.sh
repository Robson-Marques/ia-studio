#!/usr/bin/env bash
# Remove somente os dois ambientes descartáveis criados pelo contrato antigo
# de "instâncias irmãs". É um utilitário de migração único: não instala nem
# remove aplicações do modelo atual por app-id.
set -euo pipefail
umask 077

[ "$(id -u)" -eq 0 ] || { echo 'ERRO: execute como root.' >&2; exit 2; }

MODE='dry-run'
CONFIRM=''
usage() {
  cat <<'EOF'
Uso:
  bash scripts/uninstall-discarded-dev-apps.sh --dry-run
  bash scripts/uninstall-discarded-dev-apps.sh --remove --confirm RESET-IASTUDIO-DEV

Remove exclusivamente os ambientes de desenvolvimento descartáveis ia-dev e
ia-teste do modelo antigo. Os recursos compartilhados PostgreSQL, Redis, Nginx,
Node, PM2 e certificados são preservados; somente o banco/role, Redis DB,
processos, vhost, diretórios, logs, dados, backups e configurações daqueles
dois ambientes são elegíveis à remoção.
EOF
}

while (($#)); do
  case "$1" in
    --dry-run) MODE='dry-run'; shift ;;
    --remove) MODE='remove'; shift ;;
    --confirm) CONFIRM="${2:?valor ausente}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERRO: argumento desconhecido: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ "$MODE" = 'remove' ] && [ "$CONFIRM" != 'RESET-IASTUDIO-DEV' ]; then
  echo 'ERRO: para remover, use --confirm RESET-IASTUDIO-DEV.' >&2
  exit 2
fi

LEGACY_IDS=(ia-dev ia-teste)
declare -A REDIS_DBS=()

fail() { echo "ERRO: $*" >&2; exit 2; }

validate_legacy_environment() {
  local app_id="$1" app_key="${1//-/_}"
  local config_file="/etc/iastudio/instances/${app_id}.env"
  local expected_app_dir="/opt/iastudio/instances/${app_id}"
  local expected_data_dir="/var/lib/iastudio/instances/${app_id}"
  local expected_backup_dir="/var/backups/iastudio/${app_id}"

  if [ ! -f "$config_file" ]; then
    echo "AVISO: $app_id não possui configuração legada em $config_file; nada será removido para ele."
    return 0
  fi

  unset IASTUDIO_INSTANCE_ID IASTUDIO_APP_DIR IASTUDIO_DATA_DIR IASTUDIO_BACKUP_DIR REDIS_DB
  # O arquivo foi criado pelo instalador local antigo e precisa ser lido para
  # validar a propriedade antes de qualquer comando destrutivo.
  # shellcheck disable=SC1090
  . "$config_file"
  [ "${IASTUDIO_INSTANCE_ID:-}" = "$app_id" ] || fail "$config_file não pertence a $app_id."
  [ "${IASTUDIO_APP_DIR:-}" = "$expected_app_dir" ] || fail "$app_id possui diretório inesperado; remoção interrompida."
  [ "${IASTUDIO_DATA_DIR:-}" = "$expected_data_dir" ] || fail "$app_id possui diretório de dados inesperado; remoção interrompida."
  [ "${IASTUDIO_BACKUP_DIR:-}" = "$expected_backup_dir" ] || fail "$app_id possui diretório de backup inesperado; remoção interrompida."
  [[ "${REDIS_DB:-}" =~ ^([0-9]|1[0-5])$ ]] || fail "$app_id possui REDIS_DB inválido; remoção interrompida."
  [ "${REDIS_DBS[$REDIS_DB]:-}" != 'used' ] || fail "ia-dev e ia-teste usam o mesmo REDIS_DB=$REDIS_DB; remoção interrompida."
  REDIS_DBS[$REDIS_DB]='used'

  printf '%s\n' "Ambiente legado validado: $app_id"
  printf '%s\n' "  diretório: $expected_app_dir"
  printf '%s\n' "  dados: $expected_data_dir"
  printf '%s\n' "  backups: $expected_backup_dir"
  printf '%s\n' "  configuração: $config_file"
  printf '%s\n' "  PM2: iastudio-$app_id-api, iastudio-$app_id-worker"
  printf '%s\n' "  PostgreSQL: role/banco iastudio_$app_key"
  printf '%s\n' "  Redis DB: $REDIS_DB (somente esse DB será limpo)"
  printf '%s\n' "  vhost: /etc/nginx/sites-{available,enabled}/iastudio-$app_id"
}

for app_id in "${LEGACY_IDS[@]}"; do
  validate_legacy_environment "$app_id"
done

if [ "$MODE" = 'dry-run' ]; then
  echo 'Prévia concluída; nada foi alterado.'
  exit 0
fi

for app_id in "${LEGACY_IDS[@]}"; do
  config_file="/etc/iastudio/instances/${app_id}.env"
  [ -f "$config_file" ] || continue
  app_key="${app_id//-/_}"
  # shellcheck disable=SC1090
  . "$config_file"
  pm2 delete "iastudio-$app_id-api" "iastudio-$app_id-worker" >/dev/null 2>&1 || true
  rm -f "/etc/nginx/sites-enabled/iastudio-$app_id" "/etc/nginx/sites-available/iastudio-$app_id"
  redis-cli -n "$REDIS_DB" FLUSHDB >/dev/null
  su -s /bin/sh postgres -c "psql -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS iastudio_${app_key};'"
  su -s /bin/sh postgres -c "psql -v ON_ERROR_STOP=1 -c 'DROP ROLE IF EXISTS iastudio_${app_key};'"
  rm -rf -- "/opt/iastudio/instances/$app_id" "/var/lib/iastudio/instances/$app_id" "/var/backups/iastudio/$app_id" "/var/log/iastudio/$app_id"
  rm -f -- "$config_file"
  echo "Ambiente legado removido: $app_id"
done

pm2 save --force >/dev/null 2>&1 || true
nginx -t && systemctl reload nginx
rmdir /opt/iastudio/instances /opt/iastudio 2>/dev/null || true
rmdir /etc/iastudio/instances /etc/iastudio 2>/dev/null || true
echo 'Ambientes de desenvolvimento legados removidos; demais aplicações do host foram preservadas.'
