// Conexoes (Instances) — CRUD SEM DELETE (diretriz 52: conexao nunca e
// excluída, só muda de estado). A instância é o contexto operacional.
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { ConnectionsService } from './connections.service';
import { CodexCliService } from '../registry/providers/codex-cli.service';
import { BadRequestException } from '@nestjs/common';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { UpdateConnectionStateDto } from './dto/update-connection-state.dto';
import { ExecuteOperationDto } from './dto/execute-operation.dto';

@ApiTags('Integrations — Connections')
@ApiBearerAuth()
@Controller('connections')
export class ConnectionsController {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly codexCli: CodexCliService,
  ) {}

  private async checkCodexConnection(id: string) {
    const connection = await this.connections.findById(id);
    if (connection.provider_key !== 'codex-cli') {
      throw new BadRequestException('Esta conexão não é do Codex CLI.');
    }
  }

  @Get(':id/codex-login')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  async codexLoginStatus(@Param('id') id: string) {
    await this.checkCodexConnection(id);
    return this.codexCli.status(id);
  }

  @Post(':id/codex-login')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  async codexLoginStart(@Param('id') id: string) {
    await this.checkCodexConnection(id);
    return this.codexCli.beginLogin(id);
  }

  @Post(':id/codex-login/cancel')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  async codexLoginCancel(@Param('id') id: string) {
    await this.checkCodexConnection(id);
    return this.codexCli.cancelLogin(id);
  }

  @Post(':id/codex-repair')
  @RequirePermissions(PERMISSIONS.SYSTEM_MAINTAIN)
  async codexRepair(@Param('id') id: string) {
    await this.checkCodexConnection(id);
    return this.codexCli.repair(id);
  }

  @Post(':id/codex-reconnect')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  async codexReconnect(@Param('id') id: string) {
    await this.checkCodexConnection(id);
    return this.codexCli.reconnect(id);
  }

  @Post(':id/archive')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  archiveCodex(@Param('id') id: string) {
    return this.connections.archiveCodex(id);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_READ)
  findAll(
  ) {
    return this.connections.findAll();
  }

  @Get('providers')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_READ)
  listAvailableProviders() {
    return this.connections.listAvailableProviders();
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_READ)
  findById(
    @Param('id') id: string,
  ) {
    return this.connections.findById(id);
  }

  @Get(':id/logs')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_LOGS_READ)
  findLogs(
    @Param('id') id: string,
    @Query('take') take?: string,
  ) {
    return this.connections.findLogs(id, take ? Number(take) : undefined);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConnectionDto,
  ) {
    return this.connections.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateConnectionDto,
  ) {
    return this.connections.update(id, dto);
  }

  @Patch(':id/state')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  changeState(
    @Param('id') id: string,
    @Body() dto: UpdateConnectionStateDto,
  ) {
    return this.connections.changeState(id, dto.action);
  }

  @Post(':id/test')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  test(
    @Param('id') id: string,
  ) {
    return this.connections.test(id);
  }

  /** Schema Discovery — read-only; nada é persistido além de `last_sync_at`. */
  @Post(':id/discover')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_READ)
  discover(
    @Param('id') id: string,
  ) {
    return this.connections.discover(id);
  }

  @Post(':id/execute')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_EXECUTE)
  execute(
    @Param('id') id: string,
    @Body() dto: ExecuteOperationDto,
  ) {
    return this.connections.execute(id, dto.operation, dto.params);
  }
}
