#!/usr/bin/env bash
# =============================================================================
# IA Studio — restauracao SOMENTE do banco a partir de um dump .sql/.sql.gz
# (root, sem sudo). Nao mexe em storage nem em segredos — apenas os dados.
# Fluxo simples: para PM2 → restaura → sobe PM2.
#
# Uso: restore-backup.sh <arquivo.sql|.sql.gz>
# =============================================================================
set -euo pipefail

DUMP="${1:?uso: restore-backup.sh <arquivo.sql|.sql.gz>}"
APP_DIR="/opt/iastudio"
API_DIR="$APP_DIR/platform-api"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

[ -f "$DUMP" ] || { echo "Dump nao encontrado: $DUMP"; exit 1; }
set -a; . "$API_DIR/.env"; set +a

echo "[restore-backup] Parando PM2..."
pm2 stop iastudio-api iastudio-worker >/dev/null 2>&1 || true

echo "[restore-backup] Recriando schema e restaurando o dump..."
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS vector;"
case "$DUMP" in
  *.gz) gunzip -c "$DUMP" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1 ;;
  *)    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$DUMP" ;;
esac

echo "[restore-backup] Subindo PM2..."
cd "$API_DIR"
pm2 reload "$SCRIPT_DIR/ecosystem.config.js" || pm2 restart iastudio-api iastudio-worker
echo "[restore-backup] Concluido."
