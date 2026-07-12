// Porta ao banco usada SO pelo seed de IA: upsert de ProviderDefinition
// (categoria AI) e seed idempotente das tools builtin por organization.
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

  /** IDs de todas as organizations (pro seed de tools builtin por org). */
  listOrganizationIds() {
    return this.prisma.organization.findMany({ select: { id: true } });
  }

  findTool(organizationId: string, key: string) {
    return this.prisma.aiTool.findUnique({
      where: { organization_id_key: { organization_id: organizationId, key } },
    });
  }

  createTool(data: Prisma.AiToolUncheckedCreateInput) {
    return this.prisma.aiTool.create({ data });
  }

  updateTool(organizationId: string, key: string, data: Prisma.AiToolUncheckedUpdateInput) {
    return this.prisma.aiTool.update({
      where: { organization_id_key: { organization_id: organizationId, key } },
      data,
    });
  }
}
