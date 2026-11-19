#!/usr/bin/env bash
# Gate estático: o removedor do SaaS antigo não pode atingir serviços do host.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
SCRIPT='scripts/uninstall-legacy-saas.sh'
failures=0
fail() { printf 'FALHA: %s\n' "$*" >&2; failures=1; }

[ -f "$SCRIPT" ] || fail 'removedor legado ausente.'
rg -Fq -- '--dry-run' "$SCRIPT" || fail 'removedor legado não oferece prévia.'
rg -Fq -- '--confirm LEGACY-IASTUDIO' "$SCRIPT" || fail 'removedor legado não exige confirmação literal.'
rg -Fq 'iastudio-backups' "$SCRIPT" || fail 'backup legado não está no escopo explícito.'
rg -Fq 'DROP DATABASE IF EXISTS iastudio_db' "$SCRIPT" || fail 'banco legado não está no escopo explícito.'
rg -Fq 'foreign_databases' "$SCRIPT" || fail 'não há proteção contra bancos adicionais da role legada.'
if rg -n 'apt-get|autoremove|pm2 kill|systemctl (stop|disable)|redis-cli.*(flush|FLUSH)|rm -rf /etc|rm -rf /var|rm -rf /root' "$SCRIPT"; then
  fail 'removedor legado contém operação global proibida.'
fi

[ "$failures" -eq 0 ] || exit 1
printf '%s\n' 'Removedor SaaS legado: aprovado estaticamente — apenas recursos explícitos do IA Studio são elegíveis.'
