// Agentes de IA — CRUD + versoes (draft/publish/rollback) + testar (execute) +
// export/import. Sem DELETE (agente e inativado, nunca excluido).
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
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
  findAll() {
    return this.agents.findAll();
  }

  // POST explícito: provisionamento é uma escrita, nunca efeito colateral de GET.
  @Post('native/ensure')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE)
  ensureNative(@CurrentUser() user: AuthenticatedUser) {
    return this.agents.ensureNativeAgent(user.sub);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_READ)
  findById(
    @Param('id') id: string,
  ) {
    return this.agents.findDetail(id);
  }

  @Get(':id/versions')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_READ)
  listVersions(
    @Param('id') id: string,
  ) {
    return this.agents.listVersions(id);
  }

  @Get(':id/runs')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_READ)
  listRuns(
    @Param('id') id: string,
  ) {
    return this.agents.listRuns(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAgentDto,
  ) {
    return this.agents.create(dto, user.sub, user);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agents.update(id, dto, user);
  }

  @Post(':id/versions')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE)
  saveVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveAgentVersionDto,
  ) {
    return this.agents.saveVersion(id, dto, user.sub);
  }

  @Post(':id/publish')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_PUBLISH)
  publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: PublishAgentDto,
  ) {
    return this.agents.publish(id, dto.version, user.sub);
  }

  @Post(':id/execute')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_EXECUTE)
  execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ExecuteAgentDto,
  ) {
    return this.agents.findById(id).then(() =>
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
    @Param('id') id: string,
  ) {
    return this.agents.exportAgent(id);
  }

  @Post('import')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE)
  importAgent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ImportAgentDto,
  ) {
    return this.agents.importAgent(dto, user.sub, user);
  }
}
