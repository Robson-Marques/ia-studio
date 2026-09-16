#!/usr/bin/env bash
# Gate S3 — confirma que o antigo Console SaaS não voltou como rota, build,
# vhost ou superfície de painel. Não substitui os testes de execução no host.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FAILURES=0
cd "$ROOT"

fail() { printf 'FALHA: %s\n' "$*" >&2; FAILURES=1; }
require_file() { [ -f "$ROOT/$1" ] || fail "arquivo obrigatório ausente: $1"; }

# A pasta pode persistir vazia no checkout, mas não pode conter aplicação.
if [ -d "$ROOT/platform-console" ] && find "$ROOT/platform-console" -type f -print -quit | grep -q .; then
  fail 'platform-console ainda contém arquivos.'
fi

# Código em execução não pode conservar a superfície antiga. Documentos de
# recuperação/RFC/matriz ficam fora deste gate por registrarem a decisão.
if rg -n -i 'platform-console|/console/' platform-api/src platform-admin/src scripts \
  -g '!scripts/migration/verify-*.sh'; then
  fail 'referência ativa ao Console ou ao vhost /console/ encontrada.'
fi

if rg -n 'CONSOLE_BUILD|CONSOLE_DIR|dist-root|domains-sync' scripts \
  -g '!scripts/migration/verify-*.sh'; then
  fail 'resíduo de build/publicação/vhost do Console encontrado nos scripts.'
fi

require_file 'platform-admin/src/pages/AdministracaoInstalacao.jsx'
require_file 'platform-admin/src/services/system.js'
require_file 'platform-api/src/modules/system/system.controller.ts'

grep -Fq 'path="/administracao/instalacao"' "$ROOT/platform-admin/src/App.jsx" \
  || fail 'rota local de Administração da instalação ausente.'
rg -Fq "@Controller('system')" "$ROOT/platform-api/src/modules/system/system.controller.ts" \
  || fail 'controller local /system ausente.'
rg -q 'SYSTEM_MAINTAIN' "$ROOT/platform-api/src/modules/system/system.controller.ts" \
  || fail 'autorização system.maintain ausente da manutenção local.'

if [ "$FAILURES" -ne 0 ]; then
  exit 1
fi

printf '%s\n' 'S3 Console retirement: aprovado — manutenção local preservada e Console SaaS ausente.'
