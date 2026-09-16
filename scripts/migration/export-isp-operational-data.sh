#!/usr/bin/env bash
# Exportação seletiva e auditável do SaaS histórico para a futura instância ISP.
# Não restaura SQL, não exporta secrets e não escreve no banco de destino.
set -euo pipefail
umask 077

usage() {
  cat <<'EOF'
Uso:
  SOURCE_DATABASE_URL='postgresql://...' bash scripts/migration/export-isp-operational-data.sh \
    --source-organization-id <uuid> \
    --backup-archive </caminho/backup-completo.tar.gz> \
    --selection <arquivo-de-selecao> \
    --output-dir </caminho/exportacao> \
    --acknowledge-sensitive-data

O arquivo de seleção lista uma chave por linha, entre:
  ISP_CONFIGURATION
  ISP_INCIDENT_HISTORY
  INTEGRATION_METADATA
  WHATSAPP_CONFIGURATION
  WHATSAPP_HISTORY
  AI_CONFIGURATION
  AUTOMATION_CONFIGURATION

Nada é selecionado por padrão. O exportado é NDJSON para importação mapeada na
base dedicada; não é um dump SQL e não pode ser restaurado sobre o novo schema.
EOF
}

SOURCE_ORGANIZATION_ID=''
BACKUP_ARCHIVE=''
SELECTION_FILE=''
OUTPUT_DIR=''
ACKNOWLEDGED=0

while (($#)); do
  case "$1" in
    --source-organization-id) SOURCE_ORGANIZATION_ID="${2:?valor ausente}"; shift 2 ;;
    --backup-archive) BACKUP_ARCHIVE="${2:?valor ausente}"; shift 2 ;;
    --selection) SELECTION_FILE="${2:?valor ausente}"; shift 2 ;;
    --output-dir) OUTPUT_DIR="${2:?valor ausente}"; shift 2 ;;
    --acknowledge-sensitive-data) ACKNOWLEDGED=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Argumento desconhecido: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "${SOURCE_DATABASE_URL:-}" ] || { echo 'SOURCE_DATABASE_URL é obrigatória.' >&2; exit 2; }
[[ "$SOURCE_ORGANIZATION_ID" =~ ^[0-9a-fA-F-]{36}$ ]] || { echo 'source organization id inválido.' >&2; exit 2; }
[ -f "$BACKUP_ARCHIVE" ] || { echo 'Backup completo não encontrado.' >&2; exit 2; }
[ -f "$SELECTION_FILE" ] || { echo 'Arquivo de seleção não encontrado.' >&2; exit 2; }
[ -n "$OUTPUT_DIR" ] || { echo 'output-dir é obrigatório.' >&2; exit 2; }
[ "$ACKNOWLEDGED" = '1' ] || { echo 'Confirme --acknowledge-sensitive-data.' >&2; exit 2; }
[ ! -e "$OUTPUT_DIR" ] || { echo 'output-dir já existe; escolha um diretório novo.' >&2; exit 2; }

declare -A DATASET_TABLES=(
  [ISP_CONFIGURATION]='isp_os_config'
  [ISP_INCIDENT_HISTORY]='isp_incidents isp_incident_dispatches isp_incident_team_alerts isp_payment_links'
  [INTEGRATION_METADATA]='integration_connections'
  [WHATSAPP_CONFIGURATION]='comm_whatsapp_templates comm_attendance_teams comm_attendance_queues comm_channel_agents'
  [WHATSAPP_HISTORY]='comm_whatsapp_chats comm_whatsapp_messages comm_whatsapp_chat_events'
  [AI_CONFIGURATION]='ai_agents ai_tools ai_knowledge_bases ai_memory_profiles ai_approval_policies ai_collaboration_rules ai_budgets ai_mcp_servers'
  [AUTOMATION_CONFIGURATION]='automation_workflows automation_schedules automation_calendars automation_templates'
)

selected=()
while IFS= read -r raw || [ -n "$raw" ]; do
  key="${raw%%#*}"
  key="$(printf '%s' "$key" | tr -d '[:space:]')"
  [ -z "$key" ] && continue
  [ -n "${DATASET_TABLES[$key]:-}" ] || { echo "Conjunto não permitido: $key" >&2; exit 2; }
  selected+=("$key")
done < "$SELECTION_FILE"

[ "${#selected[@]}" -gt 0 ] || { echo 'Nenhum conjunto foi selecionado.' >&2; exit 2; }

mkdir -p "$OUTPUT_DIR"
printf '%s\n' "${selected[@]}" | sort -u > "$OUTPUT_DIR/selection.txt"
sha256sum "$BACKUP_ARCHIVE" > "$OUTPUT_DIR/source-backup.sha256"

export_table() {
  local table="$1"
  local output="$OUTPUT_DIR/${table}.ndjson"
  # table vem apenas do mapa interno; organization_id delimita a origem SaaS.
  psql "$SOURCE_DATABASE_URL" -X -A -t -q -v ON_ERROR_STOP=1 \
    -v source_organization_id="$SOURCE_ORGANIZATION_ID" \
    -c "SELECT row_to_json(record)::text FROM \"${table}\" AS record WHERE record.organization_id = :'source_organization_id' ORDER BY record.id;" \
    > "$output"
  sha256sum "$output" >> "$OUTPUT_DIR/checksums.sha256"
}

declare -A exported=()
for key in "${selected[@]}"; do
  for table in ${DATASET_TABLES[$key]}; do
    [ -n "${exported[$table]:-}" ] && continue
    export_table "$table"
    exported[$table]=1
  done
done

cat > "$OUTPUT_DIR/manifest.json" <<EOF
{
  "kind": "iastudio-isp-operational-export",
  "version": 1,
  "created_at": "$(date -Iseconds)",
  "source_organization_id": "$SOURCE_ORGANIZATION_ID",
  "source_backup_sha256": "$(cut -d' ' -f1 "$OUTPUT_DIR/source-backup.sha256")",
  "selection_file_sha256": "$(sha256sum "$SELECTION_FILE" | cut -d' ' -f1)",
  "format": "ndjson",
  "contains_secrets": false,
  "import_policy": "mapped-import-into-clean-dedicated-schema"
}
EOF

echo "Exportação concluída: $OUTPUT_DIR"
