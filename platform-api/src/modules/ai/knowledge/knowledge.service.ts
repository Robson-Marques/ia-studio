// Knowledge Service (RAG): CRUD de bases/documentos + ingestao (parse → chunk →
// embed) + query topK. Limite 'ai_knowledge_bases' (Licensing) na criacao.
// Ingestao sincrona simplificada (V1): o documento vira READY ao fim; erros
// marcam FAILED. Storage via StorageService (PDF/DOCX).
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AiKnowledgeBase, AiKnowledgeDocument, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { KnowledgeRepository } from './knowledge.repository';
import { EmbeddingsService } from './embeddings.service';
import { chunkText } from './chunker';
import { parseSource, KnowledgeSourceType } from './parse-source';
import { StorageService } from '../../integration/storage/storage.service';
import { LimitsService } from '../../licensing/limits.service';
import { UsageService } from '../../licensing/usage.service';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { assertSameOrg, validateWorkspaceScope } from '../../../shared/auth/tenant.util';
import {
  AddDocumentDto,
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseDto,
} from './dto/knowledge.dtos';

export interface RagContext {
  chunks: Array<{ base_id: string; content: string; score: number }>;
  topScore: number;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly repository: KnowledgeRepository,
    private readonly embeddings: EmbeddingsService,
    private readonly storage: StorageService,
    private readonly limits: LimitsService,
    private readonly usage: UsageService,
    private readonly audit: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Bases ──────────────────────────────────────────

  findBases(organizationId: string, filters: { workspaceId?: string; environmentId?: string }) {
    return this.repository.findBases(organizationId, filters);
  }

  async findBase(organizationId: string, id: string): Promise<AiKnowledgeBase> {
    const base = await this.repository.findBaseById(id);
    if (!base) throw new NotFoundException('Base de conhecimento não encontrada.');
    assertSameOrg(base.organization_id, organizationId);
    return base;
  }

  async findBaseDetail(organizationId: string, id: string) {
    const base = await this.findBase(organizationId, id);
    const documents = await this.repository.findDocuments(id);
    const query_logs = await this.repository.findQueryLogs(id, 20);
    return { ...base, documents, query_logs };
  }

  async createBase(organizationId: string, dto: CreateKnowledgeBaseDto, createdBy: string | null) {
    await validateWorkspaceScope(this.prisma, organizationId, dto.workspace_id, dto.environment_id);
    const count = await this.repository.countBases(organizationId);
    await this.limits.assertCountWithin(organizationId, 'ai_knowledge_bases', count);

    const base = await this.repository.createBase({
      organization_id: organizationId,
      workspace_id: dto.workspace_id,
      environment_id: dto.environment_id,
      name: dto.name,
      description: dto.description,
      embedding_connection_id: dto.embedding_connection_id,
      embedding_model: dto.embedding_model ?? 'text-embedding-3-small',
      embedding_dim: dto.embedding_dim ?? 1536,
      chunk_size: dto.chunk_size ?? 800,
      chunk_overlap: dto.chunk_overlap ?? 120,
      created_by: createdBy,
    });
    await this.usage.increment(organizationId, dto.workspace_id, 'ai_knowledge_bases');
    await this.audit.record({
      action: 'ai.knowledge.base.create',
      entityType: 'AiKnowledgeBase',
      entityId: base.id,
      organizationId,
      workspaceId: dto.workspace_id,
      newValue: { name: base.name },
    });
    return base;
  }

  async updateBase(organizationId: string, id: string, dto: UpdateKnowledgeBaseDto) {
    const before = await this.findBase(organizationId, id);
    const data: Prisma.AiKnowledgeBaseUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.embedding_connection_id !== undefined) data.embedding_connection_id = dto.embedding_connection_id;
    if (dto.chunk_size !== undefined) data.chunk_size = dto.chunk_size;
    if (dto.chunk_overlap !== undefined) data.chunk_overlap = dto.chunk_overlap;
    if (dto.is_active !== undefined) data.is_active = dto.is_active;
    const base = await this.repository.updateBase(id, data);
    await this.audit.record({
      action: 'ai.knowledge.base.update',
      entityType: 'AiKnowledgeBase',
      entityId: id,
      organizationId,
      oldValue: { name: before.name, is_active: before.is_active },
      newValue: { name: base.name, is_active: base.is_active },
    });
    return base;
  }

  // ─── Documentos + ingestao ──────────────────────────

  async addDocument(
    organizationId: string,
    baseId: string,
    dto: AddDocumentDto,
    createdBy: string | null,
  ): Promise<AiKnowledgeDocument> {
    const base = await this.findBase(organizationId, baseId);
    const sourceType = dto.source_type as KnowledgeSourceType;

    const document = await this.repository.createDocument({
      base_id: base.id,
      organization_id: organizationId,
      source_type: sourceType,
      source_ref: dto.source_ref ?? dto.url ?? null,
      storage_file_id: dto.storage_file_id ?? null,
      status: 'PENDING',
      created_by: createdBy,
    });

    // Ingestao inline (V1). Falha marca FAILED — nunca lanca pro caller alem
    // de validacao inicial.
    await this.ingest(base, document, dto).catch((e) => {
      this.logger.warn(`Ingestão do documento ${document.id} falhou: ${(e as Error).message}`);
    });

    await this.audit.record({
      action: 'ai.knowledge.document.add',
      entityType: 'AiKnowledgeDocument',
      entityId: document.id,
      organizationId,
      newValue: { base_id: base.id, source_type: sourceType },
    });
    return this.repository.findDocumentById(document.id) as Promise<AiKnowledgeDocument>;
  }

  private async ingest(base: AiKnowledgeBase, document: AiKnowledgeDocument, dto: AddDocumentDto): Promise<void> {
    await this.repository.setDocumentStatus(document.id, 'PROCESSING');
    try {
      let buffer: Buffer | undefined;
      if (dto.storage_file_id) {
        const stored = await this.storage
          .getContent(base.organization_id, dto.storage_file_id)
          .catch(() => null);
        buffer = stored?.content;
      }
      const text = await parseSource({
        sourceType: document.source_type as KnowledgeSourceType,
        text: dto.text,
        url: dto.url,
        buffer,
      });
      if (!text.trim()) throw new Error('Nenhum texto extraído da fonte.');

      await this.repository.updateDocument(document.id, { extracted_text: text.slice(0, 200_000) });
      await this.repository.deleteChunksByDocument(document.id);

      const chunks = chunkText(text, base.chunk_size, base.chunk_overlap);
      const vectors = await this.embeddings.embed(base, chunks.map((c) => c.content));
      for (let i = 0; i < chunks.length; i += 1) {
        const created = await this.repository.createChunk({
          base_id: base.id,
          document_id: document.id,
          organization_id: base.organization_id,
          idx: chunks[i].idx,
          content: chunks[i].content,
          token_count: chunks[i].tokenCount,
        });
        const vector = vectors[i];
        if (vector && vector.length > 0) {
          await this.embeddings.storeChunkEmbedding(created.id, vector);
        }
      }
      await this.repository.setDocumentStatus(document.id, 'READY', null, chunks.length);
    } catch (e) {
      await this.repository.setDocumentStatus(document.id, 'FAILED', (e as Error).message);
      throw e;
    }
  }

  // ─── Query (RAG) ────────────────────────────────────

  async query(
    organizationId: string,
    baseId: string,
    query: string,
    topK = 5,
    meta: { traceId?: string; agentId?: string } = {},
  ): Promise<RagContext> {
    const base = await this.findBase(organizationId, baseId);
    if (!query.trim()) throw new BadRequestException('Informe uma consulta.');
    const results = await this.embeddings.search(base, query, topK);
    const topScore = results.length > 0 ? results[0].score : 0;

    await this.repository
      .createQueryLog({
        base_id: base.id,
        organization_id: organizationId,
        trace_id: meta.traceId ?? randomUUID(),
        agent_id: meta.agentId ?? null,
        query: query.slice(0, 2000),
        top_score: topScore,
        result_count: results.length,
      })
      .catch(() => undefined);

    return {
      chunks: results.map((r) => ({ base_id: base.id, content: r.content, score: r.score })),
      topScore,
    };
  }

  /** RAG multi-base (usado pelo AgentRunner com knowledge_base_ids). */
  async queryMulti(
    organizationId: string,
    baseIds: string[],
    query: string,
    topK = 5,
    meta: { traceId?: string; agentId?: string } = {},
  ): Promise<RagContext> {
    const all: RagContext['chunks'] = [];
    for (const baseId of baseIds) {
      try {
        const res = await this.query(organizationId, baseId, query, topK, meta);
        all.push(...res.chunks);
      } catch (e) {
        this.logger.warn(`RAG na base ${baseId} falhou: ${(e as Error).message}`);
      }
    }
    all.sort((a, b) => b.score - a.score);
    const chunks = all.slice(0, topK);
    return { chunks, topScore: chunks.length > 0 ? chunks[0].score : 0 };
  }
}
