// Caminhos de infra e guarda anti path-traversal do modulo system (Fase 8).
import { BadRequestException } from '@nestjs/common';
import * as path from 'node:path';

/** Pasta onde vivem os scripts de operacao (install/upgrade/backup). */
export function scriptsDir(): string {
  return process.env['IASTUDIO_SCRIPTS_DIR'] ?? '/opt/iastudio/scripts';
}

/** Pasta onde ficam os backups/dumps. */
export function backupDir(): string {
  return process.env['IASTUDIO_BACKUP_DIR'] ?? '/opt/iastudio-backups';
}

/** Raiz do monorepo em producao (para ler CHANGELOG.md e rodar git). */
export function appDir(): string {
  return process.env['IASTUDIO_APP_DIR'] ?? '/opt/iastudio';
}

// Nome de arquivo de backup: so letras/numeros/._- e extensoes conhecidas.
// Barra qualquer separador de diretorio ou ".." — o arquivo SEMPRE resolve
// dentro de backupDir().
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

/**
 * Valida o nome do arquivo e devolve o caminho ABSOLUTO dentro de backupDir().
 * Lanca 400 se o nome tiver `/`, `\`, `..` ou caracteres fora do conjunto — e
 * confirma que o resolvido continua dentro da pasta (defesa em profundidade).
 */
export function resolveBackupPath(fileName: string): string {
  if (!fileName || !SAFE_NAME.test(fileName)) {
    throw new BadRequestException('Nome de arquivo inválido.');
  }
  const base = backupDir();
  const resolved = path.resolve(base, fileName);
  const rel = path.relative(base, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new BadRequestException('Nome de arquivo inválido (fora da pasta de backups).');
  }
  return resolved;
}
