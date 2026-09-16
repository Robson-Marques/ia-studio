#!/usr/bin/env bash
# Gate S4 estático — valida o contrato de recursos por instância sem tocar no host.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
FAILURES=0
fail() { printf 'FALHA: %s\n' "$*" >&2; FAILURES=1; }
require_file() { [ -f "$1" ] || fail "arquivo obrigatório ausente: $1"; }

for file in scripts/lib/instance.sh scripts/install-dedicated.sh scripts/provision-dedicated-schema.sh scripts/uninstall-dedicated.sh scripts/ecosystem.config.js; do
  require_file "$file"
done

for script in scripts/install-dedicated.sh scripts/provision-dedicated-schema.sh scripts/upgrade.sh scripts/backup-full.sh scripts/restore-full.sh scripts/restore-backup.sh scripts/uninstall-dedicated.sh; do
  rg -Fq 'acquire_instance_lock' "$script" || fail "$script não usa lock da instância."
done
rg -Fq 'pg_advisory_xact_lock' scripts/provision-dedicated-schema.sh \
  || fail 'provisionamento do schema não possui advisory lock transacional.'
rg -Fq -- '--from-empty' scripts/provision-dedicated-schema.sh \
  || fail 'schema inicial não é gerado a partir de banco vazio.'
if rg -n -- '--accept-data-loss|prisma db push' scripts/install-dedicated.sh scripts/provision-dedicated-schema.sh; then
  fail 'instalação dedicada não pode aplicar db push destrutivo.'
fi
if rg -n '/opt/iastudio\b|iastudio_db\b|iastudio-api\b|iastudio-worker\b|platform-console|/console/' \
  scripts/install-dedicated.sh scripts/provision-dedicated-schema.sh scripts/uninstall-dedicated.sh scripts/backup-full.sh scripts/restore-full.sh scripts/restore-backup.sh scripts/upgrade.sh; then
  fail 'script operacional conserva recurso global ou Console SaaS.'
fi

derive() {
  local id="$1"
  # shellcheck disable=SC1091
  . "$ROOT/scripts/lib/instance.sh"
  set_instance "$id"
  printf '%s|%s|%s|%s|%s|%s\n' "$IASTUDIO_APP_DIR" "$IASTUDIO_DB_NAME" "$IASTUDIO_PM2_API" "$IASTUDIO_PM2_WORKER" "$IASTUDIO_REDIS_PREFIX" "$IASTUDIO_NGINX_SITE"
}
a="$(derive isp-a)"
b="$(derive loja-b)"
[ "$a" != "$b" ] || fail 'ids distintos resolveram os mesmos recursos.'
case "$a" in *'isp-a'* ) ;; *) fail 'recursos de isp-a não preservam o identificador.' ;; esac
case "$b" in *'loja-b'* ) ;; *) fail 'recursos de loja-b não preservam o identificador.' ;; esac

if [ "$FAILURES" -ne 0 ]; then
  exit 1
fi
printf '%s\n' 'S4 isolamento: aprovado estaticamente — recursos e locks são derivados por instância; validação em host com duas instâncias ainda é obrigatória.'
