// Fluxos de automacao — CRUD + versoes + publicar/rollback + executar +
// export/import. Sem DELETE: fluxo e arquivado, nunca excluido.
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { WorkflowsService } from './workflows.service';
import { NodeRegistryService } from '../engine/node-registry.service';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { SaveVersionDto } from './dto/save-version.dto';
import { PublishWorkflowDto } from './dto/publish-workflow.dto';
import { ExecuteWorkflowDto } from './dto/execute-workflow.dto';
import { ImportWorkflowDto } from './dto/import-workflow.dto';

@ApiTags('Automation — Workflows')
@ApiBearerAuth()
@Controller('automation/workflows')
export class WorkflowsController {
  constructor(
    private readonly workflows: WorkflowsService,
    private readonly registry: NodeRegistryService,
  ) {}

  /** Catalogo de nos (paleta + modal declarativo do editor). */
  @Get('nodes/catalog')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_READ)
  nodesCatalog() {
    return this.registry.catalog();
  }

  @Get()
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspace_id') workspaceId?: string,
    @Query('environment_id') environmentId?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workflows.findAll(resolveOrganizationId(user, orgQuery), { workspaceId, environmentId });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_READ)
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workflows.findDetail(resolveOrganizationId(user, orgQuery), id);
  }

  @Get(':id/versions')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_READ)
  listVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workflows.listVersions(resolveOrganizationId(user, orgQuery), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkflowDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workflows.create(resolveOrganizationId(user, orgQuery), dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_WRITE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workflows.update(resolveOrganizationId(user, orgQuery), id, dto);
  }

  /** Salvar edicao = SEMPRE nova versao imutavel (diretriz 3). */
  @Post(':id/versions')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_WRITE)
  saveVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveVersionDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workflows.saveVersion(resolveOrganizationId(user, orgQuery), id, dto, user.sub);
  }

  /** Publicar OU rollback: aponta current_version pra versao indicada. */
  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_PUBLISH)
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PublishWorkflowDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workflows.publish(resolveOrganizationId(user, orgQuery), id, dto.version, user.sub);
  }

  @Post(':id/archive')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_WRITE)
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workflows.archive(resolveOrganizationId(user, orgQuery), id);
  }

  @Post(':id/webhook-token/rotate')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_PUBLISH)
  rotateWebhookToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workflows.rotateWebhookToken(resolveOrganizationId(user, orgQuery), id);
  }

  /** Execucao manual (input JSON + dry-run). A API so enfileira. */
  @Post(':id/execute')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_EXECUTE)
  execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ExecuteWorkflowDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workflows.executeManual(
      resolveOrganizationId(user, orgQuery),
      id,
      dto.input ?? {},
      dto.dry_run ?? false,
      user.sub,
    );
  }

  /** Export JSON versionado, SEM secrets (diretriz 29). */
  @Get(':id/export')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_READ)
  exportWorkflow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('version') version?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workflows.exportWorkflow(
      resolveOrganizationId(user, orgQuery),
      id,
      version ? Number(version) : undefined,
    );
  }

  @Post('import')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_WRITE)
  importWorkflow(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportWorkflowDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.workflows.importWorkflow(resolveOrganizationId(user, orgQuery), dto, user.sub);
  }
}
