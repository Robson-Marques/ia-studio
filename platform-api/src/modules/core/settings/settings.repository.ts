// Porta unica ao banco do modulo settings.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  findByKey(key: string) {
    return this.prisma.systemSetting.findFirst({ where: { key }, orderBy: { created_at: 'asc' } });
  }

  async upsert(key: string, value: Prisma.InputJsonValue) {
    const current = await this.findByKey(key);
    if (current) {
      return this.prisma.systemSetting.update({ where: { id: current.id }, data: { value } });
    }
    return this.prisma.systemSetting.create({ data: { key, value } as Prisma.SystemSettingUncheckedCreateInput });
  }

}
