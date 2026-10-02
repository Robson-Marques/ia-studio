#!/usr/bin/env bash
# Compatibilidade de entrada: o instalador SaaS foi aposentado.
# Toda instalação nova precisa declarar uma aplicação dedicada e é encaminhada
# ao provisionador que isola diretórios, banco, Redis, processos e vhost.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec bash "${SCRIPT_DIR}/install-dedicated.sh" "$@"
