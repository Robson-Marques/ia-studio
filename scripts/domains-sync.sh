#!/usr/bin/env bash
# ============================================================================
# IA Studio — sincronizacao de ENDERECOS (dominios/subdominios) com o servidor
# ----------------------------------------------------------------------------
# Le o registro `core_platform_domains` (Console > Enderecos) e materializa no
# servidor o que o app registrou: vhost do nginx + certificado Let's Encrypt.
#
# FRONTEIRA APP↔INFRA (regra da especialidade `ia-studio.tenant-domains`):
# o app e a fonte da verdade do REGISTRO; a mudanca de nginx/TLS acontece AQUI,
# como operacao — de proposito FORA do deploy por tag (o `upgrade.sh` nao toca
# no nginx). Rode manualmente ou por cron.
#
#   bash scripts/domains-sync.sh                  # varre tudo que esta pendente
#   bash scripts/domains-sync.sh --dry-run        # so mostra o que faria
#   bash scripts/domains-sync.sh --host meu.com   # so um endereco (usado pelo
#                                                 # botao "Verificar e ativar")
#
# Idempotente: rodar de novo nao duplica vhost nem re-emite certificado valido.
#
# POR QUE HTTP-01 POR HOST (e nao wildcard): certificado wildcard (*.base) exige
# desafio DNS-01, que exige credencial da API do provedor de DNS. Emitir por host
# com `certbot --nginx` (HTTP-01) nao exige nada alem do DNS ja apontado — e
# atende igual subdominio e dominio proprio do cliente. Se um dia houver plugin
# de DNS configurado, o wildcard vira otimizacao, nao pre-requisito.
# ============================================================================
set -uo pipefail

INSTALL_DIR="/opt/iastudio"
API_DIR="${INSTALL_DIR}/platform-api"
ADMIN_DIR="${INSTALL_DIR}/platform-admin"
CONSOLE_DIR="${INSTALL_DIR}/platform-console"
ENV_FILE="${API_DIR}/.env"
PORT="3000"
DRY_RUN=0
ONLY_HOST=""
ONLY_PENDING=0
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --pending) ONLY_PENDING=1 ;;
    --host)    ONLY_HOST="${2:-}"
               [ -z "$ONLY_HOST" ] && { echo "--host exige um valor"; exit 2; }
               shift ;;
    --host=*)  ONLY_HOST="${1#*=}" ;;
    *)         echo "Argumento desconhecido: $1"; exit 2 ;;
  esac
  shift
done
# So caracteres validos de hostname — o valor chega do banco/API e vai pra uma
# consulta SQL e pra linha de comando do certbot.
if [ -n "$ONLY_HOST" ] && ! echo "$ONLY_HOST" | grep -Eq '^[a-z0-9.-]+$'; then
  echo "Hostname invalido: $ONLY_HOST"; exit 2
fi

RED=$'\e[31m'; GREEN=$'\e[32m'; YELLOW=$'\e[33m'; NC=$'\e[0m'
log()    { echo "  $*"; }
log_ok() { echo "${GREEN}  OK${NC} $*"; }
log_wa() { echo "${YELLOW}  ..${NC} $*"; }
log_er() { echo "${RED}  ERRO${NC} $*"; }

[ "$(id -u)" = "0" ] || { log_er "Rode como root."; exit 1; }
[ -f "$ENV_FILE" ] || { log_er "Nao achei $ENV_FILE"; exit 1; }

DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//;s/^'\''//;s/'\''$//')
[ -z "$DATABASE_URL" ] && { log_er "DATABASE_URL ausente em $ENV_FILE"; exit 1; }

CERT_EMAIL="$(grep -E '^ADMIN_EMAIL=' /root/.iastudio-credentials 2>/dev/null | cut -d= -f2- || true)"
[ -z "$CERT_EMAIL" ] && CERT_EMAIL="admin@$(hostname -f 2>/dev/null || hostname)"

psql_q() { psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -c "$1" 2>/dev/null; }

# Marca o resultado de volta no registro (o Console mostra a situacao).
db_mark() { # $1=hostname $2=status $3=cert_status $4=erro
  # CORTAR ANTES de escapar: cortar depois pode partir um '' recem-duplicado ao
  # meio e deixar aspas impares — o UPDATE quebraria calado (o psql tem || true).
  local err; err=$(printf '%s' "${4:-}" | cut -c1-400 | sed "s/'/''/g")
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL || true
UPDATE core_platform_domains
   SET status      = '${2}',
       cert_status = '${3}',
       last_error  = $( [ -n "$err" ] && echo "'${err}'" || echo "NULL" ),
       verified_at = $( [ "${2}" = "ACTIVE" ] && echo "COALESCE(verified_at, NOW())" || echo "verified_at" ),
       cert_issued_at = $( [ "${3}" = "ISSUED" ] && echo "NOW()" || echo "cert_issued_at" ),
       updated_at  = NOW()
 WHERE hostname = '${1}';
SQL
}

# IPs deste servidor (v4 e v6) para conferir o apontamento antes de chamar o certbot.
server_ips() { hostname -I 2>/dev/null | tr ' ' '\n' | grep -v '^$'; }

dns_points_here() { # $1=hostname
  local resolved; resolved=$(getent ahosts "$1" 2>/dev/null | awk '{print $1}' | sort -u)
  [ -z "$resolved" ] && return 1
  local ip
  for ip in $(server_ips); do
    echo "$resolved" | grep -qx "$ip" && return 0
  done
  return 1
}

vhost_path() { echo "/etc/nginx/sites-available/iastudio-domain-$1"; }

write_vhost() { # $1=hostname $2=surface
  local host="$1" surface="$2" file; file="$(vhost_path "$host")"
  local root_dir="${ADMIN_DIR}/dist"
  [ "$surface" = "CONSOLE" ] && root_dir="${CONSOLE_DIR}/dist"

  # CREATE-IF-MISSING (nao sobrescrever): depois da 1a emissao, quem passa a ser
  # dono deste arquivo e o certbot — e dele o bloco 443/TLS. Reescrever do
  # template a cada rodada apagaria o TLS e deixaria o endereco em HTTP puro ate
  # o certbot reinjetar (e SEM TLS se aquela rodada falhasse).
  if [ -f "$file" ]; then
    ln -sf "$file" "/etc/nginx/sites-enabled/iastudio-domain-${host}"
    return 0
  fi

  # API pura: so proxy. ADMIN/CONSOLE: estatico + /api/ no proxy.
  if [ "$surface" = "API" ]; then
    cat > "$file" <<NGX
server {
    listen 80; listen [::]:80;
    server_name ${host};
    client_max_body_size 2048M;
    server_tokens off;
    include /etc/nginx/snippets/iastudio-security-headers.conf;
    proxy_set_header Host              \$host;
    proxy_set_header X-Real-IP         \$remote_addr;
    proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 120s;
    location / { proxy_pass http://127.0.0.1:${PORT}; }
}
NGX
  else
    cat > "$file" <<NGX
server {
    listen 80; listen [::]:80;
    server_name ${host};
    client_max_body_size 2048M;
    server_tokens off;
    include /etc/nginx/snippets/iastudio-security-headers.conf;
    proxy_set_header Host              \$host;
    proxy_set_header X-Real-IP         \$remote_addr;
    proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_read_timeout 120s;

    location /api/ { proxy_pass http://127.0.0.1:${PORT}; }

    location / {
        root ${root_dir};
        try_files \$uri \$uri/ /index.html;
    }
}
NGX
  fi
  ln -sf "$file" "/etc/nginx/sites-enabled/iastudio-domain-${host}"
}

echo "== IA Studio — sincronizacao de enderecos =="
[ "$DRY_RUN" = "1" ] && log_wa "modo --dry-run (nada sera alterado)"

# Enderecos que o operador quer no ar. DISABLED fica de fora de proposito.
# Falha de banco NAO pode se disfarcar de "nada a fazer" (erro silencioso num
# cron nunca alerta): consulta sem engolir stderr e separa "falhou" de "vazio".
FILTER="status <> 'DISABLED'"
# --pending: usado pela reverificacao automatica. Varrer TUDO periodicamente
# faria o certbot ser chamado de novo em quem ja esta no ar (risco de rate limit).
[ "$ONLY_PENDING" = "1" ] && FILTER="status IN ('PENDING_DNS','VERIFYING','FAILED')"
[ -n "$ONLY_HOST" ] && FILTER="hostname = '${ONLY_HOST}'"
ROWS=$(psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 \
  -c "SELECT hostname || '|' || surface || '|' || status FROM core_platform_domains WHERE ${FILTER} ORDER BY hostname;") || {
  log_er "Falha ao consultar o banco (conexao ou tabela ausente)."; exit 1; }
if [ -z "$ROWS" ]; then
  [ -n "$ONLY_HOST" ] && { log_er "Endereco nao encontrado no registro: ${ONLY_HOST}"; exit 1; }
  log_ok "Nenhum endereco cadastrado — nada a fazer."; exit 0
fi

CHANGED=0
while IFS='|' read -r HOST SURFACE STATUS; do
  [ -z "$HOST" ] && continue
  echo ""
  log "-> ${HOST} (${SURFACE})"

  if ! dns_points_here "$HOST"; then
    # NUNCA rebaixar quem ja esta ACTIVE: o teste compara com `hostname -I` e da
    # falso-negativo atras de NAT/proxy/CDN ou com IPv6 fora da lista. Derrubar um
    # endereco no ar por causa disso seria um estrago causado pela propria rotina.
    if [ "$STATUS" = "ACTIVE" ]; then
      log_wa "DNS nao confere pelo teste local, mas o endereco esta ATIVO — mantido como esta."
      continue
    fi
    log_wa "DNS ainda nao aponta para este servidor — pulando (segue aguardando)."
    [ "$DRY_RUN" = "0" ] && db_mark "$HOST" "PENDING_DNS" "NONE" "DNS nao aponta para este servidor."
    continue
  fi
  log_ok "DNS aponta para ca"

  if [ "$DRY_RUN" = "1" ]; then
    log_wa "criaria/atualizaria o vhost e emitiria o certificado"
    continue
  fi

  write_vhost "$HOST" "$SURFACE"
  if ! nginx -t </dev/null >/tmp/iastudio_nginx.err 2>&1; then
    log_er "nginx -t falhou: $(tail -c 300 /tmp/iastudio_nginx.err)"
    rm -f "/etc/nginx/sites-enabled/iastudio-domain-${HOST}"
    db_mark "$HOST" "FAILED" "ERROR" "nginx -t falhou ao aplicar o vhost."
    continue
  fi
  systemctl reload nginx </dev/null 2>/dev/null || service nginx reload </dev/null 2>/dev/null
  log_ok "vhost aplicado"

  # Certificado: idempotente (--keep-until-expiring nao re-emite valido).
  # `</dev/null` OBRIGATORIO: o corpo do loop herda o stdin da herestring — um
  # processo externo que leia stdin comeria linhas de $ROWS e pularia enderecos
  # de forma intermitente.
  if certbot --nginx -d "$HOST" --email "$CERT_EMAIL" --agree-tos --non-interactive \
       --keep-until-expiring --redirect </dev/null >/tmp/iastudio_certbot.err 2>&1; then
    log_ok "certificado ok"
    db_mark "$HOST" "ACTIVE" "ISSUED" ""
    CHANGED=1
  else
    log_er "certbot falhou: $(tail -c 300 /tmp/iastudio_certbot.err)"
    # O vhost em HTTP fica de pe; o endereco atende sem TLS ate resolver.
    db_mark "$HOST" "FAILED" "ERROR" "certbot: $(tail -c 200 /tmp/iastudio_certbot.err)"
  fi
done <<< "$ROWS"

echo ""
[ "$CHANGED" = "1" ] && { systemctl reload nginx </dev/null 2>/dev/null || true; }
log_ok "Sincronizacao concluida."
