// Execution Monitor (diretriz 13) — filtros status/workflow/periodo/trace_id,
// detalhe com timeline por no, retry e cancel.
import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ExecutionStatus } from '@prisma/client';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { ExecutionsService } from './executions.service';

@ApiTags('Automation — Executions')
@ApiBearerAuth()
@Controller('automation/executions')
export class ExecutionsController {
  constructor(private readonly executions: ExecutionsService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUTOMATION_EXECUTIONS_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: ExecutionStatus,
    @Query('workflow_id') workflowId?: string,
    @Query('trace_id') traceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.executions.findAll(
      resolveOrganizationId(user, orgQuery),
      {
        status,
        workflowId,
        traceId,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      },
      take ? Number(take) : 25,
      skip ? Number(skip) : 0,
    );
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.AUTOMATION_EXECUTIONS_READ)
  findById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.executions.findById(resolveOrganizationId(user, orgQuery), id);
  }

  @Post(':id/retry')
  @RequirePermissions(PERMISSIONS.AUTOMATION_EXECUTIONS_RETRY)
  retry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.executions.retry(resolveOrganizationId(user, orgQuery), id, user.sub);
  }

  @Post(':id/cancel')
  @RequirePermissions(PERMISSIONS.AUTOMATION_EXECUTIONS_RETRY)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.executions.cancel(resolveOrganizationId(user, orgQuery), id);
  }
}
