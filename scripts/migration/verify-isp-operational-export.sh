#!/usr/bin/env bash
# Valida o artefato NDJSON extraído da fonte SaaS antes de ele poder ser
# revisado para importação. Não importa dados e não aceita DATABASE_URL.
set -euo pipefail
umask 077

usage() {
  cat <<'EOF'
Uso:
  bash scripts/migration/verify-isp-operational-export.sh --input-dir <exportação> \
    [--source-backup </caminho/backup-completo.tar.gz>]

Valida manifest, checksums, seleção, NDJSON e ausência de chaves sensíveis.
O comando é read-only e não importa dados na instância dedicada.
EOF
}

INPUT_DIR=''
SOURCE_BACKUP=''
while (($#)); do
  case "$1" in
    --input-dir) INPUT_DIR="${2:?valor ausente}"; shift 2 ;;
    --source-backup) SOURCE_BACKUP="${2:?valor ausente}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Argumento desconhecido: $1" >&2; usage >&2; exit 2 ;;
  esac
done

[ -n "$INPUT_DIR" ] || { usage >&2; exit 2; }
[ -d "$INPUT_DIR" ] || { echo 'input-dir não encontrado.' >&2; exit 2; }
for required in manifest.json selection.txt checksums.sha256 source-backup.sha256 records.ndjson; do
  [ -f "$INPUT_DIR/$required" ] || { echo "Arquivo obrigatório ausente: $required" >&2; exit 2; }
done

if [ -n "$SOURCE_BACKUP" ]; then
  [ -f "$SOURCE_BACKUP" ] || { echo 'source-backup não encontrado.' >&2; exit 2; }
  expected="$(cut -d' ' -f1 "$INPUT_DIR/source-backup.sha256")"
  actual="$(sha256sum "$SOURCE_BACKUP" | cut -d' ' -f1)"
  [ "$expected" = "$actual" ] || { echo 'Checksum do backup histórico não confere.' >&2; exit 1; }
fi

(
  cd "$INPUT_DIR"
  sha256sum -c checksums.sha256
)

node - "$INPUT_DIR" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const dir = process.argv[2];
const allowedDatasets = new Set([
  'ISP_CONFIGURATION', 'ISP_INCIDENT_HISTORY', 'INTEGRATION_METADATA',
  'WHATSAPP_CONFIGURATION', 'WHATSAPP_HISTORY', 'AI_CONFIGURATION',
  'AUTOMATION_CONFIGURATION',
]);
const sensitive = /(secret|token|password|api_?key|private_?key|client_?secret)/i;
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fail = (message) => { throw new Error(message); };

const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
if (manifest.kind !== 'iastudio-isp-operational-export' || manifest.version !== 1) fail('Manifesto de exportação inválido.');
if (manifest.format !== 'ndjson' || manifest.contains_secrets !== false) fail('Manifesto não declara NDJSON sem segredos.');
if (manifest.import_policy !== 'mapped-import-into-clean-dedicated-schema') fail('Política de importação dedicada ausente.');
if (!Array.isArray(manifest.datasets) || manifest.datasets.length === 0 || manifest.datasets.some((value) => !allowedDatasets.has(value))) fail('Datasets do manifesto inválidos.');

const selected = fs.readFileSync(path.join(dir, 'selection.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
if (selected.length !== manifest.datasets.length || selected.some((value, index) => value !== manifest.datasets.slice().sort()[index])) fail('Seleção e manifesto divergem.');

const recordsFile = path.join(dir, 'records.ndjson');
if (manifest.records_sha256 !== sha256(recordsFile)) fail('Checksum de records.ndjson diverge do manifesto.');
const recordNames = new Set();
for (const [index, line] of fs.readFileSync(recordsFile, 'utf8').split(/\r?\n/).filter(Boolean).entries()) {
  const record = JSON.parse(line);
  if (!/^[a-z0-9_]+$/.test(record.table ?? '') || !Number.isSafeInteger(record.rows) || record.rows < 0 || !/^[a-f0-9]{64}$/.test(record.sha256 ?? '')) fail(`Registro de tabela inválido na linha ${index + 1}.`);
  if (recordNames.has(record.table)) fail(`Tabela repetida no registro: ${record.table}.`);
  recordNames.add(record.table);
  const dataFile = path.join(dir, `${record.table}.ndjson`);
  if (!fs.existsSync(dataFile) || sha256(dataFile) !== record.sha256) fail(`Checksum inválido para ${record.table}.ndjson.`);
  const rows = fs.readFileSync(dataFile, 'utf8').split(/\r?\n/).filter(Boolean);
  if (rows.length !== record.rows) fail(`Contagem divergente para ${record.table}.ndjson.`);
  const inspect = (value, chain = '') => {
    if (Array.isArray(value)) return value.forEach((item, position) => inspect(item, `${chain}[${position}]`));
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (sensitive.test(key)) fail(`Chave sensível encontrada em ${record.table}.ndjson: ${chain}${key}.`);
      inspect(item, `${chain}${key}.`);
    }
  };
  rows.forEach((row, position) => {
    try { inspect(JSON.parse(row)); } catch (error) { fail(`NDJSON inválido em ${record.table}.ndjson linha ${position + 1}: ${error.message}`); }
  });
}
if (recordNames.size === 0) fail('Exportação não possui tabelas auditáveis.');
console.log('Artefato ISP validado: manifesto, checksums, NDJSON e ausência de campos sensíveis confirmados.');
NODE
