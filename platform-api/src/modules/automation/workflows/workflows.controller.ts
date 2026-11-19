// Fluxos de automacao — CRUD + versoes + publicar/rollback + executar +
// export/import. Sem DELETE: fluxo e arquivado, nunca excluido.
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
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
  ) {
    return this.workflows.findAll();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_READ)
  findById(
    @Param('id') id: string,
  ) {
    return this.workflows.findDetail(id);
  }

  @Get(':id/versions')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_READ)
  listVersions(
    @Param('id') id: string,
  ) {
    return this.workflows.listVersions(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWorkflowDto,
  ) {
    return this.workflows.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_WRITE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDto,
  ) {
    return this.workflows.update(id, dto);
  }

  /** Salvar edicao = SEMPRE nova versao imutavel (diretriz 3). */
  @Post(':id/versions')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_WRITE)
  saveVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveVersionDto,
  ) {
    return this.workflows.saveVersion(id, dto, user.sub);
  }

  /** Publicar OU rollback: aponta current_version pra versao indicada. */
  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_PUBLISH)
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PublishWorkflowDto,
  ) {
    return this.workflows.publish(id, dto.version, user.sub);
  }

  @Post(':id/archive')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_WRITE)
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.workflows.archive(id);
  }

  /** Despublicar: volta a DRAFT (para os gatilhos) mantendo o fluxo visível.
   *  É o "desligar" do toggle de autoresposta. */
  @Post(':id/unpublish')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_PUBLISH)
  unpublish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.workflows.unpublish(id, user.sub);
  }

  /** Exclusão definitiva (arquivar guarda; excluir remove de vez). */
  @Delete(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_WRITE)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.workflows.remove(id);
  }

  @Post(':id/webhook-token/rotate')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_PUBLISH)
  rotateWebhookToken(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.workflows.rotateWebhookToken(id);
  }

  /** Execucao manual (input JSON + dry-run). A API so enfileira. */
  @Post(':id/execute')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_EXECUTE)
  execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ExecuteWorkflowDto,
  ) {
    return this.workflows.executeManual(
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
  ) {
    return this.workflows.exportWorkflow(id, version ? Number(version) : undefined);
  }

  @Post('import')
  @RequirePermissions(PERMISSIONS.AUTOMATION_WORKFLOWS_WRITE)
  importWorkflow(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportWorkflowDto,
  ) {
    return this.workflows.importWorkflow(dto, user.sub);
  }
}
