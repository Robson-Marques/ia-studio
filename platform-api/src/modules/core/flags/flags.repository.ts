// Porta unica ao banco do modulo flags.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class FlagsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.featureFlag.findMany({
      include: { overrides: true },
      orderBy: { key: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.featureFlag.findUnique({ where: { id }, include: { overrides: true } });
  }

  findByKey(key: string) {
    return this.prisma.featureFlag.findUnique({ where: { key }, include: { overrides: true } });
  }

  create(data: Prisma.FeatureFlagCreateInput) {
    return this.prisma.featureFlag.create({ data });
  }

  update(id: string, data: Prisma.FeatureFlagUpdateInput) {
    return this.prisma.featureFlag.update({ where: { id }, data });
  }

  createOverride(data: Prisma.FeatureFlagOverrideCreateInput) {
    return this.prisma.featureFlagOverride.create({ data });
  }

  findOverrideById(id: string) {
    return this.prisma.featureFlagOverride.findUnique({ where: { id } });
  }

  deleteOverride(id: string) {
    return this.prisma.featureFlagOverride.delete({ where: { id } });
  }
}
