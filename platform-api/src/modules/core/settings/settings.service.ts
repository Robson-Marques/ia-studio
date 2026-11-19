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

  findAll() {
    return this.repository.findAll();
  }

  async findByKey(key: string) {
    const setting = await this.repository.findByKey(key);
    if (!setting) throw new NotFoundException('Configuração não encontrada.');
    return setting;
  }

  /** Valor da config ou `null` se não existir (uso interno — não lança). */
  /** Valor da configuração da instalação dedicada, ou `null` se não existir. */
  async getValue(key: string): Promise<unknown> {
    const setting = await this.repository.findByKey(key);
    return setting ? setting.value : null;
  }

  async set(key: string, value: unknown) {
    const before = await this.repository.findByKey(key);
    const setting = await this.repository.upsert(key, value as Prisma.InputJsonValue);
    await this.audit.record({
      action: 'core.setting.set',
      entityType: 'SystemSetting',
      entityId: setting.id,
      oldValue: before ? { key, value: before.value } : null,
      newValue: { key, value: setting.value },
    });
    return setting;
  }
}
