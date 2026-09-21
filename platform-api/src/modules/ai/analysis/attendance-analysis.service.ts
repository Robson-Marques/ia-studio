// Análise de atendimento (Checkpoint 1a). Diferença central vs. Aquapark: aqui o
// LLM NUNCA é chamado direto — resolvemos uma Connection de IA (Provider Registry
// + Cofre) pelo Orchestrator e passamos pelo LlmProviderService. Sem provider/
// modelo fixo: o modelo vem da conexão (config) ou de um default por tipo. Roda
// só sob pedido explícito de uma pessoa; não envia mensagem nem altera cadastro.
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AiProviderKind } from '@prisma/client';
import { AttendanceAnalysisRepository } from './attendance-analysis.repository';
import {
  buildLearningAnalysisPrompt,
  LEARNING_ANALYSIS_SYSTEM_PROMPT,
  parseLearningAnalysis,
} from './attendance-analysis.helpers';
import { AiOrchestratorService } from '../orchestrator/ai-orchestrator.service';
import { LlmProviderService, ResolvedLlmConnection } from '../providers/llm-provider.service';

const ANALYSIS_TEMPERATURE = 0.1;
const ANALYSIS_MAX_TOKENS = 2_000;

// Modelo default por tipo de provedor quando a conexão não fixa um. Escolhidos
// baratos e presentes na tabela de preços (para o custo ser contabilizado).
const DEFAULT_MODEL_BY_KIND: Partial<Record<AiProviderKind, string>> = {
  [AiProviderKind.OPENAI]: 'gpt-4o-mini',
  [AiProviderKind.ANTHROPIC]: 'claude-3-5-haiku',
};

type AnalysisActor = { userId?: string };

@Injectable()
export class AttendanceAnalysisService {
  private readonly logger = new Logger(AttendanceAnalysisService.name);

  constructor(
    private readonly repository: AttendanceAnalysisRepository,
    private readonly orchestrator: AiOrchestratorService,
    private readonly llm: LlmProviderService,
  ) {}

  list() {
    return this.repository.listAnalyses();
  }

  async analyzeChat(chatId: string, actor?: AnalysisActor) {
    const chat = await this.repository.findChatForAnalysis(chatId);
    if (!chat) throw new NotFoundException('Conversa não encontrada.');

    // O transcript vem em ordem desc do banco; a análise trabalha em ordem
    // cronológica. Exige ao menos duas mensagens de texto reais.
    const messages = Array.isArray(chat.messages) ? [...chat.messages].reverse() : [];
    if (messages.filter((m) => String(m.content ?? '').trim()).length < 2) {
      throw new BadRequestException('Escolha uma conversa com ao menos duas mensagens de texto para analisar.');
    }

    // Resolve a conexão de IA local por prioridade; o modelo sai da conexão
    // ou do default por tipo. O 2º arg de resolve() é só dica de custo.
    const resolved = await this.orchestrator.resolve(DEFAULT_MODEL_BY_KIND[AiProviderKind.OPENAI] as string);
    const model = this.resolveAnalysisModel(resolved);

    const traceId = randomUUID();
    try {
      const result = await this.llm.chat(resolved, {
        model,
        messages: [
          { role: 'system', content: LEARNING_ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: buildLearningAnalysisPrompt(messages) },
        ],
        temperature: ANALYSIS_TEMPERATURE,
        maxTokens: ANALYSIS_MAX_TOKENS,
      });

      const suggestions = parseLearningAnalysis(result.content);
      const created = await this.repository.createSuggestions({
        chatId: chat.id,
        traceId,
        createdBy: actor?.userId ?? null,
        suggestions,
      });

      return { trace_id: traceId, chat_id: chat.id, contact_name: chat.contact_name, suggestions: created };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.error(`Não foi possível analisar a conversa ${chatId}: ${reason}`);
      if (error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      throw new BadRequestException('Não foi possível concluir a análise por IA. Verifique a conexão de IA e tente novamente.');
    }
  }

  // Modelo: o configurado na conexão (config.default_model | config.model), ou
  // o default por tipo de provedor. Nunca acopla a um provedor específico.
  private resolveAnalysisModel(resolved: ResolvedLlmConnection): string {
    const cfg = (resolved.connection.config ?? {}) as Record<string, unknown>;
    const configured = typeof cfg['default_model'] === 'string' && cfg['default_model']
      ? String(cfg['default_model'])
      : typeof cfg['model'] === 'string' && cfg['model']
        ? String(cfg['model'])
        : null;
    return configured ?? DEFAULT_MODEL_BY_KIND[resolved.kind] ?? 'gpt-4o-mini';
  }
}
