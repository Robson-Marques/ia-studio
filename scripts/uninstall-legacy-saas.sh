#!/usr/bin/env bash
# Remove somente a instalação SaaS histórica do IA Studio.
# Nunca remove pacotes, PostgreSQL, Redis, PM2, Nginx ou certificados do host:
# estes serviços podem atender outras aplicações em /opt.
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo 'ERRO: execute como root.' >&2; exit 2; }

MODE='dry-run'
CONFIRM=''
usage() {
  cat <<'EOF'
Uso:
  bash scripts/uninstall-legacy-saas.sh --dry-run
  bash scripts/uninstall-legacy-saas.sh --remove --confirm LEGACY-IASTUDIO

Remove exclusivamente os recursos conhecidos da instalação SaaS anterior:
  /opt/iastudio, /opt/iastudio-backups, banco/role iastudio_db/iastudio,
  processos PM2 iastudio-api/iastudio-worker e vhosts Nginx iastudio*.

Não remove Node, PostgreSQL, Redis, PM2, Nginx, Certbot, certificados ou
qualquer diretório fora dos dois caminhos explícitos acima.
EOF
}

while (($#)); do
  case "$1" in
    --dry-run) MODE='dry-run'; shift ;;
    --remove) MODE='remove'; shift ;;
    --confirm) CONFIRM="${2:?valor ausente}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERRO: argumento desconhecido: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ "$MODE" = 'remove' ] && [ "$CONFIRM" != 'LEGACY-IASTUDIO' ]; then
  echo 'ERRO: para remover, informe --confirm LEGACY-IASTUDIO.' >&2
  exit 2
fi

legacy_paths=(/opt/iastudio /opt/iastudio-backups)
nginx_paths=()
for path in /etc/nginx/sites-available/iastudio* /etc/nginx/sites-enabled/iastudio*; do
  [ -e "$path" ] || [ -L "$path" ] || continue
  nginx_paths+=("$path")
done

echo 'Prévia da remoção exclusiva do IA Studio SaaS:'
for path in "${legacy_paths[@]}"; do
  if [ -e "$path" ]; then echo "  diretório: $path"; else echo "  diretório ausente: $path"; fi
done
for path in "${nginx_paths[@]}"; do echo "  vhost: $path"; done
command -v pm2 >/dev/null && echo '  PM2: iastudio-api, iastudio-worker' || echo '  PM2: indisponível (nenhum processo será removido)'
command -v psql >/dev/null && echo '  PostgreSQL: role iastudio, banco iastudio_db' || echo '  PostgreSQL: indisponível (nenhum banco será removido)'
echo '  Redis: preservado; nenhuma chave será apagada.'
echo '  Dependências e demais aplicações: preservadas.'

[ "$MODE" = 'remove' ] || { echo 'Dry-run concluído; nada foi alterado.'; exit 0; }

command -v psql >/dev/null || { echo 'ERRO: psql é obrigatório para confirmar a limpeza do banco legado.' >&2; exit 1; }
id postgres >/dev/null 2>&1 || { echo 'ERRO: usuário postgres ausente; remoção recusada.' >&2; exit 1; }

# A role antiga não pode ser apagada se ainda possuir qualquer outro banco.
# Isso torna explícito um acoplamento inesperado antes de qualquer alteração.
foreign_databases="$(su -s /bin/sh postgres -c "psql -At -d postgres -c \"SELECT d.datname FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba WHERE r.rolname='iastudio' AND d.datname <> 'iastudio_db';\"")"
if [ -n "$foreign_databases" ]; then
  echo 'ERRO: a role iastudio possui bancos fora do legado; remoção recusada:' >&2
  printf '%s\n' "$foreign_databases" >&2
  exit 1
fi

if command -v pm2 >/dev/null; then
  pm2 delete iastudio-api iastudio-worker 2>/dev/null || true
  pm2 save --force 2>/dev/null || true
fi

su -s /bin/sh postgres -c "psql -v ON_ERROR_STOP=1 -c 'DROP DATABASE IF EXISTS iastudio_db WITH (FORCE);'" || exit 1
su -s /bin/sh postgres -c "psql -v ON_ERROR_STOP=1 -c 'DROP ROLE IF EXISTS iastudio;'" || exit 1

for path in "${nginx_paths[@]}"; do rm -f -- "$path"; done
if [ "${#nginx_paths[@]}" -gt 0 ] && command -v nginx >/dev/null; then
  nginx -t && systemctl reload nginx
fi

for path in "${legacy_paths[@]}"; do
  [ "$path" = /opt/iastudio ] || [ "$path" = /opt/iastudio-backups ] || exit 70
  [ -e "$path" ] && rm -rf -- "$path"
done

echo 'Instalação SaaS histórica removida. Serviços compartilhados foram preservados.'
