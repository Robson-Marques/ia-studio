#!/usr/bin/env bash
# Gate S4 estático — valida que vertentes independentes usam recursos próprios
# no host, sem tocar no host.
set -euo pipefail
command -v rg >/dev/null 2>&1 || { echo 'ERRO: ripgrep (rg) é obrigatório para este gate.' >&2; exit 2; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
FAILURES=0
fail() { printf 'FALHA: %s\n' "$*" >&2; FAILURES=1; }
require_file() { [ -f "$1" ] || fail "arquivo obrigatório ausente: $1"; }

for file in scripts/lib/instance.sh scripts/install-dedicated.sh scripts/provision-dedicated-schema.sh scripts/uninstall-dedicated.sh scripts/uninstall-discarded-dev-apps.sh scripts/ecosystem.config.js; do
  require_file "$file"
done

# Scripts rastreados pelo Git podem chegar ao host sem bit executável. Os
# wrappers públicos devem invocar o interpretador explicitamente, para que
# install/uninstall não dependam de chmod.
rg -Fq 'exec bash "${SCRIPT_DIR}/install-dedicated.sh" "$@"' scripts/install.sh \
  || fail 'wrapper install.sh não invoca o instalador dedicado via bash.'
rg -Fq 'exec bash "$SCRIPT_DIR/uninstall-dedicated.sh" "$@"' scripts/uninstall.sh \
  || fail 'wrapper uninstall.sh não invoca o desinstalador dedicado via bash.'

for script in scripts/install-dedicated.sh scripts/provision-dedicated-schema.sh scripts/upgrade.sh scripts/backup-full.sh scripts/restore-full.sh scripts/restore-backup.sh scripts/uninstall-dedicated.sh; do
  rg -Fq 'acquire_application_lock' "$script" || fail "$script não usa lock da aplicação."
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
rg -Fq 'git clone --no-checkout' scripts/install-dedicated.sh \
  || fail 'instalação não cria um checkout próprio da vertente para futuras atualizações.'
rg -Fq 'remote set-url origin' scripts/install-dedicated.sh \
  || fail 'checkout da aplicação não preserva a origem das atualizações.'
rg -Fq -- '--app-id' scripts/install-dedicated.sh \
  || fail 'instalação não exige o identificador explícito da aplicação.'
rg -Fq 'IASTUDIO_APPLICATION_ROOT_BASE:-/opt' scripts/lib/instance.sh \
  || fail 'a raiz padrão da aplicação não é /opt.'
rg -Fq 'LEGACY_IDS=(ia-dev ia-teste)' scripts/uninstall-discarded-dev-apps.sh \
  || fail 'removedor transitório não está limitado aos dois ambientes descartáveis autorizados.'
rg -Fq 'RESET-IASTUDIO-DEV' scripts/uninstall-discarded-dev-apps.sh \
  || fail 'removedor transitório não exige confirmação exclusiva de reinício do desenvolvimento.'
if rg -n '/opt/iastudio/instances|--instance-id|IASTUDIO_INSTANCE_ID|set_instance|acquire_instance_lock' \
  scripts/lib/instance.sh scripts/install-dedicated.sh scripts/provision-dedicated-schema.sh scripts/uninstall-dedicated.sh scripts/backup-full.sh scripts/restore-full.sh scripts/restore-backup.sh scripts/upgrade.sh; then
  fail 'scripts operacionais ainda descrevem ou aceitam o modelo de instâncias irmãs.'
fi
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
  || fail 'instalação não persiste GITLAB_PACKAGE_TOKEN no .env da aplicação.'
# O instalador pode ser chamado a partir de uma aplicação já em produção. Nesse
# caso NODE_ENV=production vem do .env e não pode fazer o npm omitir as
# ferramentas de build antes do PM2 voltar a carregar production.
rg -Fq 'export NODE_ENV=development' scripts/install-dedicated.sh \
  || fail 'instalação não força NODE_ENV=development durante npm/build.'
# O SQL é criado por heredoc expansível para interpolar o schema. Crases nesse
# conteúdo virariam substituição de comando do shell (ex.: tentaria executar
# public), portanto o provisionador não pode usá-las em comentários ou SQL.
if rg -n -F '`' scripts/provision-dedicated-schema.sh; then
  fail 'provisionador ainda contém crases perigosas em heredoc expansível.'
fi
# umask 077 deixa o dist só-root e o nginx (www-data) responde 500. A instalação
# precisa abrir travessia/leitura no web root do platform-admin sem hardcode.
rg -Fq 'chmod -R a+rX "$IASTUDIO_APP_DIR/platform-admin/dist"' scripts/install-dedicated.sh \
  || fail 'instalação não torna o dist do platform-admin legível para o nginx.'
# O backup não pode depender de callback do processo PM2 para fechar a row:
# precisa de unidade systemd própria, operation-id e trap que sempre escreve um
# estado terminal diretamente na base da mesma aplicação.
rg -Fq -- '--operation-id' scripts/backup-full.sh \
  || fail 'backup dedicado não aceita o id da operação para auto-reportar estado.'
rg -Fq 'trap finalize EXIT' scripts/backup-full.sh \
  || fail 'backup dedicado não possui proteção de estado terminal no EXIT.'
if rg -n 'system_restores.*::uuid|::uuid.*system_restores' scripts/backup-full.sh platform-api/src/modules/system; then
  fail 'operação administrativa faz cast uuid em id text de system_restores e pode ficar RUNNING.'
fi
rg -Fq 'não foi possível persistir o estado do backup' scripts/backup-full.sh \
  || fail 'falha ao persistir estado do backup ainda pode ser silenciosa.'
rg -Fq 'pg_dump --no-owner --no-privileges --clean --if-exists' scripts/backup-full.sh \
  || fail 'backup completo não gera dump restaurável in-place com --clean --if-exists.'
if rg -n 'DROP SCHEMA public' scripts/restore-full.sh scripts/restore-backup.sh; then
  fail 'restauração derruba public antes de carregar o dump e pode deixar a aplicação sem banco.'
fi
rg -Fq 'su -s /bin/sh postgres' scripts/restore-full.sh \
  || fail 'restore completo não cria pgvector com o administrador do cluster.'
rg -Fq 'strip_vector_ddl' scripts/restore-full.sh \
  || fail 'restore completo pode reaplicar DDL de pgvector com o role da aplicação.'
rg -Fq 'DROP SCHEMA IF EXISTS iastudio_meta CASCADE' scripts/restore-full.sh \
  || fail 'restore não prepara o bookkeeping iastudio_meta para backups legados sem --clean.'
rg -Fq 'PREVIOUS_DATABASE_READY' scripts/restore-full.sh \
  || fail 'restore pode reiniciar serviço após rollback para banco que já estava indisponível.'
rg -Fq 'close_snapshot_operations' scripts/restore-full.sh \
  || fail 'restore pode ressuscitar operações RUNNING que foram capturadas dentro do próprio backup.'
rg -Fq 'pre-restore-system-restores.sql' scripts/restore-full.sh \
  || fail 'restore não preserva o diário operacional local antes de aplicar o snapshot de dados.'
rg -Fq 'TRUNCATE TABLE system_restores' scripts/restore-full.sh \
  || fail 'restore pode deixar o histórico administrativo do pacote sobrescrever o da instalação local.'
rg -Fq 'SAFETY: aplicação permanece parada' scripts/restore-full.sh \
  || fail 'restore completo ainda pode iniciar API contra banco não recuperável.'
rg -Fq "'systemd-run'" platform-api/src/modules/system/backup.service.ts \
  || fail 'backup do painel não roda fora da árvore do PM2 via systemd-run.'
rg -Fq "'--operation-id'" platform-api/src/modules/system/backup.service.ts \
  || fail 'backup do painel não envia id de operação ao script local.'
if rg -n '/opt/iastudio\b|iastudio_db\b|iastudio-api\b|iastudio-worker\b|platform-console|/console/' \
  scripts/install-dedicated.sh scripts/provision-dedicated-schema.sh scripts/uninstall-dedicated.sh scripts/backup-full.sh scripts/restore-full.sh scripts/restore-backup.sh scripts/upgrade.sh; then
  fail 'script operacional conserva recurso global ou Console SaaS.'
fi

derive() {
  local app_id="$1"
  # shellcheck disable=SC1091
  . "$ROOT/scripts/lib/instance.sh"
  set_application "$app_id"
  printf '%s|%s|%s|%s|%s|%s\n' "$IASTUDIO_APP_DIR" "$IASTUDIO_DB_NAME" "$IASTUDIO_PM2_API" "$IASTUDIO_PM2_WORKER" "$IASTUDIO_REDIS_PREFIX" "$IASTUDIO_NGINX_SITE"
}
a="$(derive newnet-isp)"
b="$(derive loja-assistente)"
[ "$a" != "$b" ] || fail 'vertentes distintas resolveram os mesmos recursos.'
case "$a" in *'/opt/newnet-isp'* ) ;; *) fail 'a vertente Newnet não resolve diretório próprio em /opt.' ;; esac
case "$b" in *'/opt/loja-assistente'* ) ;; *) fail 'a vertente Loja não resolve diretório próprio em /opt.' ;; esac

if [ "$FAILURES" -ne 0 ]; then
  exit 1
fi
printf '%s\n' 'S4 coabitação: aprovado estaticamente — recursos e locks são derivados por aplicação; validação em host com aplicações independentes ainda é obrigatória.'
