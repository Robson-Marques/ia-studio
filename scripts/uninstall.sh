#!/bin/bash
# ============================================================
# IA Studio - uninstall.sh v1.0
# Debian 12/13 -- executa como ROOT
#
# USO INTERATIVO (recomendado):
#   bash scripts/uninstall.sh        # abre wizard com menu
#
# USO HEADLESS:
#   --purge      (default)  Remove TUDO: app + Node + PostgreSQL + Redis + Nginx + Certbot + SSL
#   --keep-deps             Remove app, mantem Node + PostgreSQL + Redis + Nginx + SSL
#   --keep-db               Mantem o banco iastudio_db (preserva dados)
#   --keep-all              Equivalente a --keep-deps --keep-db
#   --yes / -y              Pula confirmacao final
# ============================================================

export DEBIAN_FRONTEND=noninteractive
export DEBCONF_NONINTERACTIVE_SEEN=true
set -uo pipefail
[ "$(id -u)" -ne 0 ] && echo "Execute como root" && exit 1

INSTALL_DIR="/opt/iastudio"
PG_DB="iastudio_db"
PG_USER="iastudio"

KEEP_DEPS=0; KEEP_DB=0; PURGE=1; HAS_ARGS=0; ASSUME_YES=0
for arg in "$@"; do
  HAS_ARGS=1
  case "$arg" in
    --keep-deps) KEEP_DEPS=1; PURGE=0 ;;
    --keep-db)   KEEP_DB=1;   PURGE=0 ;;
    --keep-all)  KEEP_DEPS=1; KEEP_DB=1; PURGE=0 ;;
    --purge)     PURGE=1; KEEP_DEPS=0; KEEP_DB=0 ;;
    --yes|-y)    ASSUME_YES=1 ;;
    -h|--help)   sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Arg desconhecido: $arg"; exit 1 ;;
  esac
done

ask_choice() {
  local prompt="$1"; local opts="$2"; local default_idx="${3:-1}"
  local IFS='|'; local -a arr=(${opts}); IFS=$' \t\n'
  echo "  ${prompt}"
  local i=1
  for o in "${arr[@]}"; do echo "    ${i}) ${o}"; i=$((i+1)); done
  while :; do
    read -r -p "  Escolha [1-${#arr[@]}] (default: ${default_idx}): " r
    [ -z "${r}" ] && r="${default_idx}"
    if [[ "${r}" =~ ^[0-9]+$ ]] && [ "${r}" -ge 1 ] && [ "${r}" -le ${#arr[@]} ]; then
      ASK_REPLY="${r}"; return
    fi
    echo "    (opcao invalida)"
  done
}
ask_yesno() {
  local prompt="$1"; local default="${2:-n}"; local hint="[s/N]"
  [ "${default}" = "s" ] && hint="[S/n]"
  read -r -p "  ${prompt} ${hint}: " r
  [ -z "${r}" ] && r="${default}"
  [[ "${r}" =~ ^[sSyY] ]] && return 0 || return 1
}

if [ "${HAS_ARGS}" = "0" ]; then
  echo
  echo "============================================================"
  echo "  IA Studio - Desinstalador interativo"
  echo "============================================================"
  echo "  ATENCAO: remove arquivos da aplicacao. Faca backup antes se necessario."
  echo
  ask_choice "Modo de desinstalacao:" \
    "PURGE TOTAL (app + Node + PostgreSQL + Redis + Nginx + Certbot + SSL)|keep-deps (remove app, mantem dependencias + SSL)|keep-db (remove app + deps, MANTEM banco ${PG_DB})|keep-all (so para o servico, mantem TUDO no disco)" 2
  case "${ASK_REPLY}" in
    1) PURGE=1; KEEP_DEPS=0; KEEP_DB=0 ;;
    2) PURGE=0; KEEP_DEPS=1; KEEP_DB=0 ;;
    3) PURGE=0; KEEP_DEPS=0; KEEP_DB=1 ;;
    4) PURGE=0; KEEP_DEPS=1; KEEP_DB=1 ;;
  esac
  echo
  if ! ask_yesno "Confirmar desinstalacao? Esta operacao NAO pode ser desfeita." "n"; then
    echo "Cancelado pelo usuario."; exit 0
  fi
elif [ "${ASSUME_YES}" = "0" ] && [ "${PURGE}" = "1" ]; then
  echo "ATENCAO: --purge removera Node, PostgreSQL, Redis, Nginx, Certbot e certificados SSL."
  read -r -p "Confirmar PURGE TOTAL? Digite 'REMOVER' para continuar: " r
  [ "${r}" != "REMOVER" ] && { echo "Cancelado."; exit 0; }
fi

mkdir -p /var/log/iastudio
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG="/var/log/iastudio/uninstall-${TIMESTAMP}.log"
exec > >(tee -a "$LOG") 2>&1
log() { echo "[$(date '+%H:%M:%S')] $*"; }

MODE_LABEL="PURGE TOTAL"
[ "${KEEP_DEPS}" = "1" ] && MODE_LABEL="KEEP-DEPS"
[ "${KEEP_DB}"   = "1" ] && MODE_LABEL="${MODE_LABEL} + KEEP-DB"
log "=============================================="
log "  IA Studio - DESINSTALACAO | Modo: ${MODE_LABEL}"
log "  $(date) | Log: ${LOG}"
log "=============================================="

log "[1] Parando PM2 (iastudio-api + iastudio-worker)..."
pm2 delete iastudio-api iastudio-worker 2>/dev/null || true
pm2 save --force 2>/dev/null || true
if [ "${KEEP_DEPS}" = "0" ]; then
  pm2 kill 2>/dev/null || true
  systemctl stop pm2-root 2>/dev/null || true
  systemctl disable pm2-root 2>/dev/null || true
  rm -f /etc/systemd/system/pm2-root.service
  systemctl daemon-reload 2>/dev/null || true
  log "  OK: PM2 encerrado"
else
  log "  OK: processos parados (PM2 mantido)"
fi

log "[2] Removendo arquivos da aplicacao..."
rm -rf "${INSTALL_DIR}" /tmp/iastudio 2>/dev/null || true
rm -f  /root/.iastudio-credentials 2>/dev/null || true
rm -f  /var/log/iastudio-install*.log 2>/dev/null || true
log "  OK: ${INSTALL_DIR} removido"

log "[3] Nginx..."
rm -f /etc/nginx/sites-enabled/iastudio*   /etc/nginx/sites-available/iastudio*   2>/dev/null || true
rm -f /etc/nginx/snippets/iastudio-*       2>/dev/null || true
if [ "${KEEP_DEPS}" = "1" ]; then
  [ -f /etc/nginx/sites-available/default ] && ln -sf /etc/nginx/sites-available/default /etc/nginx/sites-enabled/default 2>/dev/null || true
  systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true
  log "  OK: configs do IA Studio removidas, Nginx + SSL preservados"
else
  systemctl stop nginx 2>/dev/null || true
  systemctl disable nginx 2>/dev/null || true
  apt-get remove --purge -y nginx nginx-common nginx-full nginx-core certbot python3-certbot-nginx 2>/dev/null || true
  rm -rf /etc/nginx /var/log/nginx /etc/letsencrypt /var/lib/letsencrypt /var/log/letsencrypt
  log "  OK: Nginx + Certbot + certs SSL removidos"
fi

log "[4] Redis..."
if [ "${KEEP_DEPS}" = "1" ]; then
  log "  OK: Redis preservado"
else
  systemctl stop redis-server 2>/dev/null || systemctl stop redis 2>/dev/null || true
  systemctl disable redis-server 2>/dev/null || systemctl disable redis 2>/dev/null || true
  apt-get remove --purge -y redis-server redis 2>/dev/null || true
  rm -rf /etc/redis /var/lib/redis /var/log/redis
  log "  OK: Redis removido"
fi

log "[5] PostgreSQL..."
if [ "${KEEP_DEPS}" = "1" ]; then
  if [ "${KEEP_DB}" = "1" ]; then
    log "  --keep-deps + --keep-db: PostgreSQL e banco preservados"
    systemctl start postgresql 2>/dev/null || true
  else
    su -c "psql -c 'DROP DATABASE IF EXISTS ${PG_DB};'" postgres 2>/dev/null || true
    su -c "psql -c 'DROP USER IF EXISTS ${PG_USER};'"   postgres 2>/dev/null || true
    systemctl start postgresql 2>/dev/null || true
    log "  OK: banco ${PG_DB} dropado, PostgreSQL mantido"
  fi
else
  su -c "psql -c 'DROP DATABASE IF EXISTS ${PG_DB};'" postgres 2>/dev/null || true
  su -c "psql -c 'DROP USER IF EXISTS ${PG_USER};'"   postgres 2>/dev/null || true
  systemctl stop postgresql 2>/dev/null || true
  apt-get remove --purge -y 'postgresql-*' postgresql postgresql-common postgresql-client-common 2>/dev/null || true
  apt-get autoremove -y 2>/dev/null || true
  rm -rf /etc/postgresql /var/lib/postgresql /var/log/postgresql
  log "  OK: PostgreSQL removido"
fi

log "[6] Node.js / PM2..."
if [ "${KEEP_DEPS}" = "1" ]; then
  log "  OK: Node.js preservado"
else
  npm uninstall -g pm2 2>/dev/null || true
  apt-get remove --purge -y nodejs 2>/dev/null || true
  apt-get autoremove -y 2>/dev/null || true
  rm -f  /etc/apt/sources.list.d/nodesource.list
  rm -rf /root/.npm /root/.pm2 /root/.node_repl_history
  log "  OK: Node.js + PM2 removidos"
fi

log "[7] Limpeza final..."
[ "${KEEP_DEPS}" = "0" ] && { apt-get autoremove -y 2>/dev/null || true; apt-get clean 2>/dev/null || true; }
dpkg --configure -a 2>/dev/null || true

log ""
log "=============================================="
if [ "${KEEP_DEPS}" = "1" ]; then
  log "  DESINSTALACAO CONCLUIDA (dependencias mantidas)"
  [ "${KEEP_DB}" = "1" ] && log "  Banco ${PG_DB} preservado"
  log "  Reinstalar: bash ${INSTALL_DIR}/scripts/install.sh (ou do fonte)"
else
  log "  PURGE CONCLUIDO - servidor limpo"
fi
log "  Log: ${LOG}"
log "=============================================="
