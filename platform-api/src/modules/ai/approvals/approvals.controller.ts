// Aprovacoes de IA (diretriz 31): listar aprovacoes pendentes/decididas, gerir
// politicas (criar/editar/ligar-desligar) e decidir (aprovar/rejeitar) acoes.
// Nao ha endpoint de create direto de aprovacao — ela nasce do ToolRuntime.
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AiApprovalStatus } from '@prisma/client';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { ApprovalsService } from './approvals.service';
import {
  CreateApprovalPolicyDto,
  DecideApprovalDto,
  UpdateApprovalPolicyDto,
} from './dto/approvals.dtos';

@ApiTags('IA — Aprovações')
@ApiBearerAuth()
@Controller('ai/approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  /** Lista aprovacoes de acao (filtro por status). */
  @Get()
  @RequirePermissions(PERMISSIONS.AI_APPROVALS_READ)
  listApprovals(
    @CurrentUser() user: AuthenticatedUser,
    @Query('status') status?: AiApprovalStatus,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.approvals.listApprovals(resolveOrganizationId(user, orgQuery), { status });
  }

  /** Lista politicas de aprovacao (filtro por workspace). */
  @Get('policies')
  @RequirePermissions(PERMISSIONS.AI_APPROVALS_READ)
  listPolicies(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspace_id') workspaceId?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.approvals.listPolicies(resolveOrganizationId(user, orgQuery), { workspaceId });
  }

  /** Cria uma politica de aprovacao (nasce OFF — diretriz 31). */
  @Post('policies')
  @RequirePermissions(PERMISSIONS.AI_APPROVALS_DECIDE)
  createPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApprovalPolicyDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.approvals.createPolicy(resolveOrganizationId(user, orgQuery), dto, user.sub);
  }

  /** Edita/liga/desliga uma politica de aprovacao. */
  @Patch('policies/:id')
  @RequirePermissions(PERMISSIONS.AI_APPROVALS_DECIDE)
  updatePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateApprovalPolicyDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.approvals.updatePolicy(resolveOrganizationId(user, orgQuery), id, dto);
  }

  /** Decide (aprovar/rejeitar) uma aprovacao pendente. */
  @Post(':id/decide')
  @RequirePermissions(PERMISSIONS.AI_APPROVALS_DECIDE)
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideApprovalDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.approvals.decide(resolveOrganizationId(user, orgQuery), id, {
      approve: dto.approve,
      decidedBy: user.sub,
      rejectReason: dto.reject_reason,
    });
  }
}
