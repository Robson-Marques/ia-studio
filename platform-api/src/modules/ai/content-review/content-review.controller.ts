// Revisão de conteúdo do assistente. Sob o mesmo prefixo dos agentes (rotas
// distintas). Ler: ai.agents.read; disparar (gasta IA): ai.agents.write.
import { Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { ContentReviewService } from './content-review.service';

@ApiTags('IA — Revisão de conteúdo')
@ApiBearerAuth()
@Controller('ai/agents')
export class ContentReviewController {
  constructor(private readonly reviews: ContentReviewService) {}

  @Get(':id/content-reviews')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_READ)
  list(
    @Param('id') id: string,
  ) {
    return this.reviews.list(id);
  }

  @Post(':id/content-reviews')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_WRITE)
  @ApiOperation({ summary: 'Compara as fontes do assistente e registra a revisão' })
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.reviews.review(id, { userId: user.sub });
  }

  @Get(':id/content-reviews/:reviewId/export')
  @RequirePermissions(PERMISSIONS.AI_AGENTS_READ)
  @ApiOperation({ summary: 'Baixa uma revisão já produzida (PDF ou TXT)' })
  async export(
    @Param('id') id: string,
    @Param('reviewId') reviewId: string,
    @Res() reply: FastifyReply,
    @Query('format') format?: string,
  ) {
    const fmt = format === 'txt' ? 'txt' : 'pdf';
    const out = await this.reviews.export(id, reviewId, fmt);
    return reply
      .header('Content-Type', out.contentType)
      .header('Content-Disposition', `attachment; filename="${out.filename}"`)
      .send(out.body);
  }
}
