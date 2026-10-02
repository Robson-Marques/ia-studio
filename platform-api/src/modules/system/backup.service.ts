// Backup e restauração locais. Lista/gera/baixa/sobe/exclui pacotes e dispara
// a restauracao completa. 1 operacao por vez (lock via system_restores RUNNING).
// Guarda anti path-traversal em TODO nome de arquivo (resolveBackupPath).
// Restauracao roda via systemd-run (fora da arvore do PM2 — evita treekill).
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import type { ReadStream } from 'node:fs';
import * as path from 'node:path';
import { SystemRepository } from './system.repository';
import { AuditLogService } from '../../shared/audit/audit-log.service';
import { appId, backupDir, resolveBackupPath, scriptsDir } from './system.paths';

const STALE_OPERATION_MS = 30 * 60 * 1000;

export interface BackupFileInfo {
  file: string;
  size_bytes: number;
  created_at: string;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly repository: SystemRepository,
    private readonly audit: AuditLogService,
  ) {}

  // ─── Listagem ───────────────────────────────────────────────────────

  async list(): Promise<BackupFileInfo[]> {
    const dir = backupDir();
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return []; // pasta ainda nao existe = sem backups
    }
    const files: BackupFileInfo[] = [];
    for (const name of names) {
      if (!/\.(tar\.gz|sql|sql\.gz)$/.test(name)) continue;
      try {
        const st = await stat(path.join(dir, name));
        if (!st.isFile()) continue;
        files.push({ file: name, size_bytes: st.size, created_at: st.mtime.toISOString() });
      } catch {
        // arquivo sumiu entre readdir e stat — ignora
      }
    }
    return files.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  /**
   * Quantos arquivos de backup estao retidos em disco — dumps de banco da
   * rotacao do upgrade (`.sql.gz`) + pacotes completos de migracao (`.tar.gz`).
   */
  async count(): Promise<number> {
    return (await this.list()).length;
  }

  // ─── Geracao ────────────────────────────────────────────────────────

  async generate(startedBy: string | null) {
    await this.assertNoOperationRunning();
    const row = await this.repository.createRestore({ kind: 'BACKUP', fileName: null, startedBy });
    await this.audit.record({
      action: 'system.backup.create',
      entityType: 'SystemRestore',
      entityId: row.id,
    });
    this.spawnBackup(row.id);
    return row;
  }

  // ─── Download (stream) ──────────────────────────────────────────────

  /** Valida o nome (anti path-traversal) e devolve o stream + tamanho. */
  async openDownload(file: string): Promise<{ stream: ReadStream; size: number; name: string }> {
    const full = resolveBackupPath(file);
    let st;
    try {
      st = await stat(full);
    } catch {
      throw new NotFoundException('Backup não encontrado.');
    }
    if (!st.isFile()) throw new NotFoundException('Backup não encontrado.');
    return { stream: createReadStream(full), size: st.size, name: path.basename(full) };
  }

  // ─── Upload (recebe o stream ja gravado pelo controller) ────────────

  /** Resolve o caminho de destino do upload (com guarda). O controller grava. */
  resolveUploadTarget(fileName: string): string {
    return resolveBackupPath(fileName);
  }

  async ensureBackupDir(): Promise<void> {
    await mkdir(backupDir(), { recursive: true });
  }

  async recordUpload(fileName: string, startedBy: string | null): Promise<void> {
    await this.audit.record({
      action: 'system.backup.upload',
      entityType: 'SystemRestore',
      entityId: fileName,
      params: { file: fileName, started_by: startedBy },
    });
  }

  // ─── Exclusao ───────────────────────────────────────────────────────

  async remove(file: string, startedBy: string | null): Promise<{ deleted: string }> {
    const full = resolveBackupPath(file);
    try {
      await unlink(full);
    } catch {
      throw new NotFoundException('Backup não encontrado.');
    }
    await this.audit.record({
      action: 'system.backup.delete',
      entityType: 'SystemRestore',
      entityId: file,
      params: { file, started_by: startedBy },
    });
    return { deleted: file };
  }

  // ─── Restauracao completa ───────────────────────────────────────────

  async restore(file: string, startedBy: string | null) {
    const full = resolveBackupPath(file); // valida o nome
    try {
      const st = await stat(full);
      if (!st.isFile()) throw new NotFoundException('Backup não encontrado.');
    } catch {
      throw new NotFoundException('Backup não encontrado.');
    }
    await this.assertNoOperationRunning();

    const row = await this.repository.createRestore({ kind: 'RESTORE', fileName: file, startedBy });
    await this.audit.record({
      action: 'system.restore.start',
      entityType: 'SystemRestore',
      entityId: row.id,
      params: { file, started_by: startedBy },
    });
    this.spawnRestore(full, row.id);
    return row;
  }

  // ─── Status ─────────────────────────────────────────────────────────

  async currentOperation() {
    await this.reapStaleOperation();
    const running = await this.repository.findRunningRestore();
    return { operation: running ?? await this.repository.findLatestRestore() };
  }

  // ─── infra ──────────────────────────────────────────────────────────

  private async assertNoOperationRunning(): Promise<void> {
    await this.reapStaleOperation();
    const running = await this.repository.findRunningRestore();
    if (running) {
      throw new ConflictException('Já existe uma operação de backup/restauração em andamento.');
    }
  }

  private spawnBackup(restoreId: string): void {
    const script = path.join(scriptsDir(), 'backup-full.sh');
    // O script roda fora da árvore do PM2 e atualiza a própria row no banco.
    // Isso sobrevive a restart da API depois que o pacote já foi criado.
    try {
      const processPath = process.env.PATH ?? '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
      const child = spawn('systemd-run', [
        '--quiet',
        '--collect',
        '--unit', `iastudio-${appId()}-backup-${restoreId}`,
        `--setenv=PATH=${processPath}`,
        'bash', script, '--operation-id', restoreId,
      ], {
        detached: true,
        cwd: scriptsDir(),
        stdio: 'ignore',
      });
      child.on('error', (err) => {
        this.logger.error(`Falha ao iniciar backup via systemd-run: ${err.message}`);
        void this.repository.finishRestore(restoreId, 'FAILED', err.message);
      });
      child.on('exit', (code) => {
        if (code && code !== 0) {
          void this.repository.finishRestore(restoreId, 'FAILED', `systemd-run não iniciou o backup (código ${code})`);
        }
      });
      child.unref();
      this.logger.log(`backup-full.sh disparado via systemd-run (row ${restoreId}).`);
    } catch (e) {
      this.logger.error(`Erro ao iniciar backup via systemd-run: ${(e as Error).message}`);
      void this.repository.finishRestore(restoreId, 'FAILED', (e as Error).message);
    }
  }

  private async reapStaleOperation(): Promise<void> {
    try {
      const result = await this.repository.failStaleRunningRestore(new Date(Date.now() - STALE_OPERATION_MS));
      if (result.count) this.logger.warn(`Operação(ões) de backup/restauração órfã(s) marcada(s) como FAILED: ${result.count}.`);
    } catch (error) {
      this.logger.warn(`Não foi possível liberar operação órfã: ${(error as Error).message}`);
    }
  }

  private spawnRestore(archivePath: string, restoreId: string): void {
    const script = path.join(scriptsDir(), 'restore-full.sh');
    // CRITICO: o restore faz `pm2 delete` — se rodasse como filho do PM2, o
    // treekill mataria o proprio restore. Por isso disparamos via systemd-run
    // (unidade transiente, fora da arvore do PM2). O proprio script fecha a row.
    try {
      const child = spawn(
        'systemd-run',
        [
          '--unit', `iastudio-${appId()}-restore-${restoreId}`,
          '--collect',
          'bash', script, archivePath, restoreId,
        ],
        { detached: true, stdio: 'ignore', cwd: scriptsDir() },
      );
      child.on('error', (err) => {
        this.logger.error(`Falha ao iniciar restore (systemd-run): ${err.message}`);
        void this.repository.finishRestore(restoreId, 'FAILED', err.message);
      });
      child.unref();
      this.logger.log(`restore-full.sh disparado via systemd-run (row ${restoreId}).`);
    } catch (e) {
      this.logger.error(`Erro ao spawnar restore-full.sh: ${(e as Error).message}`);
      void this.repository.finishRestore(restoreId, 'FAILED', (e as Error).message);
    }
  }
}
