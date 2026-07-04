// Porta unica ao banco do marketplace (integration_providers +
// integration_provider_installs).
import { Injectable } from '@nestjs/common';
import { Prisma, ProviderCategory } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class MarketplaceRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── ProviderDefinition (catalogo) ──────────────────
  findDefinitions(filters: { category?: ProviderCategory; search?: string; onlyActive?: boolean }) {
    const where: Prisma.ProviderDefinitionWhereInput = {};
    if (filters.onlyActive) where.is_active = true;
    if (filters.category) where.category = filters.category;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { key: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.providerDefinition.findMany({ where, orderBy: { name: 'asc' } });
  }

  findDefinitionByKey(key: string) {
    return this.prisma.providerDefinition.findUnique({ where: { key } });
  }

  findDefinitionById(id: string) {
    return this.prisma.providerDefinition.findUnique({ where: { id } });
  }

  createDefinition(data: Prisma.ProviderDefinitionCreateInput) {
    return this.prisma.providerDefinition.create({ data });
  }

  updateDefinition(id: string, data: Prisma.ProviderDefinitionUpdateInput) {
    return this.prisma.providerDefinition.update({ where: { id }, data });
  }

  // ─── ProviderInstall (por organization) ─────────────
  findInstallsByOrg(organizationId: string) {
    return this.prisma.providerInstall.findMany({ where: { organization_id: organizationId } });
  }

  findInstall(organizationId: string, providerKey: string) {
    return this.prisma.providerInstall.findUnique({
      where: { organization_id_provider_key: { organization_id: organizationId, provider_key: providerKey } },
    });
  }

  createInstall(organizationId: string, providerKey: string, installedBy: string | null) {
    return this.prisma.providerInstall.create({
      data: { organization_id: organizationId, provider_key: providerKey, installed_by: installedBy },
    });
  }

  deleteInstall(id: string) {
    return this.prisma.providerInstall.delete({ where: { id } });
  }

  /** Conexoes NAO desativadas do provider na org (bloqueia uninstall). */
  countActiveConnections(organizationId: string, providerKey: string) {
    return this.prisma.connection.count({
      where: {
        organization_id: organizationId,
        provider_key: providerKey,
        status: { not: 'DISABLED' },
      },
    });
  }
}
