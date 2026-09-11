// Revisão de conteúdo do assistente (porte do Aquapark, adaptado à arquitetura
// do IA Studio). Como no restante da IA daqui, o LLM nunca é chamado direto:
// resolvemos uma Connection de IA pelo Orchestrator e passamos pelo
// LlmProviderService. Só leitura das fontes; não executa ações nem conversa.
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AiProviderKind } from '@prisma/client';
import { ContentReviewRepository } from './content-review.repository';
import {
  buildContentReviewPrompt,
  CONTENT_REVIEW_SYSTEM_PROMPT,
  parseContentReviewResult,
} from './content-review.helpers';
import { AiOrchestratorService } from '../orchestrator/ai-orchestrator.service';
import { LlmProviderService, ResolvedLlmConnection } from '../providers/llm-provider.service';
import { CostsService } from '../costs/costs.service';
import { ContentReviewExportService, ContentReviewExportFormat } from './content-review-export.service';

const REVIEW_TEMPERATURE = 0.1;
const REVIEW_MAX_TOKENS = 5_000;
const MAX_SOURCE_CHARS = 100_000;

const DEFAULT_MODEL_BY_KIND: Partial<Record<AiProviderKind, string>> = {
  [AiProviderKind.OPENAI]: 'gpt-4o-mini',
  [AiProviderKind.ANTHROPIC]: 'claude-3-5-haiku',
  [AiProviderKind.GEMINI]: 'gemini-1.5-flash',
  [AiProviderKind.OLLAMA]: 'llama3',
};

type ReviewActor = { userId?: string };

@Injectable()
export class ContentReviewService {
  private readonly logger = new Logger(ContentReviewService.name);

  constructor(
    private readonly repository: ContentReviewRepository,
    private readonly orchestrator: AiOrchestratorService,
    private readonly llm: LlmProviderService,
    private readonly costs: CostsService,
    private readonly exporter: ContentReviewExportService,
  ) {}

  async list(organizationId: string, agentId: string) {
    const agent = await this.repository.findAgent(organizationId, agentId);
    if (!agent) throw new NotFoundException('Assistente não encontrado.');
    return this.repository.listReviews(organizationId, agentId);
  }

  // Exporta uma revisão já produzida (PDF/TXT). Não reexecuta a IA.
  async export(organizationId: string, agentId: string, reviewId: string, format: ContentReviewExportFormat) {
    const agent = await this.repository.findAgent(organizationId, agentId);
    if (!agent) throw new NotFoundException('Assistente não encontrado.');
    const review = await this.repository.findReview(organizationId, agentId, reviewId);
    if (!review) throw new NotFoundException('Revisão não encontrada para este assistente.');
    return this.exporter.build({
      agentName: agent.name,
      status: review.status,
      createdAt: review.created_at,
      finishedAt: review.finished_at,
      error: review.error,
      result: review.result_json,
      sources: review.source_snapshot,
    }, format);
  }

  async review(organizationId: string, agentId: string, actor?: ReviewActor) {
    const agent = await this.repository.findAgent(organizationId, agentId);
    if (!agent) throw new NotFoundException('Assistente não encontrado.');

    const baseIds = Array.from(new Set((agent.knowledge_base_ids || []).filter(Boolean)));
    if (baseIds.length === 0) {
      throw new BadRequestException('Este assistente não tem bases de conhecimento vinculadas para revisar.');
    }

    const sources = await this.repository.listReadyDocuments(organizationId, baseIds);
    if (sources.length < 2) {
      throw new BadRequestException('Vincule ao menos duas fontes prontas (documentos em bases de conhecimento do assistente) para comparar.');
    }
    const totalChars = sources.reduce((total, source) => total + source.content.length, 0);
    if (totalChars > MAX_SOURCE_CHARS) {
      throw new BadRequestException('As fontes vinculadas são extensas demais para uma única revisão. Separe o conteúdo em bases menores.');
    }

    const blocked = await this.costs.isBlocked(organizationId, agent.workspace_id).catch(() => false);
    if (blocked) {
      throw new BadRequestException('Orçamento de IA excedido — revisão bloqueada pela política ativa.');
    }

    const traceId = randomUUID();
    const snapshot = sources.map((s) => ({
      base_id: s.base_id,
      base_name: s.base_name,
      document_id: s.document_id,
      document_label: s.document_label,
    }));
    const review = await this.repository.createReview({
      organizationId,
      workspaceId: agent.workspace_id,
      environmentId: agent.environment_id,
      agentId,
      traceId,
      createdBy: actor?.userId ?? null,
      snapshot,
    });

    const resolved = await this.orchestrator.resolve(
      { organizationId, workspaceId: agent.workspace_id, environmentId: agent.environment_id },
      DEFAULT_MODEL_BY_KIND[AiProviderKind.OPENAI] as string,
    );
    const model = this.resolveModel(resolved);

    try {
      const result = await this.llm.chat(resolved, {
        model,
        messages: [
          { role: 'system', content: CONTENT_REVIEW_SYSTEM_PROMPT },
          { role: 'user', content: buildContentReviewPrompt(sources) },
        ],
        temperature: REVIEW_TEMPERATURE,
        maxTokens: REVIEW_MAX_TOKENS,
      });
      const parsed = parseContentReviewResult(result.content);

      await this.costs.record({
        organizationId,
        workspaceId: agent.workspace_id,
        environmentId: agent.environment_id,
        agentId,
        providerKind: result.providerKind,
        model,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        costUsd: result.costUsd,
        traceId,
      });

      return this.repository.completeReview(review.id, {
        status: 'COMPLETED',
        result: parsed,
        providerKind: result.providerKind,
        model,
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        costUsd: result.costUsd,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'erro desconhecido';
      this.logger.error(`Revisão de conteúdo do assistente ${agentId} falhou: ${reason}`);
      await this.repository.completeReview(review.id, {
        status: 'FAILED',
        model,
        error: reason.slice(0, 1800),
      }).catch(() => undefined);
      throw new BadRequestException('Não foi possível concluir a revisão por IA. Verifique a conexão de IA e tente novamente.');
    }
  }

  private resolveModel(resolved: ResolvedLlmConnection): string {
    const cfg = (resolved.connection.config ?? {}) as Record<string, unknown>;
    const configured = typeof cfg['default_model'] === 'string' && cfg['default_model']
      ? String(cfg['default_model'])
      : typeof cfg['model'] === 'string' && cfg['model']
        ? String(cfg['model'])
        : null;
    return configured ?? DEFAULT_MODEL_BY_KIND[resolved.kind] ?? 'gpt-4o-mini';
  }
}
