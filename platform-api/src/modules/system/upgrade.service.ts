// Atualizacao da plataforma (Fase 8). Cria a row system_upgrades (RUNNING) e
// dispara scripts/upgrade.sh <tag> <id> em processo DETACHED — o script grava o
// log por fase direto na row (o front faz polling). 1 upgrade por vez (lock via
// row RUNNING). Auditado.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { SystemRepository } from './system.repository';
import { VersionService } from './version.service';
import { AuditLogService } from '../../shared/audit/audit-log.service';
import { scriptsDir } from './system.paths';

// Lock orfao: apos este tempo sem terminar, o front oferece "Liberar lock".
const ORPHAN_MS = 10 * 60 * 1000;

@Injectable()
export class UpgradeService {
  private readonly logger = new Logger(UpgradeService.name);

  constructor(
    private readonly repository: SystemRepository,
    private readonly versions: VersionService,
    private readonly audit: AuditLogService,
  ) {}

  /**
   * Inicia um upgrade para a tag informada. Cria a row RUNNING e dispara o
   * script detached. Retorna a row (o controller responde 202).
   */
  async start(version: string, startedBy: string | null) {
    // 1 por vez: se ja ha um RUNNING, recusa.
    const running = await this.repository.findRunningUpgrade();
    if (running) {
      throw new ConflictException('Já existe uma atualização em andamento.');
    }

    const info = await this.versions.getVersionInfo(true);
    if (!info.available.includes(version)) {
      throw new BadRequestException('Versão indisponível para atualização (não está entre as tags maiores que a atual).');
    }

    const row = await this.repository.createUpgrade({
      fromVersion: info.current_version,
      toVersion: version,
      startedBy,
    });

    await this.audit.record({
      action: 'system.upgrade.start',
      entityType: 'SystemUpgrade',
      entityId: row.id,
      newValue: { from_version: info.current_version, to_version: version },
    });

    this.spawnUpgrade(version, row.id);
    this.versions.invalidate();
    return row;
  }

  /** Status ao vivo da row informada (ou do RUNNING mais recente). */
  async current(id?: string) {
    const row = id ? await this.repository.findUpgradeById(id) : await this.repository.findRunningUpgrade();
    if (!row) {
      // Sem upgrade em andamento — devolve o ultimo conhecido (pode ser null).
      const [last] = await this.repository.listUpgrades(1);
      return { upgrade: last ?? null, orphaned: false };
    }
    const orphaned =
      row.status === 'RUNNING' && Date.now() - new Date(row.started_at).getTime() > ORPHAN_MS;
    return { upgrade: row, orphaned };
  }

  /**
   * Libera um lock orfao (> 10 min RUNNING): marca a row FAILED sem reverter
   * NADA — apenas destrava o painel. Nao mexe no processo do script.
   */
  async releaseLock(startedBy: string | null) {
    const running = await this.repository.findRunningUpgrade();
    if (!running) throw new NotFoundException('Nenhuma atualização em andamento.');
    const age = Date.now() - new Date(running.started_at).getTime();
    if (age < ORPHAN_MS) {
      throw new BadRequestException('A atualização ainda está dentro da janela normal (aguarde).');
    }
    await this.repository.markUpgradeFailed(running.id, 'ORPHAN_LOCK_RELEASED');
    await this.audit.record({
      action: 'system.upgrade.release-lock',
      entityType: 'SystemUpgrade',
      entityId: running.id,
      params: { started_by: startedBy, age_ms: age },
    });
    this.logger.warn(`Lock de upgrade liberado manualmente (row ${running.id}).`);
    return { released: true, id: running.id };
  }

  listHistory() {
    return this.repository.listUpgrades(20);
  }

  // ─── infra ──────────────────────────────────────────────────────────

  private spawnUpgrade(version: string, upgradeId: string): void {
    const script = path.join(scriptsDir(), 'upgrade.sh');
    // Detached + unref: o upgrade sobrevive a reciclagem do proprio processo da
    // API (pm2 reload na ultima fase). stdio ignorado — o log vai pra row via
    // psql dentro do script.
    try {
      const child = spawn('bash', [script, version, upgradeId], {
        detached: true,
        stdio: 'ignore',
        cwd: scriptsDir(),
      });
      child.on('error', (err) => {
        this.logger.error(`Falha ao iniciar upgrade.sh: ${err.message}`);
        void this.repository.markUpgradeFailed(upgradeId, 'SPAWN_FAILED');
      });
      child.unref();
      this.logger.log(`upgrade.sh disparado para ${version} (row ${upgradeId}).`);
    } catch (e) {
      this.logger.error(`Erro ao spawnar upgrade.sh: ${(e as Error).message}`);
      void this.repository.markUpgradeFailed(upgradeId, 'SPAWN_FAILED');
    }
  }
}
