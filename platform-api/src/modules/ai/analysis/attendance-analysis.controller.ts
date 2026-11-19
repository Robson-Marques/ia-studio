// Análise de atendimento (Checkpoint 1a). Leitura: ai.analysis.read; disparo
// da análise: ai.analysis.run (gasta IA). A conversa a analisar é escolhida pela
// UI; nada é enviado ao cliente nem alterado no atendimento.
import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { AttendanceAnalysisService } from './attendance-analysis.service';
import { AnalyzeChatDto } from './dto/attendance-analysis.dtos';

@ApiTags('IA — Análise de atendimento')
@ApiBearerAuth()
@Controller('ai/attendance-analysis')
export class AttendanceAnalysisController {
  constructor(private readonly analysis: AttendanceAnalysisService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AI_ANALYSIS_READ)
  list(
  ) {
    return this.analysis.list();
  }

  @Post('analyze-chat')
  @RequirePermissions(PERMISSIONS.AI_ANALYSIS_RUN)
  @ApiOperation({ summary: 'Analisa uma conversa e registra melhorias (IA/equipe)' })
  analyzeChat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AnalyzeChatDto,
  ) {
    return this.analysis.analyzeChat(dto.chat_id, { userId: user.sub });
  }
}
