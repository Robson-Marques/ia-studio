#!/usr/bin/env bash
# Gate S5 — regressão da Acceptance da Capability SaaS -> instalação dedicada.
# Consolida os gates estruturais já existentes e impede que o contrato seja
# marcado como aceito sem sua matriz de evidência integrada.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

bash scripts/migration/verify-dedicated-cut.sh --check >/dev/null
bash scripts/migration/verify-operational-dedicated.sh >/dev/null
bash scripts/migration/verify-console-retirement.sh >/dev/null
bash scripts/migration/verify-instance-isolation.sh >/dev/null

CONTRACT='docs/capabilities/saas-to-dedicated-installation.md'
EVIDENCE='docs/capabilities/saas-to-dedicated-s5-acceptance.md'

grep -qx 'status: accepted' "$CONTRACT" \
  || { echo 'FALHA: Capability dedicada não está marcada como accepted.' >&2; exit 1; }
[ -s "$EVIDENCE" ] \
  || { echo 'FALHA: matriz de Acceptance integrada ausente.' >&2; exit 1; }
rg -Fq '## Evidência por critério' "$EVIDENCE" \
  || { echo 'FALHA: matriz de Acceptance não registra os critérios.' >&2; exit 1; }

printf '%s\n' 'S5 Acceptance: aprovado — gates S1–S4 e matriz integrada presentes.'
