#!/usr/bin/env bash
# =============================================================================
# IA Studio — restauracao COMPLETA a partir de um pacote gerado por
# backup-full.sh (root, sem sudo). DESTRUTIVO: recria o banco e sobrescreve os
# arquivos de storage e os segredos do .env.
#
# IMPORTANTE (licao do Aquapark): NAO deve rodar como filho do PM2 — o
# `pm2 delete` deste script mataria a arvore de processos e abortaria o restore
# no meio (treekill). Por isso o SystemService dispara via `systemd-run` (unidade
# transiente, fora da arvore do PM2). Aqui garantimos o restart via `trap EXIT`.
#
# Uso: restore-full.sh <arquivo.tar.gz> [restore_id]
# =============================================================================
set -euo pipefail

ARCHIVE="${1:?uso: restore-full.sh <arquivo.tar.gz> [restore_id]}"
RESTORE_ID="${2:-}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="${IASTUDIO_APP_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
API_DIR="$APP_DIR/platform-api"
STORAGE_DIR="${IASTUDIO_STORAGE_DIR:-$API_DIR/storage}"
ENV_FILE="$API_DIR/.env"

[ -f "$ARCHIVE" ] || { echo "Pacote nao encontrado: $ARCHIVE"; exit 1; }

set -a; . "$ENV_FILE"; set +a
: "${IASTUDIO_APP_ID:?IASTUDIO_APP_ID ausente no .env da aplicação}"
: "${IASTUDIO_PM2_API:?IASTUDIO_PM2_API ausente no .env da aplicação}"
: "${IASTUDIO_PM2_WORKER:?IASTUDIO_PM2_WORKER ausente no .env da aplicação}"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib/instance.sh"
set_application "$IASTUDIO_APP_ID"
[ "$IASTUDIO_APP_DIR" = "$APP_DIR" ] || { echo 'Configuração não pertence ao diretório da aplicação.' >&2; exit 1; }
acquire_application_lock

WORK="$(mktemp -d)"

# trap EXIT: aconteca o que acontecer, garante que a app volta a subir e limpa
# o temporario. Recria os processos com `delete + start` para RELER o .env
# (segredos podem ter mudado na restauracao).
restart_app() {
  cd "$API_DIR"
  pm2 delete "$IASTUDIO_PM2_API" "$IASTUDIO_PM2_WORKER" >/dev/null 2>&1 || true
  pm2 start "$SCRIPT_DIR/ecosystem.config.js" >/dev/null 2>&1 || true
  pm2 save >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap restart_app EXIT

mark() { # atualiza a row system_restores (se restore_id foi passado)
  [ -n "$RESTORE_ID" ] || return 0
  psql "$(db_url_for_psql)" -v ON_ERROR_STOP=0 -c "$1" >/dev/null 2>&1 || true
}

# 1) Extrai o pacote.
tar -xzf "$ARCHIVE" -C "$WORK"
[ -f "$WORK/db.sql" ] || { echo "Pacote invalido: db.sql ausente."; exit 1; }
[ -f "$WORK/manifest.json" ] || { echo "Pacote invalido: manifest.json ausente."; exit 1; }

# 2) Para a app antes de mexer no banco.
cd "$API_DIR"
pm2 stop "$IASTUDIO_PM2_API" "$IASTUDIO_PM2_WORKER" >/dev/null 2>&1 || true

# 3) Recria o schema do banco e restaura o dump.
#    Zera o schema public e recarrega — o dump plain recria as tabelas.
psql "$(db_url_for_psql)" -v ON_ERROR_STOP=1 -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
psql "$(db_url_for_psql)" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS vector;"
psql "$(db_url_for_psql)" -v ON_ERROR_STOP=1 -f "$WORK/db.sql"

# 4) Restaura os arquivos de storage.
if [ -d "$WORK/storage" ]; then
  mkdir -p "$STORAGE_DIR"
  rm -rf "${STORAGE_DIR:?}/"* 2>/dev/null || true
  cp -a "$WORK/storage/." "$STORAGE_DIR/" 2>/dev/null || true
fi

# 5) Reaplica os segredos do manifest no .env (ENCRYPTION_KEY e obrigatorio para
#    decifrar os secrets restaurados). Usa node para ler o JSON com seguranca.
node -e '
  const fs = require("fs");
  const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const envPath = process.argv[2];
  const s = m.secrets || {};
  let env = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || v === null || v === "") continue;
    const re = new RegExp("^" + k + "=.*$", "m");
    env = re.test(env) ? env.replace(re, k + "=" + v) : (env.replace(/\n?$/, "\n") + k + "=" + v + "\n");
  }
  fs.writeFileSync(envPath, env);
' "$WORK/manifest.json" "$ENV_FILE"

mark "UPDATE system_restores SET status='SUCCESS', finished_at=now() WHERE id='${RESTORE_ID}' AND status='RUNNING';"
echo "Restauracao completa concluida. A app sera reiniciada pela trap EXIT."
# O restart_app (trap EXIT) sobe a app relendo o .env restaurado.
