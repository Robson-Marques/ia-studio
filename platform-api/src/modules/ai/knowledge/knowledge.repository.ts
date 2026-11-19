// Porta unica ao banco RAG (ai_knowledge_bases/documents/chunks/query_logs).
// Busca vetorial por $queryRaw (operador <=> do pgvector) fica no
// EmbeddingsService; aqui so o CRUD e leituras simples.
import { Injectable } from '@nestjs/common';
import { AiKnowledgeDocStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class KnowledgeRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Bases ──────────────────────────────────────────

  findBases() {
    return this.prisma.aiKnowledgeBase.findMany({ where: {}, orderBy: { created_at: 'desc' } });
  }

  findBaseById(id: string) {
    return this.prisma.aiKnowledgeBase.findUnique({ where: { id } });
  }

  createBase(data: Prisma.AiKnowledgeBaseUncheckedCreateInput) {
    return this.prisma.aiKnowledgeBase.create({ data });
  }

  updateBase(id: string, data: Prisma.AiKnowledgeBaseUpdateInput) {
    return this.prisma.aiKnowledgeBase.update({ where: { id }, data });
  }

  // ─── Documentos ─────────────────────────────────────

  findDocuments(baseId: string) {
    return this.prisma.aiKnowledgeDocument.findMany({
      where: { base_id: baseId },
      orderBy: { created_at: 'desc' },
    });
  }

  findDocumentById(id: string) {
    return this.prisma.aiKnowledgeDocument.findUnique({ where: { id } });
  }

  createDocument(data: Prisma.AiKnowledgeDocumentUncheckedCreateInput) {
    return this.prisma.aiKnowledgeDocument.create({ data });
  }

  updateDocument(id: string, data: Prisma.AiKnowledgeDocumentUpdateInput) {
    return this.prisma.aiKnowledgeDocument.update({ where: { id }, data });
  }

  setDocumentStatus(id: string, status: AiKnowledgeDocStatus, error?: string | null, chunkCount?: number) {
    const data: Prisma.AiKnowledgeDocumentUpdateInput = { status };
    if (error !== undefined) data.error = error;
    if (chunkCount !== undefined) data.chunk_count = chunkCount;
    return this.prisma.aiKnowledgeDocument.update({ where: { id }, data });
  }

  // ─── Chunks ─────────────────────────────────────────

  deleteChunksByDocument(documentId: string) {
    return this.prisma.aiKnowledgeChunk.deleteMany({ where: { document_id: documentId } });
  }

  createChunk(data: Prisma.AiKnowledgeChunkUncheckedCreateInput) {
    return this.prisma.aiKnowledgeChunk.create({ data });
  }

  /** Chunks com embedding_json (fallback cosseno em aplicacao). */
  findChunksForFallback(baseId: string) {
    return this.prisma.aiKnowledgeChunk.findMany({
      where: { base_id: baseId },
      select: { id: true, document_id: true, content: true, embedding_json: true, idx: true },
    });
  }

  // ─── Query logs ─────────────────────────────────────

  createQueryLog(data: Prisma.AiKnowledgeQueryLogUncheckedCreateInput) {
    return this.prisma.aiKnowledgeQueryLog.create({ data });
  }

  findQueryLogs(baseId: string, take = 50) {
    return this.prisma.aiKnowledgeQueryLog.findMany({
      where: { base_id: baseId },
      orderBy: { created_at: 'desc' },
      take,
    });
  }
}
