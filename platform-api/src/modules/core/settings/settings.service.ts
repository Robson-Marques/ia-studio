import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SettingsRepository } from './settings.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';

@Injectable()
export class SettingsService {
  constructor(
    private readonly repository: SettingsRepository,
    private readonly audit: AuditLogService,
  ) {}

  findAll(orgId: string) {
    return this.repository.findAllByOrg(orgId);
  }

  async findByKey(orgId: string, key: string) {
    const setting = await this.repository.findByKey(orgId, key);
    if (!setting) throw new NotFoundException('Configuração não encontrada.');
    return setting;
  }

  /** Valor da config ou `null` se não existir (uso interno — não lança). */
  async getValue(orgId: string, key: string): Promise<unknown> {
    const setting = await this.repository.findByKey(orgId, key);
    return setting ? setting.value : null;
  }

  async set(orgId: string, key: string, value: unknown) {
    const before = await this.repository.findByKey(orgId, key);
    const setting = await this.repository.upsert(orgId, key, value as Prisma.InputJsonValue);
    await this.audit.record({
      action: 'core.setting.set',
      entityType: 'SystemSetting',
      entityId: setting.id,
      organizationId: orgId,
      oldValue: before ? { key, value: before.value } : null,
      newValue: { key, value: setting.value },
    });
    return setting;
  }
}
