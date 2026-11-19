// Regras de colaboracao entre agentes de IA — listar/criar/editar.
// Sem DELETE: regra e desativada (is_active), nunca excluida.
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { CollaborationService } from './collaboration.service';
import { CreateCollaborationRuleDto, UpdateCollaborationRuleDto } from './dto/collaboration.dtos';

@ApiTags('AI — Collaboration')
@ApiBearerAuth()
@Controller('ai/collaboration')
export class CollaborationController {
  constructor(private readonly collaboration: CollaborationService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AI_AGENTS_READ)
  list(
    @Query('principal_agent_id') principalAgentId?: string,
  ) {
    return this.collaboration.list({ principalAgentId });
  }

  @Post()
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCollaborationRuleDto,
  ) {
    return this.collaboration.create(dto, user.sub);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCollaborationRuleDto,
  ) {
    return this.collaboration.update(id, dto);
  }
}
