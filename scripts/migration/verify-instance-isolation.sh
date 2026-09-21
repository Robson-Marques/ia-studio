#!/usr/bin/env bash
# Gate S4 estático — valida o contrato de recursos por instância sem tocar no host.
set -euo pipefail
command -v rg >/dev/null 2>&1 || { echo 'ERRO: ripgrep (rg) é obrigatório para este gate.' >&2; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
FAILURES=0
fail() { printf 'FALHA: %s\n' "$*" >&2; FAILURES=1; }
require_file() { [ -f "$1" ] || fail "arquivo obrigatório ausente: $1"; }

for file in scripts/lib/instance.sh scripts/install-dedicated.sh scripts/provision-dedicated-schema.sh scripts/uninstall-dedicated.sh scripts/ecosystem.config.js; do
  require_file "$file"
done

for script in scripts/install-dedicated.sh scripts/provision-dedicated-schema.sh scripts/upgrade.sh scripts/backup-full.sh scripts/restore-full.sh scripts/restore-backup.sh scripts/uninstall-dedicated.sh; do
  rg -Fq 'acquire_instance_lock' "$script" || fail "$script não usa lock da instância."
done
rg -Fq 'pg_advisory_xact_lock' scripts/provision-dedicated-schema.sh \
  || fail 'provisionamento do schema não possui advisory lock transacional.'
rg -Fq -- '--from-empty' scripts/provision-dedicated-schema.sh \
  || fail 'schema inicial não é gerado a partir de banco vazio.'
rg -Fq 'PSQL_DATABASE_URL="${DATABASE_URL%%\?*}"' scripts/provision-dedicated-schema.sh \
  || fail 'provisionamento não remove parâmetros específicos do Prisma antes de chamar psql.'
# O `public` pertence ao Prisma (db push do upgrade). O bookkeeping do
# provisionamento precisa ficar num schema próprio, senão o db push exige
# --accept-data-loss para dropá-lo e a 1a atualização quebra.
rg -Fq 'CREATE SCHEMA IF NOT EXISTS iastudio_meta' scripts/provision-dedicated-schema.sh \
  || fail 'provisionamento deixa bookkeeping no schema public (quebra o db push do upgrade).'
if rg -n 'CREATE TABLE IF NOT EXISTS system_schema_migrations' scripts/provision-dedicated-schema.sh; then
  fail 'tabela de bookkeeping ainda é criada sem schema próprio (public).'
fi
# A DATABASE_URL dedicada carrega `?schema=public` (exigido pelo Prisma). psql/
# pg_dump não entendem esse parâmetro do ORM: todo script operacional que fala
# com o PostgreSQL precisa normalizar a URL por `db_url_for_psql`, nunca passar
# $DATABASE_URL cru (fonte única em lib/instance.sh).
rg -Fq 'db_url_for_psql()' scripts/lib/instance.sh \
  || fail 'lib/instance.sh não define db_url_for_psql (normalizador único da URL para psql).'
for db_script in scripts/upgrade.sh scripts/backup-full.sh scripts/restore-full.sh scripts/restore-backup.sh; do
  rg -Fq 'db_url_for_psql' "$db_script" \
    || fail "$db_script não normaliza a DATABASE_URL antes de psql/pg_dump."
  if rg -nF -e 'psql "$DATABASE_URL"' -e 'pg_dump "$DATABASE_URL"' -e 'pg_restore "$DATABASE_URL"' "$db_script"; then
    fail "$db_script ainda passa DATABASE_URL crua (com ?schema=) para ferramentas libpq."
  fi
done
if rg -n -- '--accept-data-loss' scripts/install-dedicated.sh scripts/provision-dedicated-schema.sh scripts/upgrade.sh; then
  fail 'instalação ou atualização dedicada não pode aceitar perda de dados automaticamente.'
fi
if rg -n -- 'prisma db push' scripts/install-dedicated.sh scripts/provision-dedicated-schema.sh; then
  fail 'provisionamento dedicado deve usar migrations a partir de banco vazio, não db push.'
fi
rg -Fq -- '--bootstrap-dedicated' scripts/upgrade.sh \
  || fail 'upgrade não oferece bootstrap explícito da primeira instância dedicada.'
rg -Fq 'install-dedicated.sh' scripts/upgrade.sh \
  || fail 'bootstrap não delega ao instalador dedicado.'
rg -Fq -- '--source-revision "$TO_VERSION"' scripts/upgrade.sh \
  || fail 'bootstrap não fixa explicitamente a revisão de origem.'
rg -Fq 'git clone --no-checkout' scripts/install-dedicated.sh \
  || fail 'instalação não cria um checkout próprio para futuras atualizações.'
rg -Fq 'remote set-url origin' scripts/install-dedicated.sh \
  || fail 'checkout da instância não preserva a origem das atualizações.'
rg -Fq 'REDIS_KEY_COUNT' scripts/install-dedicated.sh \
  || fail 'instalação não recusa banco Redis já ocupado por outro serviço.'
rg -Fq 'porta $PORT já está em uso' scripts/install-dedicated.sh \
  || fail 'instalação não valida colisão de porta entre aplicações.'
rg -Fq 'domínio $DOMAIN já aparece em configuração Nginx' scripts/install-dedicated.sh \
  || fail 'instalação não valida colisão de domínio no Nginx.'
rg -Fq "SHOW port;" scripts/install-dedicated.sh \
  || fail 'instalação não descobre a porta real do cluster PostgreSQL.'
rg -Fq 'pg_isready -q -h "$candidate" -p "$PG_PORT"' scripts/install-dedicated.sh \
  || fail 'instalação não valida conexão TCP com o PostgreSQL antes de criar recursos.'
rg -Fq '@$PG_HOST:$PG_PORT/$IASTUDIO_DB_NAME?schema=public' scripts/install-dedicated.sh \
  || fail 'DATABASE_URL dedicado ainda fixa host ou porta PostgreSQL.'
# O platform-admin builda com pacotes do registry privado @studio-ux-ds; o
# instalador precisa exigir o token, exportá-lo para o npm e gravá-lo no .env
# (senão o build do admin falha com 401 e o próximo upgrade também).
rg -Fq -- '--gitlab-token' scripts/install-dedicated.sh \
  || fail 'instalação não aceita o token do registry privado @studio-ux-ds.'
rg -Fq 'export GITLAB_PACKAGE_TOKEN=' scripts/install-dedicated.sh \
  || fail 'instalação não exporta GITLAB_PACKAGE_TOKEN para os npm install.'
rg -Fq 'GITLAB_PACKAGE_TOKEN=$(env_value "$GITLAB_TOKEN")' scripts/install-dedicated.sh \
  || fail 'instalação não persiste GITLAB_PACKAGE_TOKEN no .env da instância.'
rg -Fq -- '--gitlab-token)' scripts/upgrade.sh \
  || fail 'bootstrap do upgrade não repassa --gitlab-token ao instalador.'
# umask 077 deixa o dist só-root e o nginx (www-data) responde 500. A instalação
# precisa abrir travessia/leitura no web root do platform-admin sem hardcode.
rg -Fq 'chmod -R a+rX "$IASTUDIO_APP_DIR/platform-admin/dist"' scripts/install-dedicated.sh \
  || fail 'instalação não torna o dist do platform-admin legível para o nginx.'
if ! rg -Fq 'if [ "$BOOTSTRAP_DEDICATED" -eq 1 ]; then' scripts/upgrade.sh; then
  fail 'bootstrap não possui caminho exclusivo antes do upgrade de instância.'
fi
if rg -n '/opt/iastudio\b|iastudio_db\b|iastudio-api\b|iastudio-worker\b|platform-console|/console/' \
  scripts/install-dedicated.sh scripts/provision-dedicated-schema.sh scripts/uninstall-dedicated.sh scripts/backup-full.sh scripts/restore-full.sh scripts/restore-backup.sh scripts/upgrade.sh; then
  fail 'script operacional conserva recurso global ou Console SaaS.'
fi

derive() {
  local id="$1"
  # shellcheck disable=SC1091
  . "$ROOT/scripts/lib/instance.sh"
  set_instance "$id"
  printf '%s|%s|%s|%s|%s|%s\n' "$IASTUDIO_APP_DIR" "$IASTUDIO_DB_NAME" "$IASTUDIO_PM2_API" "$IASTUDIO_PM2_WORKER" "$IASTUDIO_REDIS_PREFIX" "$IASTUDIO_NGINX_SITE"
}
a="$(derive isp-a)"
b="$(derive loja-b)"
[ "$a" != "$b" ] || fail 'ids distintos resolveram os mesmos recursos.'
case "$a" in *'isp-a'* ) ;; *) fail 'recursos de isp-a não preservam o identificador.' ;; esac
case "$b" in *'loja-b'* ) ;; *) fail 'recursos de loja-b não preservam o identificador.' ;; esac

if [ "$FAILURES" -ne 0 ]; then
  exit 1
fi
printf '%s\n' 'S4 isolamento: aprovado estaticamente — recursos e locks são derivados por instância; validação em host com duas instâncias ainda é obrigatória.'
