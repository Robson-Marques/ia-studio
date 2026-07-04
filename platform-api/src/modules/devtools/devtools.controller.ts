// Controller do Console do Desenvolvedor (Fase 7 — diretriz 28). perm
// `devtools.use`. Mutations sensiveis auditadas (@Auditable — params redactados)
// e cada execucao via connection gera IntegrationLog no ConnectionsService.
import { Body, Controller, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../shared/permissions.constants';
import { CurrentUser } from '../../shared/auth/current-user.decorator';
import { AuthenticatedUser, RequestWithUser } from '../../shared/auth/auth.types';
import {
  resolveOrganizationId,
  getWorkspaceIdHeader,
  getEnvironmentIdHeader,
} from '../../shared/auth/tenant.util';
import { Auditable } from '../../shared/audit/auditable.decorator';
import { DevtoolsService } from './devtools.service';
import { ExecuteTestDto, SqlTestDto, HttpTestDto, AiTestDto, ToolTestDto } from './dto/devtools.dtos';

@ApiTags('Desenvolvedor — Console (Postman interno)')
@ApiBearerAuth()
@Controller('devtools')
export class DevtoolsController {
  constructor(private readonly devtools: DevtoolsService) {}

  @Post('execute')
  @RequirePermissions(PERMISSIONS.DEVTOOLS_USE)
  @Auditable({ action: 'devtools.execute', entityType: 'Devtools', captureParams: true })
  runExecute(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ExecuteTestDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.devtools.runExecute(resolveOrganizationId(user, orgQuery), dto);
  }

  @Post('sql')
  @RequirePermissions(PERMISSIONS.DEVTOOLS_USE)
  @Auditable({ action: 'devtools.sql', entityType: 'Devtools', captureParams: true })
  runSql(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SqlTestDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.devtools.runSql(resolveOrganizationId(user, orgQuery), dto);
  }

  @Post('http')
  @RequirePermissions(PERMISSIONS.DEVTOOLS_USE)
  @Auditable({ action: 'devtools.http', entityType: 'Devtools', captureParams: true, sensitiveFields: ['value', 'authorization'] })
  runHttp(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: HttpTestDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.devtools.runHttp(resolveOrganizationId(user, orgQuery), dto);
  }

  @Post('ai')
  @RequirePermissions(PERMISSIONS.DEVTOOLS_USE)
  @Auditable({ action: 'devtools.ai', entityType: 'Devtools', captureParams: true })
  runAi(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AiTestDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.devtools.runAi(resolveOrganizationId(user, orgQuery), dto);
  }

  @Post('tool')
  @RequirePermissions(PERMISSIONS.DEVTOOLS_USE)
  @Auditable({ action: 'devtools.tool', entityType: 'Devtools', captureParams: true })
  runTool(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: RequestWithUser,
    @Body() dto: ToolTestDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.devtools.runTool(resolveOrganizationId(user, orgQuery), dto, {
      workspaceId: getWorkspaceIdHeader(req),
      environmentId: getEnvironmentIdHeader(req),
    });
  }
}
