#!/usr/bin/env bash
# Instala uma única instância dedicada, sem Console SaaS e sem recursos globais.
set -euo pipefail
umask 077
[ "$(id -u)" -eq 0 ] || { echo 'ERRO: execute como root.' >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib/instance.sh"

INSTANCE_ID=''; DOMAIN=''; ADMIN_EMAIL=''; ADMIN_PASSWORD=''; ADMIN_NAME='Administrador da Instalação'
REDIS_DB=''; CERT_EMAIL=''; SOURCE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"; NO_SSL=0; INSTALL_DEPS=0
usage() {
  cat <<'EOF'
Uso:
  bash scripts/install-dedicated.sh --instance-id <cliente> --domain <app.exemplo.com> \
    --admin-email <email> --admin-password <senha> --redis-db <0-15> [--email <ssl>] \
    [--source-dir <repo>] [--no-ssl] [--install-deps]

Cada execução cria diretório, role/banco PostgreSQL, banco Redis, prefixo de
filas, storage, backup, PM2 e vhost exclusivos. Não há modo keep-db nem demo.
EOF
}
while (($#)); do
  case "$1" in
    --instance-id) INSTANCE_ID="${2:?valor ausente}"; shift 2 ;;
    --domain) DOMAIN="${2:?valor ausente}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:?valor ausente}"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="${2:?valor ausente}"; shift 2 ;;
    --admin-name) ADMIN_NAME="${2:?valor ausente}"; shift 2 ;;
    --redis-db) REDIS_DB="${2:?valor ausente}"; shift 2 ;;
    --email) CERT_EMAIL="${2:?valor ausente}"; shift 2 ;;
    --source-dir) SOURCE_DIR="${2:?valor ausente}"; shift 2 ;;
    --no-ssl) NO_SSL=1; shift ;;
    --install-deps) INSTALL_DEPS=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail_instance "argumento desconhecido: $1" ;;
  esac
done
[ -n "$INSTANCE_ID" ] && [ -n "$DOMAIN" ] && [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ] && [ -n "$REDIS_DB" ] || { usage >&2; exit 2; }
set_instance "$INSTANCE_ID"
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || fail_instance 'domínio inválido.'
[[ "$ADMIN_EMAIL" =~ ^[^@]+@[^@]+\.[^@]+$ ]] || fail_instance 'e-mail administrativo inválido.'
[[ ${#ADMIN_PASSWORD} -ge 8 ]] || fail_instance 'senha administrativa precisa ter ao menos 8 caracteres.'
[[ "$REDIS_DB" =~ ^([0-9]|1[0-5])$ ]] || fail_instance '--redis-db deve estar entre 0 e 15.'
[ -d "$SOURCE_DIR/platform-api" ] || fail_instance "fonte não contém platform-api: $SOURCE_DIR"
[ ! -e "$IASTUDIO_APP_DIR" ] || fail_instance "diretório da instância já existe: $IASTUDIO_APP_DIR"
[ ! -e "$IASTUDIO_CONFIG_FILE" ] || fail_instance "configuração da instância já existe: $IASTUDIO_CONFIG_FILE"

if [ "$INSTALL_DEPS" = 1 ]; then
  apt-get update -y
  apt-get install -y git rsync openssl postgresql-client redis-server nginx certbot python3-certbot-nginx
fi
command -v psql >/dev/null || fail_instance 'PostgreSQL client ausente; use --install-deps ou prepare o host.'
command -v redis-cli >/dev/null || fail_instance 'Redis client ausente; use --install-deps ou prepare o host.'
command -v node >/dev/null || fail_instance 'Node.js ausente; prepare o runtime no host.'
command -v pm2 >/dev/null || fail_instance 'PM2 ausente; prepare o runtime no host.'

# A alocação do banco Redis é explícita e é recusada se outra instância já usa
# o mesmo número. O prefixo também é exclusivo, protegendo chaves BullMQ.
if grep -Rqs "^REDIS_DB=$REDIS_DB$" "$INSTANCE_CONFIG_BASE" 2>/dev/null; then
  fail_instance "REDIS_DB=$REDIS_DB já pertence a outra instância."
fi

DB_PASS="$(openssl rand -hex 24)"
JWT_SECRET="$(openssl rand -hex 32)"
ENCRYPTION_KEY="$(openssl rand -hex 32)"
PORT="$((3000 + REDIS_DB))"
mkdir -p "$INSTANCE_CONFIG_BASE" "$IASTUDIO_DATA_DIR" "$IASTUDIO_STORAGE_DIR" "$IASTUDIO_BACKUP_DIR" "/var/log/iastudio/$INSTANCE_ID"
chmod 700 "$INSTANCE_CONFIG_BASE" "$IASTUDIO_DATA_DIR" "$IASTUDIO_STORAGE_DIR" "$IASTUDIO_BACKUP_DIR"

su -s /bin/sh postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE ROLE $IASTUDIO_DB_USER LOGIN PASSWORD '$DB_PASS';\"" \
  || fail_instance "não foi possível criar a role PostgreSQL $IASTUDIO_DB_USER."
su -s /bin/sh postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE DATABASE $IASTUDIO_DB_NAME OWNER $IASTUDIO_DB_USER;\"" \
  || fail_instance "não foi possível criar o banco PostgreSQL $IASTUDIO_DB_NAME."
su -s /bin/sh postgres -c "psql -d $IASTUDIO_DB_NAME -v ON_ERROR_STOP=1 -c 'CREATE EXTENSION IF NOT EXISTS vector;'"

cat > "$IASTUDIO_CONFIG_FILE" <<EOF
IASTUDIO_INSTANCE_ID=$IASTUDIO_INSTANCE_ID
IASTUDIO_APP_DIR=$IASTUDIO_APP_DIR
IASTUDIO_DATA_DIR=$IASTUDIO_DATA_DIR
IASTUDIO_STORAGE_DIR=$IASTUDIO_STORAGE_DIR
IASTUDIO_BACKUP_DIR=$IASTUDIO_BACKUP_DIR
IASTUDIO_SCRIPTS_DIR=$IASTUDIO_SCRIPTS_DIR
IASTUDIO_PM2_API=$IASTUDIO_PM2_API
IASTUDIO_PM2_WORKER=$IASTUDIO_PM2_WORKER
IASTUDIO_REDIS_PREFIX=$IASTUDIO_REDIS_PREFIX
REDIS_DB=$REDIS_DB
REDIS_URL=redis://127.0.0.1:6379/$REDIS_DB
DATABASE_URL=postgresql://$IASTUDIO_DB_USER:$DB_PASS@127.0.0.1:5432/$IASTUDIO_DB_NAME?schema=public
JWT_SECRET=$JWT_SECRET
ENCRYPTION_KEY=$ENCRYPTION_KEY
INSTALLATION_ADMIN_EMAIL=$ADMIN_EMAIL
INSTALLATION_ADMIN_PASSWORD=$ADMIN_PASSWORD
STORAGE_DRIVER=local
STORAGE_LOCAL_PATH=$IASTUDIO_STORAGE_DIR
PORT=$PORT
NODE_ENV=production
WORKER_INLINE=off
CORS_ORIGINS=https://$DOMAIN
EOF
chmod 600 "$IASTUDIO_CONFIG_FILE"

mkdir -p "$IASTUDIO_APP_DIR"
rsync -a --delete --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.env' "$SOURCE_DIR/" "$IASTUDIO_APP_DIR/"
cp "$IASTUDIO_CONFIG_FILE" "$IASTUDIO_APP_DIR/platform-api/.env"
chmod 600 "$IASTUDIO_APP_DIR/platform-api/.env"

bash "$IASTUDIO_APP_DIR/scripts/provision-dedicated-schema.sh" --instance-id "$IASTUDIO_INSTANCE_ID"
unset NPM_CONFIG_PRODUCTION
(cd "$IASTUDIO_APP_DIR/platform-api" && npm install && npm run build)
(cd "$IASTUDIO_APP_DIR/platform-admin" && npm install && npm run build)

IASTUDIO_INSTANCE_ID="$IASTUDIO_INSTANCE_ID" IASTUDIO_APP_DIR="$IASTUDIO_APP_DIR" IASTUDIO_LOG_DIR="/var/log/iastudio/$INSTANCE_ID" \
  pm2 start "$IASTUDIO_APP_DIR/scripts/ecosystem.config.js"
pm2 save

cat > "/etc/nginx/sites-available/$IASTUDIO_NGINX_SITE" <<EOF
server {
  listen 80;
  server_name $DOMAIN;
  root $IASTUDIO_APP_DIR/platform-admin/dist;
  location /api/ { proxy_pass http://127.0.0.1:$PORT; proxy_set_header Host \$host; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto \$scheme; }
  location / { try_files \$uri \$uri/ /index.html; }
}
EOF
ln -s "/etc/nginx/sites-available/$IASTUDIO_NGINX_SITE" "/etc/nginx/sites-enabled/$IASTUDIO_NGINX_SITE"
nginx -t && systemctl reload nginx
if [ "$NO_SSL" = 0 ]; then
  [ -n "$CERT_EMAIL" ] || fail_instance '--email é obrigatório sem --no-ssl.'
  certbot --nginx --non-interactive --agree-tos -m "$CERT_EMAIL" -d "$DOMAIN"
fi
echo "Instância dedicada '$IASTUDIO_INSTANCE_ID' instalada em $IASTUDIO_APP_DIR."
