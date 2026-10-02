#!/usr/bin/env bash
# =============================================================================
# IA Studio — restauração completa de um pacote gerado por backup-full.sh.
#
# Executa fora da árvore do PM2 (via systemd-run quando chamado pelo painel).
# Nunca derruba o schema public: dumps dedicados carregam o próprio --clean e
# --if-exists. Isso preserva extensões instaladas pelo administrador do cluster
# (como pgvector) e evita iniciar uma API contra banco vazio após falha.
#
# Uso: restore-full.sh <arquivo.tar.gz> [restore_id]
# =============================================================================
set -u -o pipefail
umask 077

ARCHIVE="${1:?uso: restore-full.sh <arquivo.tar.gz> [restore_id]}"
RESTORE_ID="${2:-}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${IASTUDIO_APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
API_DIR="$APP_DIR/platform-api"
ENV_FILE="$API_DIR/.env"
WORK=''
PSQL_DATABASE_URL=''
LOG_FILE=''
DATABASE_READY=0
SERVICES_STOPPED=0

die() { echo "ERRO: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || die 'execute a restauração como root.'
[ -f "$ARCHIVE" ] || die "pacote não encontrado: $ARCHIVE"
[ -f "$ENV_FILE" ] || die ".env não encontrado: $ENV_FILE"

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a
: "${IASTUDIO_APP_ID:?IASTUDIO_APP_ID ausente no .env da aplicação}"
: "${IASTUDIO_PM2_API:?IASTUDIO_PM2_API ausente no .env da aplicação}"
: "${IASTUDIO_PM2_WORKER:?IASTUDIO_PM2_WORKER ausente no .env da aplicação}"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib/instance.sh"
set_application "$IASTUDIO_APP_ID"
[ "$IASTUDIO_APP_DIR" = "$APP_DIR" ] || die 'configuração não pertence ao diretório da aplicação.'
acquire_application_lock
PSQL_DATABASE_URL="$(db_url_for_psql)"
STORAGE_DIR="${IASTUDIO_STORAGE_DIR:-$API_DIR/storage}"
mkdir -p "$IASTUDIO_BACKUP_DIR" || die 'não foi possível criar o diretório de backups.'
LOG_FILE="$IASTUDIO_BACKUP_DIR/restore-${RESTORE_ID:-manual-$(date +%Y%m%d-%H%M%S)}.log"

sql_escape() { printf '%s' "$1" | sed "s/'/''/g"; }
log() { printf '%s %s\n' "$(date -u +%H:%M:%S)" "$*" | tee -a "$LOG_FILE"; }

append_operation_log() {
  [ -n "$RESTORE_ID" ] || return 0
  local message escaped
  message="$(date -u +%H:%M:%S) $1"
  escaped="$(sql_escape "$message")"
  psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c \
    "UPDATE system_restores SET log_lines = array_append(log_lines, '$escaped') WHERE id = '$RESTORE_ID' AND status = 'RUNNING';" \
    >/dev/null 2>&1 || log 'WARN: não foi possível persistir log da operação no banco.'
}

ensure_operation_row() {
  [ -n "$RESTORE_ID" ] || return 0
  local id file
  id="$(sql_escape "$RESTORE_ID")"
  file="$(sql_escape "$(basename "$ARCHIVE")")"
  # O snapshot restaura system_restores para o estado do backup. Recrie a row
  # atual para que o polling do painel enxergue o estado terminal correto.
  psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c \
    "INSERT INTO system_restores (id, kind, status, file_name, log_lines, error, started_by, started_at) VALUES ('$id', 'RESTORE', 'RUNNING', '$file', ARRAY[]::text[], NULL, 'restore-script', now()) ON CONFLICT (id) DO UPDATE SET kind='RESTORE', status='RUNNING', file_name=EXCLUDED.file_name, log_lines=ARRAY[]::text[], error=NULL, finished_at=NULL;" \
    >/dev/null || return 1
}

finish_operation() {
  [ -n "$RESTORE_ID" ] || return 0
  local status="$1" error="${2:-}" escaped
  escaped="$(sql_escape "$error")"
  psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -c \
    "UPDATE system_restores SET status='$status', error=NULLIF('$escaped', ''), finished_at=now() WHERE id='$RESTORE_ID' AND status='RUNNING';" \
    >/dev/null || { log 'WARN: não foi possível fechar o estado da restauração no banco.'; return 1; }
}

ensure_vector_extension() {
  # vector é uma extensão do cluster e normalmente só postgres pode criá-la.
  # Nunca tente recriá-la com o role da aplicação após uma operação destrutiva.
  su -s /bin/sh postgres -c "psql -v ON_ERROR_STOP=1 -d '$IASTUDIO_DB_NAME' -c 'CREATE EXTENSION IF NOT EXISTS vector;'" \
    >>"$LOG_FILE" 2>&1
}

restore_previous_state() {
  log 'ROLLBACK: restaurando o estado local anterior após falha.'
  ensure_vector_extension || log 'ROLLBACK WARN: não foi possível garantir pgvector.'
  if [ -f "$WORK/pre-restore.sql" ]; then
    psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$WORK/pre-restore.sql" >>"$LOG_FILE" 2>&1 \
      && DATABASE_READY=1 \
      || log 'ROLLBACK ERROR: não foi possível restaurar o banco anterior.'
  fi
  if [ -d "$WORK/pre-restore-storage" ]; then
    rm -rf "${STORAGE_DIR:?}"/* 2>/dev/null || true
    mkdir -p "$STORAGE_DIR"
    cp -a "$WORK/pre-restore-storage/." "$STORAGE_DIR/" >>"$LOG_FILE" 2>&1 || log 'ROLLBACK ERROR: não foi possível restaurar storage anterior.'
  fi
  [ -f "$WORK/pre-restore.env" ] && cp "$WORK/pre-restore.env" "$ENV_FILE" || true
}

restart_or_hold_services() {
  local status=$?
  trap - EXIT
  [ -n "$WORK" ] && rm -rf -- "$WORK" || true
  if [ "$SERVICES_STOPPED" -eq 1 ] && [ "$DATABASE_READY" -eq 1 ]; then
    log 'RESTART: reiniciando a aplicação com a configuração local.'
    pm2 delete "$IASTUDIO_PM2_API" "$IASTUDIO_PM2_WORKER" >/dev/null 2>&1 || true
    if ! pm2 start "$SCRIPT_DIR/ecosystem.config.js" --update-env >>"$LOG_FILE" 2>&1; then
      log 'RESTART ERROR: PM2 não iniciou; verifique o log desta restauração.'
      status=1
    else
      pm2 save >/dev/null 2>&1 || true
    fi
  elif [ "$SERVICES_STOPPED" -eq 1 ]; then
    log 'SAFETY: aplicação permanece parada porque o banco não está recuperável; nenhuma API será iniciada contra banco vazio.'
    status=1
  fi
  exit "$status"
}
trap restart_or_hold_services EXIT

fail_after_stop() {
  local reason="$1"
  log "FAILED: $reason"
  restore_previous_state
  finish_operation FAILED "$reason" || true
  exit 1
}

log "START: restauração do pacote $(basename "$ARCHIVE")."
WORK="$(mktemp -d)" || die 'não foi possível criar diretório temporário.'
if ! tar -xzf "$ARCHIVE" -C "$WORK" >>"$LOG_FILE" 2>&1; then
  die 'não foi possível extrair o pacote; nenhuma alteração foi aplicada.'
fi
[ -f "$WORK/db.sql" ] || die 'pacote inválido: db.sql ausente.'
[ -f "$WORK/manifest.json" ] || die 'pacote inválido: manifest.json ausente.'

# Snapshot para rollback real. O dump da origem contém --clean desde v0.11.31;
# o snapshot também, para recuperar em caso de falha posterior.
log 'PREFLIGHT: criando snapshot local para rollback.'
cp "$ENV_FILE" "$WORK/pre-restore.env" || die 'não foi possível preservar .env atual.'
if ! pg_dump --no-owner --no-privileges --clean --if-exists "$PSQL_DATABASE_URL" > "$WORK/pre-restore.sql" 2>>"$LOG_FILE"; then
  die 'não foi possível criar snapshot do banco atual; restauração cancelada.'
fi
if [ -d "$STORAGE_DIR" ]; then
  mkdir -p "$WORK/pre-restore-storage"
  cp -a "$STORAGE_DIR/." "$WORK/pre-restore-storage/" 2>>"$LOG_FILE" || die 'não foi possível preservar o storage atual.'
fi

log 'STOP: parando processos da aplicação.'
pm2 stop "$IASTUDIO_PM2_API" "$IASTUDIO_PM2_WORKER" >/dev/null 2>&1 || log 'WARN: processos PM2 já estavam parados.'
SERVICES_STOPPED=1

log 'DB_RESTORE: garantindo extensão pgvector no cluster.'
ensure_vector_extension || fail_after_stop 'não foi possível garantir a extensão pgvector antes da restauração.'
log 'DB_RESTORE: aplicando dump sem apagar o schema public.'
if ! psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$WORK/db.sql" >>"$LOG_FILE" 2>&1; then
  fail_after_stop 'psql não conseguiu aplicar o dump; o estado anterior foi restaurado quando possível.'
fi
DATABASE_READY=1

if ! ensure_operation_row; then
  fail_after_stop 'banco restaurado, mas não foi possível recriar o registro da operação administrativa.'
fi
append_operation_log 'DB_RESTORE: banco restaurado com sucesso.'

if [ -d "$WORK/storage" ]; then
  log 'STORAGE: restaurando arquivos locais.'
  rm -rf "${STORAGE_DIR:?}"/* 2>/dev/null || true
  mkdir -p "$STORAGE_DIR"
  if ! cp -a "$WORK/storage/." "$STORAGE_DIR/" >>"$LOG_FILE" 2>&1; then
    fail_after_stop 'não foi possível restaurar os arquivos locais; o estado anterior foi restaurado quando possível.'
  fi
fi

# Segredos criptográficos pertencem aos dados restaurados. Identidade de host
# (DATABASE_URL, REDIS_URL, porta e app-id) é local e nunca vem do pacote.
log 'SECRETS: reaplicando apenas segredos compatíveis com a aplicação local.'
if ! node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const envPath = process.argv[2];
  const allowed = new Set(["ENCRYPTION_KEY", "JWT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_OAUTH_REDIRECT"]);
  const secrets = m.secrets || {};
  let env = fs.readFileSync(envPath, "utf8");
  for (const [key, value] of Object.entries(secrets)) {
    if (!allowed.has(key) || value === undefined || value === null || value === "") continue;
    const re = new RegExp("^" + key + "=.*$", "m");
    env = re.test(env) ? env.replace(re, key + "=" + value) : env.replace(/\n?$/, "\n" + key + "=" + value + "\n");
  }
  fs.writeFileSync(envPath, env);
' "$WORK/manifest.json" "$ENV_FILE" >>"$LOG_FILE" 2>&1; then
  fail_after_stop 'não foi possível reaplicar segredos do pacote; o estado anterior foi restaurado quando possível.'
fi

append_operation_log "DONE: restauração concluída ($(basename "$ARCHIVE"))."
if ! finish_operation SUCCESS ''; then
  fail_after_stop 'restauração concluída, mas não foi possível registrar o sucesso administrativo.'
fi
log 'DONE: restauração concluída; a aplicação será reiniciada.'
exit 0
