// Conexoes (Instances) — CRUD SEM DELETE (diretriz 52: conexao nunca e
// excluida, so muda de estado). Escopo de tenant via resolveOrganizationId
// + validacao de workspace/ambiente no service.
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { ConnectionsService } from './connections.service';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { UpdateConnectionStateDto } from './dto/update-connection-state.dto';
import { ExecuteOperationDto } from './dto/execute-operation.dto';

@ApiTags('Integrations — Connections')
@ApiBearerAuth()
@Controller('connections')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspace_id') workspaceId?: string,
    @Query('environment_id') environmentId?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.connections.findAll(resolveOrganizationId(user, orgQuery), {
      workspaceId,
      environmentId,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_READ)
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.connections.findById(resolveOrganizationId(user, orgQuery), id);
  }

  @Get(':id/logs')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_LOGS_READ)
  findLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('take') take?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.connections.findLogs(
      resolveOrganizationId(user, orgQuery),
      id,
      take ? Number(take) : undefined,
    );
  }

  @Post()
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateConnectionDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.connections.create(resolveOrganizationId(user, orgQuery), dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateConnectionDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.connections.update(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Patch(':id/state')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  changeState(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateConnectionStateDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.connections.changeState(resolveOrganizationId(user, orgQuery), id, dto.action);
  }

  @Post(':id/test')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  test(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.connections.test(resolveOrganizationId(user, orgQuery), id);
  }

  /** Schema Discovery — read-only; nada é persistido além de `last_sync_at`. */
  @Post(':id/discover')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_READ)
  discover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.connections.discover(resolveOrganizationId(user, orgQuery), id);
  }

  @Post(':id/execute')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_EXECUTE)
  execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ExecuteOperationDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.connections.execute(
      resolveOrganizationId(user, orgQuery),
      id,
      dto.operation,
      dto.params,
    );
  }
}
