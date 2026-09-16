#!/usr/bin/env bash
# Entrada compatível para a desinstalação dedicada por instância.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "$SCRIPT_DIR/uninstall-dedicated.sh" "$@"
