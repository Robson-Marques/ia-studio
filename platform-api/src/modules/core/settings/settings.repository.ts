// Porta unica ao banco do modulo settings.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class SettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllByOrg(organizationId: string) {
    return this.prisma.systemSetting.findMany({
      where: { organization_id: organizationId },
      orderBy: { key: 'asc' },
    });
  }

  findByKey(organizationId: string, key: string) {
    return this.prisma.systemSetting.findUnique({
      where: { organization_id_key: { organization_id: organizationId, key } },
    });
  }

  upsert(organizationId: string, key: string, value: Prisma.InputJsonValue) {
    return this.prisma.systemSetting.upsert({
      where: { organization_id_key: { organization_id: organizationId, key } },
      create: { organization_id: organizationId, key, value },
      update: { value },
    });
  }
}
