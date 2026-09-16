#!/usr/bin/env bash
# Gate S2 — impede que contratos e serviços executáveis reintroduzam escopo SaaS.
# Referências à organização de origem só são permitidas no exportador histórico,
# que é read-only e nunca é carregado pela aplicação da instância dedicada.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

FAILURES=0
fail() { printf 'FALHA: %s\n' "$*" >&2; FAILURES=1; }

ACTIVE_PATTERN='organization_id|workspace_id|environment_id|organizationId|workspaceId|environmentId|tenant_id|tenantId|is_platform_admin|PLATFORM_ADMIN|PlatformAdminGuard|ActorType|InstallationAdminOnly|LimitsService|UsageService|BillingService|LicensingService'
if rg -n -i "$ACTIVE_PATTERN" platform-api/src platform-admin/src -g '!**/*.md'; then
  fail 'contrato ou serviço ativo ainda carrega escopo SaaS.'
fi

# O exportador lê a base SaaS histórica por organização apenas para gerar NDJSON
# auditável. Ele não é uma superfície da aplicação, não recebe DATABASE_URL da
# instância e não pode importar ou restaurar SQL.
EXPORTER='scripts/migration/export-isp-operational-data.sh'
[ -f "$EXPORTER" ] || fail 'exportador seletivo histórico ausente.'
rg -Fq 'SOURCE_DATABASE_URL' "$EXPORTER" \
  || fail 'exportador não exige conexão explícita da fonte histórica.'
rg -Fq 'mapped-import-into-clean-dedicated-schema' "$EXPORTER" \
  || fail 'manifesto do exportador não registra a política de destino limpo.'
if rg -n -i 'INSERT INTO|UPDATE |DELETE FROM|DROP |CREATE ' "$EXPORTER"; then
  fail 'exportador histórico não pode alterar schema ou dados.'
fi

if [ "$FAILURES" -ne 0 ]; then
  exit 1
fi

printf '%s\n' 'S2 operacional: aprovado — runtime local sem escopo SaaS; exportação histórica permanece read-only e auditável.'
