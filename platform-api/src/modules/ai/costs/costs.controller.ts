// Custos e orcamentos de IA — resumo agregado, CRUD de orcamentos e simulador.
// Leitura exige ai.costs.read; gerir orcamento exige ai.costs.manage.
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { CostsService } from './costs.service';
import { CreateBudgetDto, SimulateCostDto, UpdateBudgetDto } from './dto/costs.dtos';

@ApiTags('AI — Costs')
@ApiBearerAuth()
@Controller('ai/costs')
export class CostsController {
  constructor(private readonly costs: CostsService) {}

  /** Resumo agregado: totais, por provider e por agente. */
  @Get('summary')
  @RequirePermissions(PERMISSIONS.AI_COSTS_READ)
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('period') period?: string,
    @Query('workspace_id') workspaceId?: string,
    @Query('agent_id') agentId?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.costs.summary(resolveOrganizationId(user, orgQuery), { period, workspaceId, agentId });
  }

  @Get('budgets')
  @RequirePermissions(PERMISSIONS.AI_COSTS_READ)
  listBudgets(
    @CurrentUser() user: AuthenticatedUser,
    @Query('workspace_id') workspaceId?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.costs.listBudgets(resolveOrganizationId(user, orgQuery), { workspaceId });
  }

  @Post('budgets')
  @RequirePermissions(PERMISSIONS.AI_COSTS_MANAGE)
  createBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBudgetDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.costs.createBudget(resolveOrganizationId(user, orgQuery), dto, user.sub);
  }

  @Patch('budgets/:id')
  @RequirePermissions(PERMISSIONS.AI_COSTS_MANAGE)
  updateBudget(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBudgetDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.costs.updateBudget(resolveOrganizationId(user, orgQuery), id, dto);
  }

  /** Simulador (diretriz 27): estima custo sem chamar o LLM. */
  @Post('simulate')
  @RequirePermissions(PERMISSIONS.AI_COSTS_READ)
  simulate(@Body() dto: SimulateCostDto) {
    return this.costs.simulate(dto);
  }
}
