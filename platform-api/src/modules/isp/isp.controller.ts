// Controller da solucao ISP — Incidentes/Manutencao. Todo endpoint sensivel
// tem @RequirePermissions; mutations sensiveis (ativar/encerrar/disparar) sao
// auditadas no service via AuditLogService.
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IspIncidentStatus } from '@prisma/client';
import { RequirePermissions } from '../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../shared/permissions.constants';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../shared/auth/tenant.util';
import { IspIncidentsService } from './isp-incidents.service';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
  UpdateTargetsDto,
  DispatchIncidentDto,
} from './dto/incidents.dtos';

@ApiTags('ISP — Incidentes/Manutenção')
@ApiBearerAuth()
@Controller('isp/incidents')
export class IspController {
  constructor(private readonly incidents: IspIncidentsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspace_id') workspaceId?: string,
    @Query('environment_id') environmentId?: string,
    @Query('status') status?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.incidents.findAll(resolveOrganizationId(user, orgQuery), {
      workspaceId: workspaceId || undefined,
      environmentId: environmentId || undefined,
      status: (status as IspIncidentStatus) || undefined,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_READ)
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.incidents.findOne(resolveOrganizationId(user, orgQuery), id);
  }

  @Get(':id/targets')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_READ)
  findTargets(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.incidents.findTargets(resolveOrganizationId(user, orgQuery), id);
  }

  @Get(':id/dispatches')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_READ)
  findDispatches(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.incidents.findDispatches(resolveOrganizationId(user, orgQuery), id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateIncidentDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.incidents.create(resolveOrganizationId(user, orgQuery), dto, user.sub ?? null);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_WRITE)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateIncidentDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.incidents.update(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Post(':id/resolve-affected')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_WRITE)
  resolveAffected(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.incidents.resolveAffected(resolveOrganizationId(user, orgQuery), id);
  }

  @Patch(':id/targets')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_WRITE)
  updateTargets(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTargetsDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.incidents.updateTargets(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Post(':id/activate')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_ACTIVATE)
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DispatchIncidentDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.incidents.activate(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Post(':id/resolve')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_ACTIVATE)
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DispatchIncidentDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.incidents.resolveIncident(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Post(':id/dispatch')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_DISPATCH)
  dispatch(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DispatchIncidentDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.incidents.dispatchIncident(resolveOrganizationId(user, orgQuery), id, dto);
  }
}
