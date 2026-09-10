// Acesso de dados da análise de atendimento (Checkpoint 1a). Multi-tenant: toda
// leitura filtra por organização; a conversa é lida do módulo Comm (mesma base).
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import type { LearningSuggestion } from './attendance-analysis.helpers';

export interface CreateAnalysisInput {
  organizationId: string;
  workspaceId: string;
  environmentId: string;
  chatId: string;
  traceId: string;
  createdBy: string | null;
  suggestions: LearningSuggestion[];
}

@Injectable()
export class AttendanceAnalysisRepository {
  constructor(private readonly prisma: PrismaService) {}

  listAnalyses(organizationId: string, environmentId?: string, limit = 200) {
    return this.prisma.aiAttendanceAnalysis.findMany({
      where: {
        organization_id: organizationId,
        ...(environmentId ? { environment_id: environmentId } : {}),
      },
      orderBy: { created_at: 'desc' },
      take: limit,
      include: { chat: { select: { id: true, contact_name: true } } },
    });
  }

  // Conversa + transcript para análise. Ownership por organização; só mensagens
  // com texto (content != '') e as 80 mais recentes.
  findChatForAnalysis(organizationId: string, chatId: string) {
    return this.prisma.whatsappChat.findFirst({
      where: { id: chatId, organization_id: organizationId },
      select: {
        id: true,
        organization_id: true,
        workspace_id: true,
        environment_id: true,
        contact_name: true,
        messages: {
          where: { content: { not: '' } },
          orderBy: { created_at: 'desc' },
          take: 80,
          select: { sender: true, type: true, content: true, created_at: true },
        },
      },
    });
  }

  async createSuggestions(input: CreateAnalysisInput) {
    if (!input.suggestions.length) return [];
    await this.prisma.aiAttendanceAnalysis.createMany({
      data: input.suggestions.map((suggestion) => ({
        organization_id: input.organizationId,
        workspace_id: input.workspaceId,
        environment_id: input.environmentId,
        chat_id: input.chatId,
        improvement_target: suggestion.improvement_target,
        content: suggestion.content,
        evidence: suggestion.evidence,
        source: 'MANUAL_ANALYSIS',
        analysis_trace_id: input.traceId,
        analyzed_at: new Date(),
        created_by: input.createdBy,
      })),
    });
    return this.prisma.aiAttendanceAnalysis.findMany({
      where: { analysis_trace_id: input.traceId },
      orderBy: { created_at: 'asc' },
    });
  }
}
