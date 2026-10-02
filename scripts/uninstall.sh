#!/usr/bin/env bash
# Entrada compatível para a desinstalação dedicada por aplicação.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/uninstall-dedicated.sh" "$@"
