// Porta unica ao banco do modulo system (Fase 8). Acesso as tabelas
// system_upgrades e system_restores fica SO aqui (DB via repository).
import { Injectable } from '@nestjs/common';
import { SystemJobStatus } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class SystemRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Upgrades ───────────────────────────────────────────────────────

  createUpgrade(input: { fromVersion: string | null; toVersion: string; startedBy: string | null }) {
    return this.prisma.systemUpgrade.create({
      data: {
        from_version: input.fromVersion,
        to_version: input.toVersion,
        started_by: input.startedBy,
        status: SystemJobStatus.RUNNING,
      },
    });
  }

  findUpgradeById(id: string) {
    return this.prisma.systemUpgrade.findUnique({ where: { id } });
  }

  /** Upgrade em andamento mais recente (para o lock de "1 por vez"). */
  findRunningUpgrade() {
    return this.prisma.systemUpgrade.findFirst({
      where: { status: SystemJobStatus.RUNNING },
      orderBy: { started_at: 'desc' },
    });
  }

  markUpgradeFailed(id: string, errorStep: string) {
    return this.prisma.systemUpgrade.updateMany({
      where: { id, status: SystemJobStatus.RUNNING },
      data: { status: SystemJobStatus.FAILED, error_step: errorStep, finished_at: new Date() },
    });
  }

  listUpgrades(take = 20) {
    return this.prisma.systemUpgrade.findMany({ orderBy: { created_at: 'desc' }, take });
  }

  // ─── Backups / Restores ─────────────────────────────────────────────

  createRestore(input: { kind: 'BACKUP' | 'RESTORE'; fileName: string | null; startedBy: string | null }) {
    return this.prisma.systemRestore.create({
      data: {
        kind: input.kind,
        file_name: input.fileName,
        started_by: input.startedBy,
        status: SystemJobStatus.RUNNING,
      },
    });
  }

  findRestoreById(id: string) {
    return this.prisma.systemRestore.findUnique({ where: { id } });
  }

  /** Operacao de backup/restore em andamento (lock de "1 por vez"). */
  findRunningRestore() {
    return this.prisma.systemRestore.findFirst({
      where: { status: SystemJobStatus.RUNNING },
      orderBy: { started_at: 'desc' },
    });
  }

  /** Última linha RUNNING sem processo responsável: libera o lock com erro visível. */
  failStaleRunningRestore(cutoff: Date) {
    return this.prisma.systemRestore.updateMany({
      where: { status: SystemJobStatus.RUNNING, started_at: { lt: cutoff } },
      data: {
        status: SystemJobStatus.FAILED,
        error: 'Operação interrompida antes de concluir; inicie um novo backup ou restauração.',
        finished_at: new Date(),
      },
    });
  }

  finishRestore(id: string, status: 'SUCCESS' | 'FAILED', error?: string) {
    return this.prisma.systemRestore.updateMany({
      where: { id, status: SystemJobStatus.RUNNING },
      data: {
        status: status === 'SUCCESS' ? SystemJobStatus.SUCCESS : SystemJobStatus.FAILED,
        error: error ?? null,
        finished_at: new Date(),
      },
    });
  }

  appendRestoreLog(id: string, line: string) {
    return this.prisma.$executeRaw`
      UPDATE system_restores
      SET log_lines = array_append(log_lines, ${line})
      WHERE id = ${id}`;
  }
}
