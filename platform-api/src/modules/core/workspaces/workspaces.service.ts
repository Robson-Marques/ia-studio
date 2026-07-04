import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { WorkspacesRepository } from './workspaces.repository';
import { LimitsService } from '../../licensing/limits.service';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { assertSameOrg } from '../../../shared/auth/tenant.util';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly repository: WorkspacesRepository,
    private readonly limits: LimitsService,
    private readonly audit: AuditLogService,
  ) {}

  findAll(orgId: string) {
    return this.repository.findAllByOrg(orgId);
  }

  async findById(orgId: string, id: string) {
    const workspace = await this.repository.findById(id);
    if (!workspace) throw new NotFoundException('Workspace não encontrado.');
    assertSameOrg(workspace.organization_id, orgId);
    return workspace;
  }

  async create(orgId: string, dto: CreateWorkspaceDto) {
    // Enforcement de limite do plano (metrica estrutural "workspaces")
    const activeCount = await this.repository.countActive(orgId);
    await this.limits.assertCountWithin(orgId, 'workspaces', activeCount);

    const dup = await this.repository.findBySlug(orgId, dto.slug);
    if (dup) throw new ConflictException('Já existe um workspace com este slug.');

    const workspace = await this.repository.create({
      organization: { connect: { id: orgId } },
      name: dto.name,
      slug: dto.slug,
      // Todo workspace nasce com ambiente Producao default (diretriz 4)
      environments: { create: { name: 'Produção', kind: 'PRODUCTION', is_default: true } },
    });
    await this.audit.record({
      action: 'core.workspace.create',
      entityType: 'Workspace',
      entityId: workspace.id,
      organizationId: orgId,
      newValue: { name: workspace.name, slug: workspace.slug },
    });
    return workspace;
  }

  async update(orgId: string, id: string, dto: UpdateWorkspaceDto) {
    const before = await this.findById(orgId, id);
    if (dto.slug && dto.slug !== before.slug) {
      const dup = await this.repository.findBySlug(orgId, dto.slug);
      if (dup) throw new ConflictException('Já existe um workspace com este slug.');
    }
    const workspace = await this.repository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.slug !== undefined ? { slug: dto.slug } : {}),
      ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
    });
    await this.audit.record({
      action: 'core.workspace.update',
      entityType: 'Workspace',
      entityId: id,
      organizationId: orgId,
      oldValue: { name: before.name, slug: before.slug, is_active: before.is_active },
      newValue: { name: workspace.name, slug: workspace.slug, is_active: workspace.is_active },
    });
    return workspace;
  }

  // ─── Environments ───────────────────────────────────
  async createEnvironment(orgId: string, workspaceId: string, dto: CreateEnvironmentDto) {
    const workspace = await this.findById(orgId, workspaceId);
    if (workspace.environments.some((e) => e.kind === dto.kind)) {
      throw new ConflictException('O workspace já possui um ambiente deste tipo.');
    }
    if (dto.is_default) {
      await this.repository.clearDefaultEnvironment(workspaceId);
    }
    const env = await this.repository.createEnvironment({
      workspace: { connect: { id: workspaceId } },
      name: dto.name,
      kind: dto.kind,
      is_default: dto.is_default ?? false,
    });
    await this.audit.record({
      action: 'core.environment.create',
      entityType: 'Environment',
      entityId: env.id,
      organizationId: orgId,
      workspaceId,
      newValue: { name: env.name, kind: env.kind, is_default: env.is_default },
    });
    return env;
  }

  async updateEnvironment(
    orgId: string,
    workspaceId: string,
    environmentId: string,
    dto: UpdateEnvironmentDto,
  ) {
    await this.findById(orgId, workspaceId);
    const before = await this.repository.findEnvironmentById(environmentId);
    if (!before || before.workspace_id !== workspaceId) {
      throw new NotFoundException('Ambiente não encontrado.');
    }
    if (dto.is_default === true) {
      await this.repository.clearDefaultEnvironment(workspaceId);
    }
    const env = await this.repository.updateEnvironment(environmentId, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.is_default !== undefined ? { is_default: dto.is_default } : {}),
    });
    await this.audit.record({
      action: 'core.environment.update',
      entityType: 'Environment',
      entityId: environmentId,
      organizationId: orgId,
      workspaceId,
      oldValue: { name: before.name, is_default: before.is_default },
      newValue: { name: env.name, is_default: env.is_default },
    });
    return env;
  }
}
