// Controller da solucao ISP — Incidentes/Manutencao. Todo endpoint sensivel
// tem @RequirePermissions; mutations sensiveis (ativar/encerrar/disparar) sao
// auditadas no service via AuditLogService.
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IspIncidentStatus } from '@prisma/client';
import { RequirePermissions } from '../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../shared/permissions.constants';
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
    @Query('status') status?: string,
  ) {
    return this.incidents.findAll({
      status: (status as IspIncidentStatus) || undefined,
    });
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_READ)
  findOne(
    @Param('id') id: string,
  ) {
    return this.incidents.findOne(id);
  }

  @Get(':id/targets')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_READ)
  findTargets(
    @Param('id') id: string,
  ) {
    return this.incidents.findTargets(id);
  }

  @Get(':id/team-alerts')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_READ)
  findTeamAlerts(
    @Param('id') id: string,
  ) {
    return this.incidents.findTeamAlerts(id);
  }

  @Get(':id/dispatches')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_READ)
  findDispatches(
    @Param('id') id: string,
  ) {
    return this.incidents.findDispatches(id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_WRITE)
  create(
    @Body() dto: CreateIncidentDto,
  ) {
    return this.incidents.create(dto, null);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_WRITE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIncidentDto,
  ) {
    return this.incidents.update(id, dto);
  }

  @Post(':id/resolve-affected')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_WRITE)
  resolveAffected(
    @Param('id') id: string,
  ) {
    return this.incidents.resolveAffected(id);
  }

  @Patch(':id/targets')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_WRITE)
  updateTargets(
    @Param('id') id: string,
    @Body() dto: UpdateTargetsDto,
  ) {
    return this.incidents.updateTargets(id, dto);
  }

  @Post(':id/activate')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_ACTIVATE)
  activate(
    @Param('id') id: string,
    @Body() dto: DispatchIncidentDto,
  ) {
    return this.incidents.activate(id, dto);
  }

  @Post(':id/resolve')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_ACTIVATE)
  resolve(
    @Param('id') id: string,
    @Body() dto: DispatchIncidentDto,
  ) {
    return this.incidents.resolveIncident(id, dto);
  }

  @Post(':id/dispatch')
  @RequirePermissions(PERMISSIONS.ISP_INCIDENTS_DISPATCH)
  dispatch(
    @Param('id') id: string,
    @Body() dto: DispatchIncidentDto,
  ) {
    return this.incidents.dispatchIncident(id, dto);
  }
}
