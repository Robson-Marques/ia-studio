// CRUD de ResourceMapping (o mapeamento — NUNCA dado de negocio). Escopo por
// org/ws/env, ownership por org, @Auditable via AuditLogService (diff). O
// mapping nasce OFF (is_active=false) ate confirmacao (diretriz 25).
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, ResourceMapping } from '@prisma/client';
import { ResourceRepository } from './resource.repository';
import { ResourceMapperService } from './resource-mapper.service';
import { findResourceType, RESOURCE_TYPES } from './resource-model.catalog';
import { CreateMappingDto, UpdateMappingDto } from './dto/resource.dtos';
import { AuditLogService } from '../../shared/audit/audit-log.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { assertSameOrg, validateWorkspaceScope } from '../../shared/auth/tenant.util';

@Injectable()
export class ResourceMappingsService {
  private readonly logger = new Logger(ResourceMappingsService.name);

  constructor(
    private readonly repository: ResourceRepository,
    private readonly mapper: ResourceMapperService,
    private readonly audit: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  /** Catalogo de tipos canonicos (para a UI montar o editor de field_map). */
  catalog() {
    return RESOURCE_TYPES;
  }

  findAll(organizationId: string, filters: { workspaceId?: string; environmentId?: string; resourceType?: string; providerKey?: string }) {
    return this.repository.findAll(organizationId, filters);
  }

  async findById(organizationId: string, id: string): Promise<ResourceMapping> {
    const mapping = await this.repository.findById(id);
    if (!mapping) throw new NotFoundException('Mapeamento não encontrado.');
    assertSameOrg(mapping.organization_id, organizationId);
    return mapping;
  }

  async create(organizationId: string, dto: CreateMappingDto, createdBy: string | null): Promise<ResourceMapping> {
    await validateWorkspaceScope(this.prisma, organizationId, dto.workspace_id, dto.environment_id);
    this.assertKnownType(dto.resource_type);
    this.assertFieldMap(dto.resource_type, dto.field_map);

    const mapping = await this.repository.create({
      organization_id: organizationId,
      workspace_id: dto.workspace_id ?? null,
      environment_id: dto.environment_id ?? null,
      provider_key: dto.provider_key,
      connection_id: dto.connection_id ?? null,
      resource_type: dto.resource_type,
      source_operation: dto.source_operation,
      field_map: (dto.field_map ?? {}) as Prisma.InputJsonValue,
      extensions: (dto.extensions ?? undefined) as Prisma.InputJsonValue | undefined,
      description: dto.description ?? null,
      // Automatismo OFF: mesmo que o front peca ativo, so vale se explicitado.
      is_active: dto.is_active === true,
      created_by: createdBy,
    });

    await this.audit.record({
      action: 'resource.mapping.create',
      entityType: 'ResourceMapping',
      entityId: mapping.id,
      organizationId,
      workspaceId: dto.workspace_id ?? null,
      newValue: {
        provider_key: mapping.provider_key,
        resource_type: mapping.resource_type,
        source_operation: mapping.source_operation,
        is_active: mapping.is_active,
      },
    });
    return mapping;
  }

  async update(organizationId: string, id: string, dto: UpdateMappingDto): Promise<ResourceMapping> {
    const before = await this.findById(organizationId, id);
    if (dto.field_map) this.assertFieldMap(before.resource_type, dto.field_map);

    const data: Prisma.ResourceMappingUpdateInput = {};
    if (dto.source_operation !== undefined) data.source_operation = dto.source_operation;
    if (dto.field_map !== undefined) data.field_map = dto.field_map as Prisma.InputJsonValue;
    if (dto.extensions !== undefined) data.extensions = dto.extensions as Prisma.InputJsonValue;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.is_active !== undefined) data.is_active = dto.is_active;

    const updated = await this.repository.update(id, data);
    await this.audit.record({
      action: 'resource.mapping.update',
      entityType: 'ResourceMapping',
      entityId: id,
      organizationId,
      oldValue: { field_map: before.field_map, is_active: before.is_active, source_operation: before.source_operation },
      newValue: { field_map: updated.field_map, is_active: updated.is_active, source_operation: updated.source_operation },
    });
    return updated;
  }

  async remove(organizationId: string, id: string): Promise<{ ok: true }> {
    const before = await this.findById(organizationId, id);
    await this.repository.delete(id);
    await this.audit.record({
      action: 'resource.mapping.delete',
      entityType: 'ResourceMapping',
      entityId: id,
      organizationId,
      oldValue: { provider_key: before.provider_key, resource_type: before.resource_type },
    });
    return { ok: true };
  }

  /** Testa o field_map sobre uma amostra bruta (preview do canonico). */
  preview(mapping: Pick<ResourceMapping, 'resource_type' | 'field_map' | 'extensions'>, raw: unknown) {
    return this.mapper.toCanonical(mapping, raw);
  }

  private assertKnownType(resourceType: string): void {
    if (!findResourceType(resourceType)) {
      throw new BadRequestException(`Tipo canônico desconhecido: "${resourceType}".`);
    }
  }

  private assertFieldMap(resourceType: string, fieldMap: Record<string, unknown>): void {
    const unknown = this.mapper.unknownFields(resourceType, fieldMap);
    if (unknown.length > 0) {
      throw new BadRequestException(
        `Campos canônicos desconhecidos para ${resourceType}: ${unknown.join(', ')}.`,
      );
    }
  }
}
