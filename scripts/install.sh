#!/bin/bash
# ============================================================
# IA Studio - install.sh v1.0 (monorepo NestJS + 2 paineis React)
# Debian 12/13 -- executa como ROOT
#
# USO INTERATIVO (recomendado):
#   bash scripts/install.sh            # abre wizard com perguntas
#
# USO HEADLESS (CI/automacao):
#   bash scripts/install.sh --mode=multi \
#        --domain-admin=app.exemplo.com --domain-console=console.exemplo.com \
#        --domain-api=api.exemplo.com --email=ssl@exemplo.com \
#        --admin-email=voce@exemplo.com --admin-password=SENHA_FORTE
#   # single: --mode=single --domain=app.exemplo.com ...
#
# Estrutura do monorepo esperada (irmaos deste scripts/):
#   platform-api/ (NestJS)  platform-admin/ (painel do cliente)  platform-console/ (Console SaaS)
# ============================================================

export DEBIAN_FRONTEND=noninteractive
export DEBCONF_NONINTERACTIVE_SEEN=true
set -euo pipefail
[ "$(id -u)" -ne 0 ] && echo "Execute como root" && exit 1

# ---------- ARGUMENTOS ----------
MODE=""; DOMAIN=""; DOMAIN_ADMIN=""; DOMAIN_CONSOLE=""; DOMAIN_API=""
CERT_EMAIL=""; ADMIN_NAME="Administrador"; ADMIN_EMAIL=""; ADMIN_PASSWORD=""
SEED_DEMO="1"; KEEP_DEPS=0; KEEP_DB=0; NO_SSL=0
# GITLAB_PACKAGE_TOKEN — credencial de leitura do GitLab. Usado pelo .npmrc
# do platform-admin para autenticar em `npm install @studio-ux-ds/*` (pacotes
# privados). Vai gravado no .env do platform-api; o upgrade.sh faz `source .env`
# antes dos npm install, entao a var fica visivel para o build. Pode ser vazio
# na primeira instalacao (usuario adiciona depois com `echo ... >> .env`).
GITLAB_PACKAGE_TOKEN="${GITLAB_PACKAGE_TOKEN:-}"

usage() {
  cat <<EOF
Uso:
  INTERATIVO: bash scripts/install.sh
  HEADLESS:   bash scripts/install.sh --mode=<single|multi> \\
                --domain=... | (--domain-admin=... --domain-console=... --domain-api=...) \\
                --email=<ssl> --admin-email=... --admin-password=... \\
                [--no-demo] [--keep-deps] [--keep-db] [--no-ssl]
EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode=*)            MODE="${1#*=}" ;;
    --domain=*)          DOMAIN="${1#*=}" ;;
    --domain-admin=*)    DOMAIN_ADMIN="${1#*=}" ;;
    --domain-console=*)  DOMAIN_CONSOLE="${1#*=}" ;;
    --domain-api=*)      DOMAIN_API="${1#*=}" ;;
    --email=*)           CERT_EMAIL="${1#*=}" ;;
    --admin-name=*)      ADMIN_NAME="${1#*=}" ;;
    --admin-email=*)     ADMIN_EMAIL="${1#*=}" ;;
    --admin-password=*)  ADMIN_PASSWORD="${1#*=}" ;;
    --gitlab-package-token=*) GITLAB_PACKAGE_TOKEN="${1#*=}" ;;
    --no-demo)           SEED_DEMO="0" ;;
    --keep-deps)         KEEP_DEPS=1 ;;
    --keep-db)           KEEP_DB=1 ;;
    --keep-all)          KEEP_DEPS=1; KEEP_DB=1 ;;
    --no-ssl)            NO_SSL=1 ;;
    -h|--help)           usage ;;
    *) echo "Arg desconhecido: $1"; usage ;;
  esac; shift
done

# ---------- HELPERS DE WIZARD ----------
ask() {
  local prompt="$1"; local default="${2:-}"; local hint=""
  [ -n "${default}" ] && hint=" [${default}]"
  read -r -p "  ${prompt}${hint}: " ASK_REPLY
  if [ -z "${ASK_REPLY}" ]; then ASK_REPLY="${default}"; fi
}
ask_required() {
  local prompt="$1"
  while :; do
    read -r -p "  ${prompt}: " ASK_REPLY
    [ -n "${ASK_REPLY}" ] && break
    echo "    (campo obrigatorio)"
  done
}
ask_password() {
  local prompt="$1"; local p1 p2
  while :; do
    read -r -s -p "  ${prompt}: " p1; echo
    if [ ${#p1} -lt 8 ]; then echo "    (minimo 8 caracteres)"; continue; fi
    read -r -s -p "  Confirme a senha: " p2; echo
    if [ "${p1}" != "${p2}" ]; then echo "    (senhas nao conferem)"; continue; fi
    ASK_REPLY="${p1}"; break
  done
}
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

# ---------- MODO INTERATIVO ----------
INTERACTIVE=0
if [ -z "${MODE}" ] && [ -z "${ADMIN_EMAIL}" ] && [ -z "${ADMIN_PASSWORD}" ]; then
  INTERACTIVE=1
fi

if [ "${INTERACTIVE}" = "1" ]; then
  echo
  echo "============================================================"
  echo "  IA Studio - Instalador interativo"
  echo "============================================================"
  echo
  ask_choice "Modo de instalacao:" \
    "single (painel do cliente + Console no mesmo dominio)|multi (painel, Console e API em dominios separados - recomendado)" 2
  if [ "${ASK_REPLY}" = "1" ]; then
    MODE="single"
    ask_required "Dominio principal (ex: app.exemplo.com)"; DOMAIN="${ASK_REPLY}"
    echo "  -> Painel do cliente em https://${DOMAIN}/  |  Console em https://${DOMAIN}/console/  |  API em /api"
  else
    MODE="multi"
    ask_required "Dominio do PAINEL DO CLIENTE (ex: app.exemplo.com)";  DOMAIN_ADMIN="${ASK_REPLY}"
    ask_required "Dominio do CONSOLE (SaaS) (ex: console.exemplo.com)"; DOMAIN_CONSOLE="${ASK_REPLY}"
    ask_required "Dominio da API (ex: api.exemplo.com)";                DOMAIN_API="${ASK_REPLY}"
  fi
  echo
  if ask_yesno "Emitir certificado SSL (Let's Encrypt)? Precisa dos dominios ja apontando para este servidor." "s"; then
    ask_required "E-mail para o certificado SSL"; CERT_EMAIL="${ASK_REPLY}"
  else
    NO_SSL=1
  fi
  echo
  echo "  --- Administrador da plataforma (Console) ---"
  ask "Nome do admin" "Administrador"; ADMIN_NAME="${ASK_REPLY}"
  ask_required "E-mail do admin"; ADMIN_EMAIL="${ASK_REPLY}"
  ask_password "Senha do admin (min 8 chars)"; ADMIN_PASSWORD="${ASK_REPLY}"
  echo
  echo "  --- Design System (GitLab privado) ---"
  echo "  O painel importa @studio-ux-ds/{tokens,components,react} do GitLab da Nivoo."
  echo "  O build precisa de uma credencial somente de leitura no .env."
  if [ -z "${GITLAB_PACKAGE_TOKEN}" ]; then
    read -rsp "  Token do GitLab (ler pacotes): " GITLAB_PACKAGE_TOKEN; echo
  fi
  echo
  if ask_yesno "Criar organizacao 'Demo' de avaliacao (admin@demo.local/demo123)?" "n"; then
    SEED_DEMO="1"
  else
    SEED_DEMO="0"
  fi
  echo
  ask_choice "Opcoes avancadas:" \
    "Instalacao limpa (recria banco + apt install)|keep-db (preserva banco existente)|keep-deps (pula apt install)|keep-all (preserva banco + pula apt install)" 1
  case "${ASK_REPLY}" in
    1) KEEP_DEPS=0; KEEP_DB=0 ;;
    2) KEEP_DEPS=0; KEEP_DB=1 ;;
    3) KEEP_DEPS=1; KEEP_DB=0 ;;
    4) KEEP_DEPS=1; KEEP_DB=1 ;;
  esac
  echo
  echo "============================================================"
  echo "  Resumo"
  echo "============================================================"
  echo "  Modo:        ${MODE}"
  if [ "${MODE}" = "single" ]; then
    echo "  Dominio:     ${DOMAIN}"
  else
    echo "  Painel:      ${DOMAIN_ADMIN}"
    echo "  Console:     ${DOMAIN_CONSOLE}"
    echo "  API:         ${DOMAIN_API}"
  fi
  [ "${NO_SSL}" = "0" ] && echo "  SSL email:   ${CERT_EMAIL}" || echo "  SSL:         desativado (HTTP)"
  echo "  Admin:       ${ADMIN_NAME} <${ADMIN_EMAIL}>"
  echo "  Org Demo:    $([ "${SEED_DEMO}" = "1" ] && echo sim || echo nao)"
  echo "  Opcoes:      keep-deps=${KEEP_DEPS} keep-db=${KEEP_DB}"
  echo "============================================================"
  echo
  if ! ask_yesno "Confirmar e iniciar instalacao?" "s"; then
    echo "Cancelado pelo usuario."; exit 0
  fi
fi

# ---------- VALIDACAO ----------
[ -z "${MODE}" ]           && echo "ERRO: --mode obrigatorio"           && usage
[ -z "${ADMIN_EMAIL}" ]    && echo "ERRO: --admin-email obrigatorio"    && usage
[ -z "${ADMIN_PASSWORD}" ] && echo "ERRO: --admin-password obrigatorio" && usage
[ -z "${GITLAB_PACKAGE_TOKEN}" ] && echo "ERRO: informe GITLAB_PACKAGE_TOKEN com leitura de pacotes" && exit 1
export GITLAB_PACKAGE_TOKEN
case "${MODE}" in
  single) [ -z "${DOMAIN}" ] && echo "ERRO: single requer --domain" && usage
          DOMAIN_ADMIN="${DOMAIN}"; DOMAIN_CONSOLE="${DOMAIN}"; DOMAIN_API="${DOMAIN}" ;;
  multi)  [ -z "${DOMAIN_ADMIN}" ]   && echo "ERRO: multi requer --domain-admin"   && usage
          [ -z "${DOMAIN_CONSOLE}" ] && echo "ERRO: multi requer --domain-console" && usage
          [ -z "${DOMAIN_API}" ]     && echo "ERRO: multi requer --domain-api"     && usage ;;
  *) echo "ERRO: --mode invalido: ${MODE}"; usage ;;
esac
[[ ! "${ADMIN_EMAIL}" =~ ^[^@]+@[^@]+\.[^@]+$ ]] && echo "ERRO: --admin-email invalido" && exit 1
[[ ${#ADMIN_PASSWORD} -lt 8 ]] && echo "ERRO: senha precisa >= 8 chars" && exit 1
[ "${NO_SSL}" = "0" ] && [ -z "${CERT_EMAIL}" ] && echo "ERRO: --email obrigatorio p/ SSL (ou use --no-ssl)" && exit 1

# ---------- CAMINHOS / SEGREDOS ----------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
INSTALL_DIR="/opt/iastudio"
API_DIR="${INSTALL_DIR}/platform-api"
ADMIN_DIR="${INSTALL_DIR}/platform-admin"
CONSOLE_DIR="${INSTALL_DIR}/platform-console"

[ ! -d "${SOURCE_DIR}/platform-api" ] && echo "ERRO: platform-api nao encontrado em ${SOURCE_DIR}" && exit 1

NODE_VERSION="20"
PG_USER="iastudio"
PG_DB="iastudio_db"
PG_PASS="$(openssl rand -hex 12)"
JWT_SECRET="$(openssl rand -hex 32)"
ENCRYPTION_KEY="$(openssl rand -hex 32)"
PORT="3000"

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
LOG="/var/log/iastudio-install-${TIMESTAMP}.log"
mkdir -p /var/log
exec > >(tee -a "$LOG") 2>&1
log()      { echo "$@"; }
log_step() { log ""; log ">>> [$1] $2..."; }
log_ok()   { log "  [OK] $1"; }
log_err()  { log "  [ERRO] $1"; exit 1; }

log "=== IA Studio install v1.0 | Modo: ${MODE} | Admin: ${ADMIN_EMAIL} | $(date) | Log: ${LOG} ==="

# ---------- 1) PACOTES BASE ----------
log_step "1" "Atualizando pacotes do sistema"
if [ "${KEEP_DEPS}" = "1" ] && command -v node &>/dev/null && command -v psql &>/dev/null && command -v nginx &>/dev/null; then
  log_ok "[--keep-deps] Pacotes base ja presentes - pulando apt"
else
  apt-get update -y
  apt-get install -y curl wget gnupg2 lsb-release ca-certificates build-essential git openssl rsync postgresql-client gzip
  log_ok "Pacotes base instalados"
fi

log_step "1a" "Preparando diretorios"
# Pasta de backups = a mesma que o backend (system.paths backupDir) le/lista.
mkdir -p /opt/iastudio-backups && chmod 700 /opt/iastudio-backups
log_ok "/opt/iastudio-backups (0700)"

log_step "1b" "Copiando projeto para ${INSTALL_DIR}"
if [ "${SOURCE_DIR}" != "${INSTALL_DIR}" ]; then
  mkdir -p "${INSTALL_DIR}"
  rsync -a --delete --exclude='node_modules' --exclude='.env' --exclude='dist' --exclude='*.log' "${SOURCE_DIR}/" "${INSTALL_DIR}/"
  log_ok "Projeto copiado"
else log_ok "Ja em ${INSTALL_DIR}"; fi

# ---------- 2) NODE ----------
log_step "2" "Instalando Node.js ${NODE_VERSION} LTS"
if node -v 2>/dev/null | grep -q "v${NODE_VERSION}"; then
  log_ok "Node.js $(node -v) ja presente"
elif [ "${KEEP_DEPS}" = "1" ] && command -v node &>/dev/null; then
  log_ok "[--keep-deps] Node.js $(node -v)"
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
  log_ok "Node.js $(node -v)"
fi

log_step "3" "Instalando PM2"
command -v pm2 &>/dev/null || npm install -g pm2
log_ok "PM2 $(pm2 -v)"

# ---------- 4) POSTGRES + PGVECTOR ----------
log_step "4" "Instalando PostgreSQL + pgvector"
if [ "${KEEP_DEPS}" = "1" ] && command -v psql &>/dev/null; then
  log_ok "[--keep-deps] PostgreSQL presente"
else
  apt-get install -y postgresql postgresql-contrib postgresql-common
fi
PG_VERSION="$(pg_lsclusters -h 2>/dev/null | awk 'NR==1{print $1}')"
[ -z "${PG_VERSION}" ] && PG_VERSION="$(psql --version 2>/dev/null | grep -oP '\d+' | head -1)"
log "  PostgreSQL ${PG_VERSION}"
# Extensao pgvector (RAG da Fase 5). Pacote do apt casa com a major do PG.
apt-get install -y "postgresql-${PG_VERSION}-pgvector" 2>/dev/null \
  || apt-get install -y postgresql-pgvector 2>/dev/null \
  || log "  [AVISO] pacote pgvector nao encontrado no apt — o RAG cai no fallback JSON ate instalar a extensao."
pg_lsclusters -h 2>/dev/null | grep -q "main" || pg_createcluster "${PG_VERSION}" main
pg_ctlcluster "${PG_VERSION}" main start 2>/dev/null || true
systemctl enable postgresql 2>/dev/null || true
RETRIES=0
until pg_isready -q 2>/dev/null || [ $RETRIES -ge 15 ]; do sleep 2; RETRIES=$((RETRIES+1)); log "  Aguardando PostgreSQL... ($RETRIES/15)"; done
pg_isready || log_err "PostgreSQL nao iniciou"
log_ok "PostgreSQL OK"

log_step "5" "Criando usuario, banco e extensao vector"
DB_EXISTS=$(su -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${PG_DB}'\"" postgres 2>/dev/null | tr -d ' ')
su -c "psql -c \"CREATE USER ${PG_USER} WITH PASSWORD '${PG_PASS}' CREATEDB;\"" postgres 2>/dev/null \
  || su -c "psql -c \"ALTER USER ${PG_USER} WITH PASSWORD '${PG_PASS}';\"" postgres
if [ "${KEEP_DB}" = "1" ] && [ "${DB_EXISTS}" = "1" ]; then
  log_ok "[--keep-db] Banco ${PG_DB} preservado"
else
  su -c "psql -c \"CREATE DATABASE ${PG_DB} OWNER ${PG_USER};\"" postgres 2>/dev/null || true
  su -c "psql -d ${PG_DB} -c \"GRANT ALL ON SCHEMA public TO ${PG_USER};\"" postgres
  log_ok "Banco ${PG_DB} pronto"
fi
# pgvector precisa da extensao criada no banco (superuser).
su -c "psql -d ${PG_DB} -c \"CREATE EXTENSION IF NOT EXISTS vector;\"" postgres 2>/dev/null \
  && log_ok "Extensao vector criada" \
  || log "  [AVISO] nao foi possivel criar a extensao vector — RAG usara fallback JSON."

# ---------- 6) REDIS ----------
log_step "6" "Instalando Redis (BullMQ)"
if [ "${KEEP_DEPS}" = "1" ] && command -v redis-server &>/dev/null; then
  log_ok "[--keep-deps] Redis presente"
else
  apt-get install -y redis-server
fi
systemctl enable redis-server 2>/dev/null || systemctl enable redis 2>/dev/null || true
systemctl restart redis-server 2>/dev/null || systemctl restart redis 2>/dev/null || true
log_ok "Redis ativo"

# ---------- 7) API: deps + prisma + build ----------
log_step "7" "Instalando dependencias da API + Prisma"
cd "${API_DIR}"
rm -rf node_modules package-lock.json
npm install --no-audit --no-fund
npx prisma generate
log_ok "Deps + Prisma client"

log_step "8" "Gerando .env da API"
# Detecta a porta REAL do cluster (Debian pode subir o PG em 5433 se a 5432 ja
# estiver ocupada por outro cluster). Nao assumir 5432 fixo.
PG_PORT=$(pg_lsclusters -h 2>/dev/null | awk -v v="${PG_VERSION}" '$1==v && $2=="main"{print $3}' | head -1)
[ -z "${PG_PORT}" ] && PG_PORT="5432"
log "  Porta do cluster PostgreSQL: ${PG_PORT}"
DATABASE_URL="postgresql://${PG_USER}:${PG_PASS}@localhost:${PG_PORT}/${PG_DB}"
if [ "${MODE}" = "single" ]; then
  CORS="https://${DOMAIN}"
  GOOGLE_REDIRECT="https://${DOMAIN}/api/integrations/oauth/google/callback"
else
  CORS="https://${DOMAIN_ADMIN},https://${DOMAIN_CONSOLE}"
  GOOGLE_REDIRECT="https://${DOMAIN_API}/api/integrations/oauth/google/callback"
fi
cat > "${API_DIR}/.env" <<ENVEOF
DATABASE_URL=${DATABASE_URL}
REDIS_URL=redis://localhost:6379
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
PORT=${PORT}
NODE_ENV=production
CORS_ORIGINS=${CORS}
# Worker separado (Fase 4): API nao processa fila inline em producao.
WORKER_INLINE=off
# Admin de plataforma (lido pelo seed no 1o boot, banco vazio).
PLATFORM_ADMIN_EMAIL=${ADMIN_EMAIL}
PLATFORM_ADMIN_PASSWORD=${ADMIN_PASSWORD}
# Organizacao Demo de avaliacao (0 = nao criar).
SEED_DEMO=${SEED_DEMO}
# Gmail OAuth (Fase 7) — preencher no Google Cloud Console.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT=${GOOGLE_REDIRECT}
# GitLab privado: credencial somente de leitura, usada pelo .npmrc do
# platform-admin durante `npm install @studio-ux-ds/*`. O upgrade.sh faz
# `source .env` antes do build, entao esta var fica visivel automaticamente.
GITLAB_PACKAGE_TOKEN=${GITLAB_PACKAGE_TOKEN}
ENVEOF
chmod 600 "${API_DIR}/.env"
log_ok ".env criado"

log_step "9" "Aplicando schema (prisma db push)"
if [ "${KEEP_DB}" = "1" ] && [ "${DB_EXISTS}" = "1" ]; then
  npx prisma db push --skip-generate --accept-data-loss
else
  npx prisma db push --skip-generate
fi
log_ok "Schema aplicado"

log_step "10" "Build da API (NestJS)"
npm run build
log_ok "Build OK (dist/main.js + dist/worker.js)"

# ---------- 11) FRONTS ----------
build_front() {
  local dir="$1"; local api_url="$2"; local base="${3:-/}"
  [ ! -f "${dir}/package.json" ] && { log "  [AVISO] front ausente: ${dir}"; return 0; }
  cd "${dir}"
  npm install --no-audit --no-fund
  VITE_API_URL="${api_url}" npm run build -- --base="${base}"
}
log_step "11" "Compilando painel do cliente (platform-admin)"
if [ "${MODE}" = "single" ]; then
  build_front "${ADMIN_DIR}" "/api/v1" "/"
else
  build_front "${ADMIN_DIR}" "https://${DOMAIN_API}/api/v1" "/"
fi
log_ok "platform-admin -> dist/"

# O Console pode ser servido em DOIS lugares ao mesmo tempo:
#   * sob /console/ do dominio principal (modo single) -> dist
#   * na RAIZ de um dominio dedicado, cadastrado em Enderecos -> dist-root
# Base do Vite e basename do router sao definidos em BUILD, entao um dist so nao
# serve os dois: por isso a 2a copia com base=/ (npm install roda uma vez).
build_console_all() { # $1=api_url  $2=base_principal
  build_front "${CONSOLE_DIR}" "$1" "$2"
  rm -rf "${CONSOLE_DIR}/dist-root"
  if [ "$2" = "/" ]; then
    cp -r "${CONSOLE_DIR}/dist" "${CONSOLE_DIR}/dist-root"
  else
    cd "${CONSOLE_DIR}"
    VITE_API_URL="$1" npm run build -- --base="/" --outDir=dist-root
  fi
}

log_step "11b" "Compilando Console (platform-console)"
if [ "${MODE}" = "single" ]; then
  # Console servido sob /console/ no mesmo dominio — base e router basename batem.
  build_console_all "/api/v1" "/console/"
else
  build_console_all "https://${DOMAIN_API}/api/v1" "/"
fi
log_ok "platform-console -> dist/"

# ---------- 12) PM2 (api + worker) ----------
log_step "12" "Registrando no PM2 (iastudio-api + iastudio-worker)"
cat > "${API_DIR}/ecosystem.config.js" <<ECOEOF
module.exports = {
  apps: [
    {
      name: 'iastudio-api',
      script: 'dist/main.js',
      cwd: '${API_DIR}',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production', WORKER_INLINE: 'off' },
    },
    {
      name: 'iastudio-worker',
      script: 'dist/worker.js',
      cwd: '${API_DIR}',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '1G',
      env: { NODE_ENV: 'production' },
    },
  ],
};
ECOEOF
pm2 delete iastudio-api iastudio-worker 2>/dev/null || true
pm2 start "${API_DIR}/ecosystem.config.js"
pm2 save --force
pm2 startup systemd -u root --hp /root 2>&1 || true
systemctl enable pm2-root 2>/dev/null || true
pm2 install pm2-logrotate 2>&1 || true
pm2 set pm2-logrotate:max_size 50M 2>/dev/null || true
pm2 set pm2-logrotate:retain 7 2>/dev/null || true
log_ok "PM2 iastudio-api + iastudio-worker"

# ---------- 13) SEED (verificado) ----------
log_step "13" "Verificando seed do admin (${ADMIN_EMAIL})"
# O seed roda no OnApplicationBootstrap da API (banco vazio). Aguarda a API subir
# e confirma que o admin de plataforma existe em core_users. Aborta se 0.
EE="${ADMIN_EMAIL//\'/\'\'}"
ADMIN_COUNT="0"; RETRIES=0
until [ "${ADMIN_COUNT}" = "1" ] || [ $RETRIES -ge 30 ]; do
  sleep 2; RETRIES=$((RETRIES+1))
  ADMIN_COUNT=$(psql "${DATABASE_URL}" -X -tA -c "SELECT count(*) FROM core_users WHERE email='${EE}' AND is_platform_admin=true;" 2>/dev/null || echo "0")
  ADMIN_COUNT=$(echo "${ADMIN_COUNT}" | tr -d '[:space:]')
  [ "${ADMIN_COUNT}" != "1" ] && log "  Aguardando seed... (${RETRIES}/30)"
done
[ "${ADMIN_COUNT}" != "1" ] && log_err "Seed do admin nao concluiu (0 linhas em core_users). Veja: pm2 logs iastudio-api"
log_ok "Admin ${ADMIN_EMAIL} verificado (${ADMIN_COUNT} linha)"

# ---------- 14) NGINX ----------
log_step "14" "Configurando Nginx"
if [ "${KEEP_DEPS}" = "1" ] && command -v nginx &>/dev/null; then
  log_ok "[--keep-deps] Nginx presente"
else
  apt-get install -y -o Dpkg::Options::="--force-confold" -o Dpkg::Options::="--force-confmiss" nginx
fi
# Servidor reusado pode estar com /etc/nginx/nginx.conf apagado (conffile removido
# por um purge anterior). Sem ele o nginx nao sobe — reinstala forcando restaurar
# os conffiles ausentes (--force-confmiss).
if [ ! -f /etc/nginx/nginx.conf ]; then
  log "  /etc/nginx/nginx.conf ausente — restaurando via reinstall do nginx-common"
  apt-get install --reinstall -y \
    -o Dpkg::Options::="--force-confmiss" -o Dpkg::Options::="--force-confold" \
    nginx-common nginx
fi
systemctl enable nginx --now 2>/dev/null || true
rm -f /etc/nginx/sites-enabled/default
mkdir -p /etc/nginx/snippets
cat > /etc/nginx/snippets/iastudio-security-headers.conf <<'SECEOF'
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
SECEOF

if [ "${MODE}" = "single" ]; then
  cat > /etc/nginx/sites-available/iastudio <<NGXEOF
upstream iastudio_api { server 127.0.0.1:${PORT}; }
server {
    listen 80; listen [::]:80;
    server_name ${DOMAIN};
    client_max_body_size 2048M;
    server_tokens off;
    include /etc/nginx/snippets/iastudio-security-headers.conf;
    access_log /var/log/nginx/iastudio-access.log;
    error_log  /var/log/nginx/iastudio-error.log;

    proxy_set_header Host              \$host;
    proxy_set_header X-Real-IP         \$remote_addr;
    proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 120s;

    # API (inclui /api/v1/* e rotas neutras como o callback OAuth /api/integrations/...)
    location /api/ { proxy_pass http://iastudio_api; }

    # Console SaaS sob /console/ (build com base=/console/)
    # /console (sem barra) NAO casa com "location /console/" -> cairia no
    # "location /" e serviria o painel do CLIENTE (login errado). Redirect exato:
    location = /console { return 301 /console/; }
    location /console/ {
        alias ${CONSOLE_DIR}/dist/;
        try_files \$uri \$uri/ /console/index.html;
    }

    # Painel do cliente na raiz
    location / {
        root ${ADMIN_DIR}/dist;
        try_files \$uri \$uri/ /index.html;
    }
}
NGXEOF
  ln -sf /etc/nginx/sites-available/iastudio /etc/nginx/sites-enabled/iastudio
else
  # PAINEL DO CLIENTE
  cat > /etc/nginx/sites-available/iastudio-admin <<NGXEOF
upstream iastudio_api { server 127.0.0.1:${PORT}; }
server {
    listen 80; listen [::]:80;
    server_name ${DOMAIN_ADMIN};
    client_max_body_size 2048M;
    server_tokens off;
    include /etc/nginx/snippets/iastudio-security-headers.conf;
    root ${ADMIN_DIR}/dist;

    proxy_set_header Host              \$host;
    proxy_set_header X-Real-IP         \$remote_addr;
    proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    location /api/ { proxy_pass http://iastudio_api; }
    location / { try_files \$uri \$uri/ /index.html; }
}
NGXEOF
  # CONSOLE
  cat > /etc/nginx/sites-available/iastudio-console <<NGXEOF
upstream iastudio_api_c { server 127.0.0.1:${PORT}; }
server {
    listen 80; listen [::]:80;
    server_name ${DOMAIN_CONSOLE};
    client_max_body_size 2048M;
    server_tokens off;
    include /etc/nginx/snippets/iastudio-security-headers.conf;
    root ${CONSOLE_DIR}/dist;

    proxy_set_header Host              \$host;
    proxy_set_header X-Real-IP         \$remote_addr;
    proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    location /api/ { proxy_pass http://iastudio_api_c; }
    location / { try_files \$uri \$uri/ /index.html; }
}
NGXEOF
  # API
  cat > /etc/nginx/sites-available/iastudio-api <<NGXEOF
upstream iastudio_api_up { server 127.0.0.1:${PORT}; }
server {
    listen 80; listen [::]:80;
    server_name ${DOMAIN_API};
    client_max_body_size 2048M;
    server_tokens off;
    include /etc/nginx/snippets/iastudio-security-headers.conf;

    proxy_set_header Host              \$host;
    proxy_set_header X-Real-IP         \$remote_addr;
    proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 120s;

    location / { proxy_pass http://iastudio_api_up; }
}
NGXEOF
  ln -sf /etc/nginx/sites-available/iastudio-admin   /etc/nginx/sites-enabled/iastudio-admin
  ln -sf /etc/nginx/sites-available/iastudio-console /etc/nginx/sites-enabled/iastudio-console
  ln -sf /etc/nginx/sites-available/iastudio-api     /etc/nginx/sites-enabled/iastudio-api
fi
nginx -t && systemctl reload nginx
log_ok "Nginx configurado (HTTP porta 80)"

# ---------- 14b) SSL ----------
if [ "${NO_SSL}" = "0" ]; then
  log_step "14b" "Emitindo certificado SSL (Let's Encrypt)"
  command -v certbot &>/dev/null || apt-get install -y certbot python3-certbot-nginx
  if [ "${MODE}" = "single" ]; then
    CERTBOT_DOMAINS="-d ${DOMAIN}"
  else
    CERTBOT_DOMAINS="-d ${DOMAIN_ADMIN} -d ${DOMAIN_CONSOLE} -d ${DOMAIN_API}"
  fi
  certbot --nginx ${CERTBOT_DOMAINS} --email "${CERT_EMAIL}" --agree-tos --non-interactive \
    --expand --redirect --keep-until-expiring \
    || log "  [AVISO] Certbot falhou — confira se os dominios apontam para este servidor. Site segue em HTTP."
  log_ok "SSL processado"
else
  log_ok "SSL desativado (--no-ssl) — servindo em HTTP"
fi

# ---------- 15) CREDENCIAIS ----------
log_step "15" "Salvando credenciais"
cat > /root/.iastudio-credentials <<CRED_EOF
# IA Studio - credenciais
MODE=${MODE}
DOMAIN=${DOMAIN}
DOMAIN_ADMIN=${DOMAIN_ADMIN}
DOMAIN_CONSOLE=${DOMAIN_CONSOLE}
DOMAIN_API=${DOMAIN_API}
DATABASE_URL=${DATABASE_URL}
PG_USER=${PG_USER}
PG_PASS=${PG_PASS}
PG_PORT=${PG_PORT}
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
ADMIN_EMAIL=${ADMIN_EMAIL}
INSTALL_DIR=${INSTALL_DIR}
CRED_EOF
chmod 600 /root/.iastudio-credentials
log_ok "/root/.iastudio-credentials (0600)"

log_step "16" "Verificacao final"
sleep 3; pm2 list
log ""
log "=== INSTALACAO CONCLUIDA $(date) ==="
if [ "${MODE}" = "single" ]; then
  log "  Painel do cliente: https://${DOMAIN}/"
  log "  Console (SaaS):    https://${DOMAIN}/console/"
  log "  API health:        https://${DOMAIN}/api/v1/health"
else
  log "  Painel do cliente: https://${DOMAIN_ADMIN}/"
  log "  Console (SaaS):    https://${DOMAIN_CONSOLE}/"
  log "  API:               https://${DOMAIN_API}/api/v1/"
fi
log "  Login admin (Console): ${ADMIN_EMAIL}"
log "  Credenciais: /root/.iastudio-credentials | Log: ${LOG}"
log "  Proximo: preencher GOOGLE_CLIENT_ID/SECRET no ${API_DIR}/.env (Gmail) e: pm2 restart iastudio-api"
