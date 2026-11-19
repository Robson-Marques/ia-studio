#!/usr/bin/env bash
# Captura imutável da instalação SaaS histórica para rollback. Este script nunca
# cria, altera ou restaura uma instância dedicada e requer a origem explicitamente.
set -euo pipefail
umask 077

usage() {
  cat <<'EOF'
Uso:
  SOURCE_DATABASE_URL='postgresql://...' bash scripts/migration/backup-saas-historical.sh \
    --source-app-dir </caminho/ia-studio-saas> --output-dir </cofre/de-backups>

Gera um único arquivo .tar.gz com dump lógico, storage, .env histórico e
manifest/checksums. Guarde-o fora da nova instância dedicada. Não passe a URL
do banco como argumento de linha de comando.
EOF
}

SOURCE_APP_DIR=''
OUTPUT_DIR=''
while (($#)); do
  case "$1" in
    --source-app-dir) SOURCE_APP_DIR="${2:?valor ausente}"; shift 2 ;;
    --output-dir) OUTPUT_DIR="${2:?valor ausente}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Argumento desconhecido: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "${SOURCE_DATABASE_URL:-}" ] || { echo 'SOURCE_DATABASE_URL é obrigatória.' >&2; exit 2; }
[ -n "$SOURCE_APP_DIR" ] && [ -d "$SOURCE_APP_DIR" ] || { echo 'source-app-dir inválido.' >&2; exit 2; }
[ -n "$OUTPUT_DIR" ] || { echo 'output-dir é obrigatório.' >&2; exit 2; }
[ -f "$SOURCE_APP_DIR/platform-api/.env" ] || { echo '.env da fonte histórica não encontrado.' >&2; exit 2; }

mkdir -p "$OUTPUT_DIR"
chmod 700 "$OUTPUT_DIR"
stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
archive="$OUTPUT_DIR/iastudio-saas-historical-$stamp.tar.gz"
[ ! -e "$archive" ] || { echo 'arquivo de backup já existe.' >&2; exit 2; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
pg_dump "$SOURCE_DATABASE_URL" > "$work/db.sql"
cp "$SOURCE_APP_DIR/platform-api/.env" "$work/source.env"
mkdir -p "$work/storage"
if [ -d "$SOURCE_APP_DIR/platform-api/storage" ]; then
  cp -a "$SOURCE_APP_DIR/platform-api/storage/." "$work/storage/"
fi

(
  cd "$work"
  sha256sum db.sql source.env > checksums.sha256
  if [ -d storage ]; then find storage -type f -print0 | sort -z | xargs -0 -r sha256sum >> checksums.sha256; fi
)
source_url_hash="$(printf '%s' "$SOURCE_DATABASE_URL" | sha256sum | cut -d' ' -f1)"
cat > "$work/manifest.json" <<EOF
{
  "kind": "iastudio-saas-historical-backup",
  "version": 1,
  "created_at": "$(date -Iseconds)",
  "source_database_url_sha256": "$source_url_hash",
  "contains_secrets": true,
  "purpose": "historical-rollback-only",
  "restore_policy": "never-restore-into-dedicated-instance"
}
EOF
tar -czf "$archive" -C "$work" db.sql source.env storage checksums.sha256 manifest.json
(
  cd "$OUTPUT_DIR"
  sha256sum "$(basename "$archive")"
) > "$archive.sha256"
chmod 600 "$archive" "$archive.sha256"
printf '%s\n' "$archive"
