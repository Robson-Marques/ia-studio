// Conexoes (Instances) — CRUD SEM DELETE (diretriz 52: conexao nunca e
// excluída, só muda de estado). A instância é o contexto operacional.
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
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
  ) {
    return this.connections.findAll();
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
