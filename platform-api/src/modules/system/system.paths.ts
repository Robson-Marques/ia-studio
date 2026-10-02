// Caminhos de infra e guarda anti path-traversal do modulo system (Fase 8).
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import * as path from 'node:path';

function installationEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new InternalServerErrorException(`Configuração obrigatória da aplicação ausente: ${name}.`);
  }
  return value;
}

/** Pasta onde vivem os scripts de operacao (install/upgrade/backup). */
export function scriptsDir(): string {
  return installationEnv('IASTUDIO_SCRIPTS_DIR');
}

/** Pasta onde ficam os backups/dumps. */
export function backupDir(): string {
  return installationEnv('IASTUDIO_BACKUP_DIR');
}

/** Raiz do monorepo em producao (para ler CHANGELOG.md e rodar git). */
export function appDir(): string {
  return installationEnv('IASTUDIO_APP_DIR');
}

/** Identificador validado da aplicação, seguro para compor uma unidade systemd. */
export function appId(): string {
  const value = installationEnv('IASTUDIO_APP_ID');
  if (!/^[a-z][a-z0-9-]{2,31}$/.test(value)) {
    throw new InternalServerErrorException('IASTUDIO_APP_ID inválido.');
  }
  return value;
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
