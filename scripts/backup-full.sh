#!/usr/bin/env bash
# Backup completo local de uma aplicação dedicada. Quando disparado pelo painel,
# recebe --operation-id e fecha a própria row system_restores no PostgreSQL.
# Assim o resultado não depende de um callback em memória do processo PM2.
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${IASTUDIO_APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
API_DIR="$APP_DIR/platform-api"
ENV_FILE="$API_DIR/.env"
OPERATION_ID=''
NAME=''

usage() {
  cat <<'EOF'
Uso: backup-full.sh [nome-opcional] [--operation-id <uuid>]

Gera um .tar.gz com banco, storage e manifest da aplicação atual. O modo
--operation-id é usado pela administração local para registrar logs e estado.
EOF
}

while (($#)); do
  case "$1" in
    --operation-id) OPERATION_ID="${2:?valor ausente}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "ERRO: argumento desconhecido: $1" >&2; usage >&2; exit 2 ;;
    *) [ -z "$NAME" ] || { echo 'ERRO: informe somente um nome opcional.' >&2; exit 2; }; NAME="$1"; shift ;;
  esac
done

[[ -z "$OPERATION_ID" || "$OPERATION_ID" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] \
  || { echo 'ERRO: operation-id inválido.' >&2; exit 2; }
[[ -z "$NAME" || "$NAME" =~ ^[A-Za-z0-9._-]+$ ]] \
  || { echo 'ERRO: nome de backup inválido.' >&2; exit 2; }
[ -f "$ENV_FILE" ] || { echo "ERRO: .env não encontrado em $ENV_FILE" >&2; exit 2; }

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${IASTUDIO_APP_ID:?IASTUDIO_APP_ID ausente no .env}"
: "${IASTUDIO_BACKUP_DIR:?IASTUDIO_BACKUP_DIR ausente no .env}"

# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib/instance.sh"
set_application "$IASTUDIO_APP_ID"
[ "$IASTUDIO_APP_DIR" = "$APP_DIR" ] || { echo 'ERRO: configuração não pertence ao diretório da aplicação.' >&2; exit 2; }
acquire_application_lock
PSQL_DATABASE_URL="$(db_url_for_psql)"
STORAGE_DIR="${IASTUDIO_STORAGE_DIR:-$API_DIR/storage}"
WORK=''
OUT=''
SUCCEEDED=0
FAILURE='Backup interrompido antes de concluir.'

sql_escape() { printf '%s' "$1" | sed "s/'/''/g"; }

persist_operation() {
  # system_restores.id é String/UUID no Prisma, mas é uma coluna text no
  # PostgreSQL. Nunca faça cast para uuid nesta fronteira. Um erro de escrita
  # precisa chegar ao journal/systemd: silenciá-lo deixaria o arquivo criado e
  # a operação eternamente RUNNING no painel.
  psql "$PSQL_DATABASE_URL" -v ON_ERROR_STOP=1 -c "$1" >/dev/null || {
    echo 'ERRO: não foi possível persistir o estado do backup em system_restores.' >&2
    return 1
  }
}

append_log() {
  [ -n "$OPERATION_ID" ] || return 0
  local message escaped
  message="$(date -u +%H:%M:%S) $1"
  escaped="$(sql_escape "$message")"
  persist_operation \
    "UPDATE system_restores SET log_lines = array_append(log_lines, '$escaped') WHERE id = '$OPERATION_ID' AND status = 'RUNNING';"
}

finish_operation() {
  [ -n "$OPERATION_ID" ] || return 0
  local status="$1" error="${2:-}" file="${3:-}" escaped_error escaped_file
  escaped_error="$(sql_escape "$error")"
  escaped_file="$(sql_escape "$file")"
  persist_operation \
    "UPDATE system_restores SET status = '$status', file_name = NULLIF('$escaped_file', ''), error = NULLIF('$escaped_error', ''), finished_at = now() WHERE id = '$OPERATION_ID' AND status = 'RUNNING';"
}

finalize() {
  local exit_code=$?
  trap - EXIT
  [ -z "$WORK" ] || rm -rf -- "$WORK" || true
  if [ "$SUCCEEDED" -eq 1 ]; then
    append_log "DONE: backup concluído ($(basename "$OUT"))"
    finish_operation SUCCESS '' "$(basename "$OUT")"
  else
    append_log "FAILED: $FAILURE"
    finish_operation FAILED "$FAILURE"
  fi
  exit "$exit_code"
}
trap finalize EXIT

fail() {
  FAILURE="$1"
  exit 1
}

mkdir -p "$IASTUDIO_BACKUP_DIR" || fail 'Não foi possível criar o diretório de backups.'
WORK="$(mktemp -d)" || fail 'Não foi possível criar diretório temporário.'
STAMP="$(date '+%Y%m%d-%H%M%S')"
OUT="$IASTUDIO_BACKUP_DIR/${NAME:-full-$STAMP}.tar.gz"

append_log 'PREFLIGHT: validando aplicação e diretórios.'
append_log 'PG_DUMP: exportando banco local.'
# O restore aplica o dump no banco local sem derrubar o schema public. O próprio
# dump precisa, portanto, carregar a remoção segura dos objetos anteriores.
if ! pg_dump --no-owner --no-privileges --clean --if-exists "$PSQL_DATABASE_URL" > "$WORK/db.sql" 2>"$WORK/pg_dump.err"; then
  fail "pg_dump falhou: $(tail -c 500 "$WORK/pg_dump.err")"
fi

append_log 'STORAGE: copiando arquivos locais.'
mkdir -p "$WORK/storage"
if [ -d "$STORAGE_DIR" ]; then
  cp -a "$STORAGE_DIR/." "$WORK/storage/" 2>/dev/null || fail 'Não foi possível copiar o storage local.'
fi

append_log 'MANIFEST: registrando metadados do pacote.'
env_val() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- || true; }
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

append_log 'BUNDLE: compactando pacote.'
tar -czf "$OUT" -C "$WORK" db.sql storage manifest.json 2>"$WORK/tar.err" \
  || fail "tar falhou: $(tail -c 500 "$WORK/tar.err")"
chmod 600 "$OUT" || fail 'Não foi possível restringir permissões do pacote.'

SUCCEEDED=1
printf '%s\n' "$OUT"
