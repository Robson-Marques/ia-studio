// Dashboard dedicado (read-only). O painel local consulta o resumo da própria
// instalação; não há agregação por organizações.
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../shared/permissions.constants';
import { DashboardsService } from './dashboards.service';

@ApiTags('Dashboards')
@ApiBearerAuth()
@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.CORE_SETTINGS_READ)
  @ApiOperation({ summary: 'Resumo consolidado da instalação (read-only)' })
  summary() {
    return this.dashboards.summary();
  }
}
