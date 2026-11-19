#!/usr/bin/env bash
# Provisionamento opcional do Codex CLI para UMA instalação dedicada.
# Não troca Node, npm, PM2, WAHA, permissões dos dados nem serviços do host.
set -euo pipefail
umask 077

[ "$(id -u)" = 0 ] || { echo "Codex: precisa de root para criar usuário restrito" >&2; exit 2; }
APP_ID="${1:-}"
[[ "$APP_ID" =~ ^[a-z][a-z0-9-]{2,31}$ ]] || { echo "Codex: app-id inválido" >&2; exit 2; }

# Nome estável e <= 32 bytes. Cada instalação tem uma identidade Unix distinta.
HASH="$(printf '%s' "$APP_ID" | sha256sum | cut -c1-16)"
RUN_USER="icx-$HASH"
CODEX_ROOT="/var/lib/iastudio-codex/$APP_ID"
PREFIX="/opt/iastudio-codex"
BIN="$PREFIX/bin/codex"
INSTALL_VERSION="${IASTUDIO_CODEX_PACKAGE_VERSION:-latest}"

# Sem chown recursivo sobre diretórios compartilhados com outros produtos.
install -d -o root -g root -m 0711 /var/lib/iastudio-codex
if ! id "$RUN_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir "$CODEX_ROOT" \
    --shell /usr/sbin/nologin --user-group "$RUN_USER"
fi
install -d -o "$RUN_USER" -g "$RUN_USER" -m 0700 "$CODEX_ROOT"

# Evitar upgrade global involuntário do binário já instalado.
if [ -x "$BIN" ] && "$BIN" --version >/dev/null 2>&1; then
  echo "Codex CLI: binário oficial já disponível: $("$BIN" --version)"
else
  command -v npm >/dev/null || { echo "Codex CLI: npm não encontrado" >&2; exit 3; }
  npm install -g --prefix "$PREFIX" --no-audit --no-fund \
    "@openai/codex@$INSTALL_VERSION" >/dev/null
  test -x "$BIN" || { echo "Codex CLI: instalação não gerou binário" >&2; exit 4; }
  "$BIN" --version
fi
# Configuração imprimível pelo operador; nunca mostra sessão nem token.
echo "Codex CLI pronto: usuário $RUN_USER; CODEX_HOME isolado em $CODEX_ROOT"
