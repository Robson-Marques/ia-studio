// Acesso de dados da análise de atendimento local; a conversa é lida do módulo
// Comm na mesma instância dedicada.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import type { LearningSuggestion } from './attendance-analysis.helpers';

export interface CreateAnalysisInput {
  chatId: string;
  traceId: string;
  createdBy: string | null;
  suggestions: LearningSuggestion[];
}

@Injectable()
export class AttendanceAnalysisRepository {
  constructor(private readonly prisma: PrismaService) {}

  listAnalyses(limit = 200) {
    return this.prisma.aiAttendanceAnalysis.findMany({
      where: {},
      orderBy: { created_at: 'desc' },
      take: limit,
      include: { chat: { select: { id: true, contact_name: true } } },
    });
  }

  // Conversa + transcript para análise local; só mensagens
  // com texto (content != '') e as 80 mais recentes.
  findChatForAnalysis(chatId: string) {
    return this.prisma.whatsappChat.findUnique({
      where: { id: chatId },
      select: {
        id: true,
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
        chat_id: input.chatId,
        improvement_target: suggestion.improvement_target,
        content: suggestion.content,
        evidence: suggestion.evidence,
        source: 'MANUAL_ANALYSIS',
        analysis_trace_id: input.traceId,
        analyzed_at: new Date(),
        created_by: input.createdBy,
      })) as Prisma.AiAttendanceAnalysisCreateManyInput[],
    });
    return this.prisma.aiAttendanceAnalysis.findMany({
      where: { analysis_trace_id: input.traceId },
      orderBy: { created_at: 'asc' },
    });
  }
}
