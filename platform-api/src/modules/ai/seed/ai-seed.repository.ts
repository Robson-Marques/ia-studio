// Porta ao banco usada SO pelo seed de IA: upsert de ProviderDefinition
// (categoria AI) e seed idempotente das tools builtin da instância dedicada.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class AiSeedRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProviderDefinition(key: string) {
    return this.prisma.providerDefinition.findUnique({ where: { key } });
  }

  createProviderDefinition(data: Prisma.ProviderDefinitionCreateInput) {
    return this.prisma.providerDefinition.create({ data });
  }

  updateProviderDefinition(key: string, data: Prisma.ProviderDefinitionUpdateInput) {
    return this.prisma.providerDefinition.update({ where: { key }, data });
  }

  findTool(key: string) {
    return this.prisma.aiTool.findUnique({ where: { key } });
  }

  createTool(data: Prisma.AiToolUncheckedCreateInput) {
    return this.prisma.aiTool.create({ data });
  }

  updateTool(key: string, data: Prisma.AiToolUncheckedUpdateInput) {
    return this.prisma.aiTool.update({
      where: { key },
      data,
    });
  }
}
