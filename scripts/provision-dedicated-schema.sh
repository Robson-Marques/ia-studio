#!/usr/bin/env bash
# Materializa o schema somente em PostgreSQL vazio de uma instância dedicada.
# Não aceita banco SaaS, não reutiliza dump SQL e usa advisory lock transacional
# para que dois provisionamentos da mesma instância não concorram.
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
. "$SCRIPT_DIR/lib/instance.sh"

INSTANCE_ID=''
while (($#)); do
  case "$1" in
    --instance-id) INSTANCE_ID="${2:?valor ausente}"; shift 2 ;;
    -h|--help) instance_usage; exit 0 ;;
    *) fail_instance "argumento desconhecido: $1" ;;
  esac
done
[ -n "$INSTANCE_ID" ] || { instance_usage >&2; exit 2; }
set_instance "$INSTANCE_ID"
load_instance_config "$INSTANCE_ID"
acquire_instance_lock

API_DIR="$IASTUDIO_APP_DIR/platform-api"
[ -f "$API_DIR/prisma/schema.prisma" ] || fail_instance "schema não encontrado em $API_DIR"
[ -n "${DATABASE_URL:-}" ] || fail_instance 'DATABASE_URL ausente na configuração da instância.'
# DATABASE_URL é consumida pela aplicação/Prisma e contém `?schema=public`.
# libpq/psql não conhece esse parâmetro Prisma; para executar o SQL inicial,
# usamos a mesma URL sem a query string específica do ORM.
PSQL_DATABASE_URL="${DATABASE_URL%%\?*}"
[ -n "$PSQL_DATABASE_URL" ] || fail_instance 'DATABASE_URL inválida para provisionamento PostgreSQL.'

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
sql="$work/schema.sql"
cd "$API_DIR"
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > "$sql"
[ -s "$sql" ] || fail_instance 'a geração da migration do schema vazio não produziu SQL.'

fingerprint="$(sha256sum "$sql" | cut -d' ' -f1)"
transaction="$work/transaction.sql"
cat > "$transaction" <<EOF
BEGIN;
SELECT pg_advisory_xact_lock(hashtext('iastudio:dedicated-schema:${IASTUDIO_INSTANCE_ID}'));
DO \$\$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public') THEN
    RAISE EXCEPTION 'o banco dedicado precisa estar vazio';
  END IF;
END
\$\$;
-- Bookkeeping do provisionamento fica FORA do schema `public` (gerido pelo
-- Prisma). Em public, a atualização que sincroniza o schema com o Prisma veria
-- essa tabela como estranha e exigiria confirmar perda de dados para removê-la —
-- quebrava a 1a atualização de toda instância dedicada. Um schema próprio não é
-- tocado por essa sincronização.
CREATE SCHEMA IF NOT EXISTS iastudio_meta;
CREATE TABLE IF NOT EXISTS iastudio_meta.system_schema_migrations (
  id text PRIMARY KEY,
  checksum_sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now()
);
$(cat "$sql")
INSERT INTO iastudio_meta.system_schema_migrations (id, checksum_sha256)
VALUES ('dedicated-initial-schema', '$fingerprint');
COMMIT;
EOF

psql "$PSQL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f "$transaction"
mkdir -p "$IASTUDIO_DATA_DIR/migrations"
cp "$sql" "$IASTUDIO_DATA_DIR/migrations/dedicated-initial-schema-${fingerprint}.sql"
printf '%s\n' "$fingerprint" > "$IASTUDIO_DATA_DIR/migrations/dedicated-initial-schema.sha256"
echo "Schema dedicado provisionado para $IASTUDIO_INSTANCE_ID ($fingerprint)."
