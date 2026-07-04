// Dashboards consolidados (Fase 8). Read-only (diretriz 34).
//   * GET /console/dashboards/overview → visao global (Console/platform-admin).
//   * GET /dashboards/summary          → resumo org-scoped (painel do cliente).
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PlatformAdminOnly } from '../../shared/auth/platform-admin.guard';
import { RequirePermissions } from '../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../shared/permissions.constants';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../shared/auth/tenant.util';
import { DashboardsService } from './dashboards.service';

@ApiTags('Console — Dashboards')
@ApiBearerAuth()
@PlatformAdminOnly()
@Controller('console/dashboards')
export class ConsoleDashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Visão global da instância (orgs, execuções, IA, WhatsApp, e-mails, conexões, filas)' })
  overview() {
    return this.dashboards.overview();
  }
}

@ApiTags('Dashboards')
@ApiBearerAuth()
@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Get('summary')
  @RequirePermissions(PERMISSIONS.CORE_SETTINGS_READ)
  @ApiOperation({ summary: 'Resumo consolidado da organização (read-only)' })
  summary(@CurrentUser() user: AuthenticatedUser, @Query('organization_id') orgQuery?: string) {
    return this.dashboards.summary(resolveOrganizationId(user, orgQuery));
  }
}
