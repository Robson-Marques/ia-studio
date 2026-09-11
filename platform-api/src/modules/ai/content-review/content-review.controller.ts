// Revisão de conteúdo do assistente. Sob o mesmo prefixo dos agentes (rotas
// distintas). Ler: ai.agents.read; disparar (gasta IA): ai.agents.write.
import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { ContentReviewService } from './content-review.service';

@ApiTags('IA — Revisão de conteúdo')
@ApiBearerAuth()
@Controller('ai/agents')
export class ContentReviewController {
  constructor(private readonly reviews: ContentReviewService) {}

  @Get(':id/content-reviews')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.reviews.list(resolveOrganizationId(user, orgQuery), id);
  }

  @Post(':id/content-reviews')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE)
  @ApiOperation({ summary: 'Compara as fontes do assistente e registra a revisão' })
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.reviews.review(resolveOrganizationId(user, orgQuery), id, { userId: user.sub });
  }
}
