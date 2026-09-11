// Acesso de dados da revisão de conteúdo (Checkpoint diffs de Assistentes).
// Multi-tenant: agente e fontes filtrados por organização.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import type { ContentReviewResult, ContentReviewSource } from './content-review.helpers';

export interface CreateReviewInput {
  organizationId: string;
  workspaceId: string;
  environmentId: string;
  agentId: string;
  traceId: string;
  createdBy: string | null;
  snapshot: Array<{ base_id: string; base_name: string; document_id: string; document_label: string }>;
}

export interface CompleteReviewInput {
  status: 'COMPLETED' | 'FAILED';
  result?: ContentReviewResult;
  providerKind?: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  costUsd?: number;
  error?: string;
}

@Injectable()
export class ContentReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAgent(organizationId: string, agentId: string) {
    return this.prisma.aiAgent.findFirst({
      where: { id: agentId, organization_id: organizationId },
      select: {
        id: true, name: true, is_active: true,
        organization_id: true, workspace_id: true, environment_id: true,
        knowledge_base_ids: true,
      },
    });
  }

  listReviews(organizationId: string, agentId: string, limit = 100) {
    return this.prisma.aiAgentContentReview.findMany({
      where: { organization_id: organizationId, agent_id: agentId },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
  }

  // Documentos prontos (texto extraído) das bases indicadas, só de bases ativas
  // e da própria organização. O rótulo do documento sai do source_ref/type.
  async listReadyDocuments(organizationId: string, baseIds: string[]): Promise<ContentReviewSource[]> {
    if (!baseIds.length) return [];
    const rows = await this.prisma.aiKnowledgeDocument.findMany({
      where: {
        organization_id: organizationId,
        base_id: { in: baseIds },
        status: 'READY',
        extracted_text: { not: null },
        base: { is_active: true },
      },
      select: {
        id: true,
        source_type: true,
        source_ref: true,
        extracted_text: true,
        base: { select: { id: true, name: true } },
      },
      orderBy: [{ base_id: 'asc' }, { created_at: 'asc' }],
    });
    return rows
      .map((row) => ({
        base_id: row.base.id,
        base_name: row.base.name,
        document_id: row.id,
        document_label: (row.source_ref || row.source_type || 'documento').slice(0, 160),
        content: String(row.extracted_text ?? '').trim(),
      }))
      .filter((row) => row.content.length > 0);
  }

  createReview(input: CreateReviewInput) {
    return this.prisma.aiAgentContentReview.create({
      data: {
        organization_id: input.organizationId,
        workspace_id: input.workspaceId,
        environment_id: input.environmentId,
        agent_id: input.agentId,
        status: 'PENDING',
        source_snapshot: input.snapshot as unknown as Prisma.InputJsonValue,
        analysis_trace_id: input.traceId,
        created_by: input.createdBy,
      },
    });
  }

  completeReview(id: string, input: CompleteReviewInput) {
    return this.prisma.aiAgentContentReview.update({
      where: { id },
      data: {
        status: input.status,
        result_json: input.result ? (input.result as unknown as Prisma.InputJsonValue) : undefined,
        provider_kind: input.providerKind,
        model: input.model,
        prompt_tokens: input.promptTokens,
        completion_tokens: input.completionTokens,
        total_tokens: input.totalTokens,
        cost_usd: input.costUsd,
        error: input.error,
        finished_at: new Date(),
      },
    });
  }
}
