#!/usr/bin/env bash
# Gate transversal da Capability SaaS -> instalação dedicada.
# Não corrige arquivos: evidencia que schema, auth, ACL, API e eventos chegaram
# juntos ao estado sem tenant antes de S1 poder ser encerrado.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MODE="${1:---report}"

case "$MODE" in
  --report|--check) ;;
  *) echo 'Uso: verify-dedicated-cut.sh [--report|--check]' >&2; exit 2 ;;
esac

# Termos que pertencem ao contrato SaaS removido. "organization" por si só não
# entra aqui porque pode existir em texto histórico; o gate procura contratos de
# execução, persistência e roteamento.
PATTERN='organization_id|workspace_id|environment_id|resolveOrganizationId|validateWorkspaceScope|x-workspace-id|x-environment-id|is_platform_admin|PLATFORM_ADMIN|PlatformAdminGuard|ActorType'

# Linha de base aferida antes do primeiro corte S1. Temporárias continuam no
# denominador e no restante: uma camada só chega a 100% quando o gate a zera.
declare -A BASELINE=(
  [schema]=209
  [auth]=68
  [acl]=53
  [api]=1254
  [events]=735
)
declare -A REMAINING
declare -A TEMPORARY

progress_bar() {
  local percent="$1"
  local width=10
  local filled=$(( percent * width / 100 ))
  local empty=$(( width - filled ))
  printf '%*s' "$filled" '' | tr ' ' '#'
  printf '%*s' "$empty" '' | tr ' ' '-'
}

failures=0
for surface in schema auth acl api events; do
  case "$surface" in
    schema) targets=("$ROOT_DIR/platform-api/prisma/schema.prisma") ;;
    auth) targets=("$ROOT_DIR/platform-api/src/shared/auth" "$ROOT_DIR/platform-api/src/modules/core/auth") ;;
    acl) targets=("$ROOT_DIR/platform-api/src/shared/auth" "$ROOT_DIR/platform-api/src/shared/permissions.constants.ts") ;;
    api) targets=("$ROOT_DIR/platform-api/src/modules" "$ROOT_DIR/platform-api/src/shared/audit") ;;
    events) targets=("$ROOT_DIR/platform-api/src/shared/events" "$ROOT_DIR/platform-api/src/modules/automation" "$ROOT_DIR/platform-api/src/modules/comm" "$ROOT_DIR/platform-api/src/modules/ai") ;;
  esac
  matches=$(rg -n -i --glob '*.ts' --glob '*.prisma' "$PATTERN" "${targets[@]}" 2>/dev/null || true)
  active_matches=''
  transition_matches=''
  while IFS= read -r match; do
    [ -z "$match" ] && continue
    # Adaptadores de transicao sao permitidos apenas porque falham
    # explicitamente; continuam bloqueando --check ate serem removidos.
    case "$match" in
      *'tenant.util.ts:'*|*'platform-admin.guard.ts:'*)
        transition_matches+="${match}"$'\n'
        ;;
      *) active_matches+="${match}"$'\n' ;;
    esac
  done <<< "$matches"

  active_count=$(printf '%s' "$active_matches" | sed '/^$/d' | wc -l | tr -d ' ')
  transition_count=$(printf '%s' "$transition_matches" | sed '/^$/d' | wc -l | tr -d ' ')
  total_count=$((active_count + transition_count))
  REMAINING["$surface"]=$total_count
  TEMPORARY["$surface"]=$transition_count
  printf '%s: %s ativa(s)/bloqueante(s), %s temporária(s)/bloqueante(s), %s total\n' \
    "$surface" "$active_count" "$transition_count" "$total_count"
  if [ "$total_count" -gt 0 ]; then
    failures=1
    if [ "$MODE" = '--report' ]; then
      if [ "$active_count" -gt 0 ]; then
        echo '[ativas/bloqueantes]'
        printf '%s' "$active_matches"
      fi
      if [ "$transition_count" -gt 0 ]; then
        echo '[temporárias/bloqueantes]'
        printf '%s' "$transition_matches"
      fi
    fi
  fi
done

baseline_total=0
remaining_total=0
for surface in schema auth acl api events; do
  baseline_total=$((baseline_total + BASELINE[$surface]))
  remaining_total=$((remaining_total + REMAINING[$surface]))
done

overall_percent=$(awk -v base="$baseline_total" -v remaining="$remaining_total" 'BEGIN { printf "%.1f", (base - remaining) * 100 / base }')
overall_int=${overall_percent%.*}
printf '\nS1 %s %s%% (%s iniciais, %s bloqueantes restantes)\n' \
  "$(progress_bar "$overall_int")" "$overall_percent" "$baseline_total" "$remaining_total"
for surface in schema auth acl api events; do
  layer_percent=$(awk -v base="${BASELINE[$surface]}" -v remaining="${REMAINING[$surface]}" 'BEGIN { printf "%.1f", (base - remaining) * 100 / base }')
  layer_int=${layer_percent%.*}
  printf '%-7s %s %s%% (%s iniciais, %s restantes, %s temporárias bloqueantes)\n' \
    "$surface" "$(progress_bar "$layer_int")" "$layer_percent" \
    "${BASELINE[$surface]}" "${REMAINING[$surface]}" "${TEMPORARY[$surface]}"
done

if [ "$failures" -ne 0 ]; then
  if [ "$MODE" = '--check' ]; then
    echo 'Corte dedicado incompleto: referências ativas ou adaptadores temporários ainda existem nas superfícies verificadas.' >&2
  fi
  exit 1
fi

echo 'Corte dedicado concluído nas superfícies verificadas.'
