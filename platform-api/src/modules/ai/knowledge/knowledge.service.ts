// Knowledge Service (RAG): CRUD de bases/documentos + ingestao (parse → chunk →
// embed) + query topK.
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
import { AuditLogService } from '../../../shared/audit/audit-log.service';
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
    private readonly audit: AuditLogService,
  ) {}

  // ─── Bases ──────────────────────────────────────────

  findBases() {
    return this.repository.findBases();
  }

  async findBase(id: string): Promise<AiKnowledgeBase> {
    const base = await this.repository.findBaseById(id);
    if (!base) throw new NotFoundException('Base de conhecimento não encontrada.');
    return base;
  }

  async findBaseDetail(id: string) {
    const base = await this.findBase(id);
    const documents = await this.repository.findDocuments(id);
    const query_logs = await this.repository.findQueryLogs(id, 20);
    return { ...base, documents, query_logs };
  }

  async createBase(dto: CreateKnowledgeBaseDto, createdBy: string | null) {

    const base = await this.repository.createBase({
      name: dto.name,
      description: dto.description,
      embedding_connection_id: dto.embedding_connection_id,
      embedding_model: dto.embedding_model ?? 'text-embedding-3-small',
      embedding_dim: dto.embedding_dim ?? 1536,
      chunk_size: dto.chunk_size ?? 800,
      chunk_overlap: dto.chunk_overlap ?? 120,
      created_by: createdBy,
    } as Prisma.AiKnowledgeBaseUncheckedCreateInput);
    await this.audit.record({
      action: 'ai.knowledge.base.create',
      entityType: 'AiKnowledgeBase',
      entityId: base.id,
      newValue: { name: base.name },
    });
    return base;
  }

  async updateBase(id: string, dto: UpdateKnowledgeBaseDto) {
    const before = await this.findBase(id);
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
      oldValue: { name: before.name, is_active: before.is_active },
      newValue: { name: base.name, is_active: base.is_active },
    });
    return base;
  }

  // ─── Documentos + ingestao ──────────────────────────

  async addDocument(
    baseId: string,
    dto: AddDocumentDto,
    createdBy: string | null,
  ): Promise<AiKnowledgeDocument> {
    const base = await this.findBase(baseId);
    const sourceType = dto.source_type as KnowledgeSourceType;

    const document = await this.repository.createDocument({
      base_id: base.id,
      source_type: sourceType,
      source_ref: dto.source_ref ?? dto.url ?? null,
      storage_file_id: dto.storage_file_id ?? null,
      status: 'PENDING',
      created_by: createdBy,
    } as Prisma.AiKnowledgeDocumentUncheckedCreateInput);

    // Ingestao inline (V1). Falha marca FAILED — nunca lanca pro caller alem
    // de validacao inicial.
    await this.ingest(base, document, dto).catch((e) => {
      this.logger.warn(`Ingestão do documento ${document.id} falhou: ${(e as Error).message}`);
    });

    await this.audit.record({
      action: 'ai.knowledge.document.add',
      entityType: 'AiKnowledgeDocument',
      entityId: document.id,
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
          .getContent(dto.storage_file_id)
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
    baseId: string,
    query: string,
    topK = 5,
    meta: { traceId?: string; agentId?: string } = {},
  ): Promise<RagContext> {
    const base = await this.repository.findBaseById(baseId);
    if (!base) throw new NotFoundException('Base de conhecimento não encontrada.');
    if (!query.trim()) throw new BadRequestException('Informe uma consulta.');
    const results = await this.embeddings.search(base, query, topK);
    const topScore = results.length > 0 ? results[0].score : 0;

    await this.repository
      .createQueryLog({
        base_id: base.id,
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
    baseIds: string[],
    query: string,
    topK = 5,
    meta: { traceId?: string; agentId?: string } = {},
  ): Promise<RagContext> {
    const all: RagContext['chunks'] = [];
    for (const baseId of baseIds) {
      try {
        const res = await this.query(baseId, query, topK, meta);
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
