#!/usr/bin/env bash
# =============================================================================
# IA Studio — backup COMPLETO de migracao (root, sem sudo).
# Gera um unico .tar.gz contendo:
#   * db.sql               → dump logico do iastudio_db (pg_dump plain).
#   * storage/             → arquivos do Storage Manager (uploads/midias).
#   * manifest.json        → metadados + SEGREDOS do .env necessarios para
#                            decifrar os secrets no destino (ENCRYPTION_KEY,
#                            JWT_SECRET, DATABASE_URL, REDIS_URL, GOOGLE_*).
#
# O manifest carrega segredos DE PROPOSITO: sem ENCRYPTION_KEY o destino nao
# consegue abrir os secrets AES-256-GCM. Guarde o pacote com cuidado.
#
# Uso: backup-full.sh [nome-opcional]   → imprime o caminho do arquivo gerado.
# =============================================================================
set -euo pipefail

APP_DIR="/opt/iastudio"
API_DIR="$APP_DIR/platform-api"
BACKUP_DIR="${IASTUDIO_BACKUP_DIR:-/opt/iastudio-backups}"
STORAGE_DIR="${IASTUDIO_STORAGE_DIR:-$API_DIR/storage}"

set -a; . "$API_DIR/.env"; set +a

STAMP="$(date '+%Y%m%d-%H%M%S')"
NAME="${1:-full-${STAMP}}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$BACKUP_DIR"

# 1) Dump do banco (formato plain, restauravel com psql).
pg_dump "$DATABASE_URL" > "$WORK/db.sql"

# 2) Arquivos de storage (se existirem).
mkdir -p "$WORK/storage"
if [ -d "$STORAGE_DIR" ]; then
  cp -a "$STORAGE_DIR/." "$WORK/storage/" 2>/dev/null || true
fi

# 3) Manifest com segredos (necessarios para decifrar no destino).
#    Extrai os valores do .env de forma simples (KEY=valor).
env_val() { grep -E "^$1=" "$API_DIR/.env" | head -1 | cut -d= -f2- || true; }
cat > "$WORK/manifest.json" <<EOF
{
  "kind": "iastudio-full-backup",
  "version": 1,
  "created_at": "$(date -Iseconds)",
  "hostname": "$(hostname)",
  "secrets": {
    "ENCRYPTION_KEY": "$(env_val ENCRYPTION_KEY)",
    "JWT_SECRET": "$(env_val JWT_SECRET)",
    "DATABASE_URL": "$(env_val DATABASE_URL)",
    "REDIS_URL": "$(env_val REDIS_URL)",
    "GOOGLE_CLIENT_ID": "$(env_val GOOGLE_CLIENT_ID)",
    "GOOGLE_CLIENT_SECRET": "$(env_val GOOGLE_CLIENT_SECRET)",
    "GOOGLE_OAUTH_REDIRECT": "$(env_val GOOGLE_OAUTH_REDIRECT)"
  }
}
EOF

# 4) Empacota tudo.
OUT="$BACKUP_DIR/${NAME}.tar.gz"
tar -czf "$OUT" -C "$WORK" db.sql storage manifest.json
chmod 600 "$OUT"

echo "$OUT"
