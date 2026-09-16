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
    @Query('status') status?: AiApprovalStatus,
  ) {
    return this.approvals.listApprovals({ status });
  }

  /** Lista politicas de aprovacao (filtro por workspace). */
  @Get('policies')
  @RequirePermissions(PERMISSIONS.AI_APPROVALS_READ)
  listPolicies(
  ) {
    return this.approvals.listPolicies();
  }

  /** Cria uma politica de aprovacao (nasce OFF — diretriz 31). */
  @Post('policies')
  @RequirePermissions(PERMISSIONS.AI_APPROVALS_DECIDE)
  createPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApprovalPolicyDto,
  ) {
    return this.approvals.createPolicy(dto, user.sub);
  }

  /** Edita/liga/desliga uma politica de aprovacao. */
  @Patch('policies/:id')
  @RequirePermissions(PERMISSIONS.AI_APPROVALS_DECIDE)
  updatePolicy(
    @Param('id') id: string,
    @Body() dto: UpdateApprovalPolicyDto,
  ) {
    return this.approvals.updatePolicy(id, dto);
  }

  /** Decide (aprovar/rejeitar) uma aprovacao pendente. */
  @Post(':id/decide')
  @RequirePermissions(PERMISSIONS.AI_APPROVALS_DECIDE)
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: DecideApprovalDto,
  ) {
    return this.approvals.decide(id, {
      approve: dto.approve,
      decidedBy: user.sub,
      rejectReason: dto.reject_reason,
    });
  }
}
