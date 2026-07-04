// Porta unica ao banco do modulo Resource (resource_mappings). Nenhum service
// toca Prisma direto. NAO ha tabela de dados de negocio — so o mapeamento.
import { Injectable } from '@nestjs/common';
import { Prisma, ResourceMapping } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

export interface MappingFilters {
  workspaceId?: string;
  environmentId?: string;
  providerKey?: string;
  connectionId?: string;
  resourceType?: string;
  activeOnly?: boolean;
}

@Injectable()
export class ResourceRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(organizationId: string, filters: MappingFilters = {}): Promise<ResourceMapping[]> {
    const where: Prisma.ResourceMappingWhereInput = { organization_id: organizationId };
    if (filters.workspaceId) where.workspace_id = filters.workspaceId;
    if (filters.environmentId) where.environment_id = filters.environmentId;
    if (filters.providerKey) where.provider_key = filters.providerKey;
    if (filters.connectionId) where.connection_id = filters.connectionId;
    if (filters.resourceType) where.resource_type = filters.resourceType;
    if (filters.activeOnly) where.is_active = true;
    return this.prisma.resourceMapping.findMany({ where, orderBy: { created_at: 'desc' } });
  }

  findById(id: string): Promise<ResourceMapping | null> {
    return this.prisma.resourceMapping.findUnique({ where: { id } });
  }

  /**
   * Resolve o mapping ativo para (org, resource_type) preferindo a conexao
   * especifica; cai para o mapping do provider (connection_id null).
   */
  async findActiveForResource(
    organizationId: string,
    providerKey: string,
    connectionId: string,
    resourceType: string,
  ): Promise<ResourceMapping | null> {
    const byConnection = await this.prisma.resourceMapping.findFirst({
      where: {
        organization_id: organizationId,
        provider_key: providerKey,
        connection_id: connectionId,
        resource_type: resourceType,
        is_active: true,
      },
      orderBy: { updated_at: 'desc' },
    });
    if (byConnection) return byConnection;
    return this.prisma.resourceMapping.findFirst({
      where: {
        organization_id: organizationId,
        provider_key: providerKey,
        // "" = mapeamento de nivel do provider (sem conexao especifica).
        connection_id: '',
        resource_type: resourceType,
        is_active: true,
      },
      orderBy: { updated_at: 'desc' },
    });
  }

  create(data: Prisma.ResourceMappingUncheckedCreateInput): Promise<ResourceMapping> {
    return this.prisma.resourceMapping.create({ data });
  }

  update(id: string, data: Prisma.ResourceMappingUpdateInput): Promise<ResourceMapping> {
    return this.prisma.resourceMapping.update({ where: { id }, data });
  }

  /** Upsert idempotente pela chave natural (usado pelo seed dos exemplos). */
  upsertByNaturalKey(
    organizationId: string,
    providerKey: string,
    connectionId: string | null,
    resourceType: string,
    sourceOperation: string,
    data: Omit<Prisma.ResourceMappingUncheckedCreateInput, 'organization_id' | 'provider_key' | 'connection_id' | 'resource_type' | 'source_operation'>,
  ): Promise<ResourceMapping> {
    return this.prisma.resourceMapping.upsert({
      where: {
        organization_id_provider_key_connection_id_resource_type_source_operation: {
          organization_id: organizationId,
          provider_key: providerKey,
          connection_id: connectionId ?? '',
          resource_type: resourceType,
          source_operation: sourceOperation,
        },
      },
      create: {
        organization_id: organizationId,
        provider_key: providerKey,
        connection_id: connectionId ?? '',
        resource_type: resourceType,
        source_operation: sourceOperation,
        ...data,
      },
      // Seed NUNCA sobrescreve curadoria do usuario: no update so mantem os
      // campos (no-op de is_active/field_map). Apenas garante existencia.
      update: {},
    });
  }

  delete(id: string): Promise<ResourceMapping> {
    return this.prisma.resourceMapping.delete({ where: { id } });
  }
}
