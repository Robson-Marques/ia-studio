// Agentes de IA — CRUD + versoes (draft/publish/rollback) + testar (execute) +
// export/import. Sem DELETE (agente e inativado, nunca excluido).
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { AgentsService } from './agents.service';
import { AgentRunnerService } from './agent-runner.service';
import {
  CreateAgentDto,
  ExecuteAgentDto,
  ImportAgentDto,
  PublishAgentDto,
  SaveAgentVersionDto,
  UpdateAgentDto,
} from './dto/agents.dtos';

@ApiTags('IA — Agentes')
@ApiBearerAuth()
@Controller('ai/agents')
export class AgentsController {
  constructor(
    private readonly agents: AgentsService,
    private readonly runner: AgentRunnerService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AI_AGENTS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspace_id') workspaceId?: string,
    @Query('environment_id') environmentId?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.agents.findAll(resolveOrganizationId(user, orgQuery), { workspaceId, environmentId });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_READ)
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.agents.findDetail(resolveOrganizationId(user, orgQuery), id);
  }

  @Get(':id/versions')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_READ)
  listVersions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.agents.listVersions(resolveOrganizationId(user, orgQuery), id);
  }

  @Get(':id/runs')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_READ)
  listRuns(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.agents.listRuns(resolveOrganizationId(user, orgQuery), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAgentDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.agents.create(resolveOrganizationId(user, orgQuery), dto, user.sub, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.agents.update(resolveOrganizationId(user, orgQuery), id, dto, user);
  }

  @Post(':id/versions')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE)
  saveVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveAgentVersionDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.agents.saveVersion(resolveOrganizationId(user, orgQuery), id, dto, user.sub);
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_PUBLISH)
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PublishAgentDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.agents.publish(resolveOrganizationId(user, orgQuery), id, dto.version, user.sub);
  }

  @Post(':id/execute')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_EXECUTE)
  execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ExecuteAgentDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    // Garante ownership (404 se de outra org) antes de rodar.
    return this.agents.findById(resolveOrganizationId(user, orgQuery), id).then(() =>
      this.runner.run({
        agentId: id,
        input: dto.input,
        dryRun: dto.dry_run ?? false,
        scopeKeys: dto.scope_keys,
        createdBy: user.sub,
      }),
    );
  }

  @Get(':id/export')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_READ)
  exportAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.agents.exportAgent(resolveOrganizationId(user, orgQuery), id);
  }

  @Post('import')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE)
  importAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportAgentDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.agents.importAgent(resolveOrganizationId(user, orgQuery), dto, user.sub, user);
  }
}
