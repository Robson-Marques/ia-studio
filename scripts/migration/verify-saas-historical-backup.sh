#!/usr/bin/env bash
# Verifica o backup histórico sem extrair ou aplicar dados a uma instância.
set -euo pipefail
umask 077

archive="${1:?uso: verify-saas-historical-backup.sh <arquivo.tar.gz>}"
[ -f "$archive" ] || { echo 'arquivo de backup não encontrado.' >&2; exit 2; }
[ -f "$archive.sha256" ] || { echo 'checksum externo do backup ausente.' >&2; exit 2; }
(
  cd "$(dirname "$archive")"
  sha256sum -c "$(basename "$archive").sha256"
)

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
tar -xzf "$archive" -C "$work"
for required in db.sql source.env storage checksums.sha256 manifest.json; do
  [ -e "$work/$required" ] || { echo "conteúdo obrigatório ausente: $required" >&2; exit 1; }
done
(
  cd "$work"
  sha256sum -c checksums.sha256
)
node - "$work/manifest.json" <<'NODE'
const fs = require('node:fs');
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (manifest.kind !== 'iastudio-saas-historical-backup' || manifest.version !== 1) throw new Error('Manifesto histórico inválido.');
if (manifest.contains_secrets !== true || manifest.purpose !== 'historical-rollback-only') throw new Error('Política de backup histórico inválida.');
if (manifest.restore_policy !== 'never-restore-into-dedicated-instance') throw new Error('Proteção contra restore no dedicado ausente.');
console.log('Backup histórico validado: arquivo íntegro e restrito a rollback da fonte SaaS.');
NODE
