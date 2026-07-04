// Embeddings + busca de similaridade (pgvector). Gera embedding via
// LlmProviderService.embedViaConnection; grava o vetor na coluna nativa
// `embedding` (vector) por SQL parametrizado E o espelho `embedding_json`
// (fallback). Busca por $queryRaw com o operador <=> (distancia cosseno).
// Se a extensao/coluna vetorial nao existir (dev sem pgvector), cai pro
// cosseno em aplicacao lendo embedding_json — mesma logica do Aquapark.
// O indice HNSW e criado por SQL idempotente no boot (protegido por try/catch).
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AiKnowledgeBase } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { KnowledgeRepository } from './knowledge.repository';
import { AiOrchestratorService } from '../orchestrator/ai-orchestrator.service';
import { LlmProviderService } from '../providers/llm-provider.service';

export interface SimilarChunk {
  id: string;
  document_id: string;
  content: string;
  score: number;
}

@Injectable()
export class EmbeddingsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmbeddingsService.name);
  /** Cache do suporte a pgvector no banco (evita SQL repetido). */
  private vectorSupported: boolean | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: KnowledgeRepository,
    private readonly orchestrator: AiOrchestratorService,
    private readonly llm: LlmProviderService,
  ) {}

  /** Boot: cria extensao + indice HNSW (idempotente). Nunca derruba o boot. */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector;');
      await this.prisma.$executeRawUnsafe(
        'CREATE INDEX IF NOT EXISTS ai_knowledge_chunks_embedding_hnsw ' +
          'ON ai_knowledge_chunks USING hnsw (embedding vector_cosine_ops);',
      );
      this.vectorSupported = true;
      this.logger.log('pgvector disponível — índice HNSW garantido.');
    } catch (e) {
      this.vectorSupported = false;
      this.logger.warn(
        `pgvector indisponível (${(e as Error).message}) — RAG usará fallback cosseno em aplicação (embedding_json).`,
      );
    }
  }

  /** Gera o embedding de textos usando a connection AI da base (ou orchestrator). */
  async embed(base: AiKnowledgeBase, input: string[]): Promise<number[][]> {
    if (input.length === 0) return [];
    const connectionId = base.embedding_connection_id
      ?? (await this.orchestrator.resolve({
        organizationId: base.organization_id,
        workspaceId: base.workspace_id,
        environmentId: base.environment_id,
      }, base.embedding_model)).connection.id;
    const { result } = await this.llm.embedViaConnection(
      base.organization_id,
      connectionId,
      base.embedding_model,
      input,
    );
    return result.embeddings;
  }

  /** Persiste o vetor de um chunk (nativo + espelho JSON). */
  async storeChunkEmbedding(chunkId: string, vector: number[]): Promise<void> {
    // Espelho JSON sempre grava (fallback garantido).
    await this.saveEmbeddingJson(chunkId, vector);
    if (this.vectorSupported !== false) {
      try {
        const literal = `[${vector.join(',')}]`;
        await this.prisma.$executeRawUnsafe(
          'UPDATE ai_knowledge_chunks SET embedding = $1::vector WHERE id = $2',
          literal,
          chunkId,
        );
      } catch (e) {
        this.logger.warn(`Falha ao gravar vetor nativo do chunk ${chunkId}: ${(e as Error).message}`);
      }
    }
  }

  private async saveEmbeddingJson(chunkId: string, vector: number[]): Promise<void> {
    await this.prisma.aiKnowledgeChunk.update({
      where: { id: chunkId },
      data: { embedding_json: vector },
    });
  }

  /** Busca topK chunks similares a uma query. */
  async search(base: AiKnowledgeBase, query: string, topK = 5): Promise<SimilarChunk[]> {
    const [queryVector] = await this.embed(base, [query]);
    if (!queryVector || queryVector.length === 0) return [];

    if (this.vectorSupported === true) {
      try {
        return await this.searchNative(base.id, queryVector, topK);
      } catch (e) {
        this.logger.warn(`Busca vetorial nativa falhou (${(e as Error).message}) — fallback JSON.`);
      }
    }
    return this.searchFallback(base.id, queryVector, topK);
  }

  private async searchNative(baseId: string, queryVector: number[], topK: number): Promise<SimilarChunk[]> {
    const literal = `[${queryVector.join(',')}]`;
    // <=> = distancia cosseno; score = 1 - distancia (maior = mais similar).
    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ id: string; document_id: string; content: string; distance: number }>
    >(
      'SELECT id, document_id, content, (embedding <=> $1::vector) AS distance ' +
        'FROM ai_knowledge_chunks ' +
        'WHERE base_id = $2 AND embedding IS NOT NULL ' +
        'ORDER BY embedding <=> $1::vector ASC LIMIT $3',
      literal,
      baseId,
      topK,
    );
    return rows.map((r) => ({
      id: r.id,
      document_id: r.document_id,
      content: r.content,
      score: 1 - Number(r.distance),
    }));
  }

  private async searchFallback(baseId: string, queryVector: number[], topK: number): Promise<SimilarChunk[]> {
    const chunks = await this.repository.findChunksForFallback(baseId);
    const scored: SimilarChunk[] = [];
    for (const c of chunks) {
      const vec = Array.isArray(c.embedding_json) ? (c.embedding_json as number[]) : null;
      if (!vec || vec.length === 0) continue;
      scored.push({
        id: c.id,
        document_id: c.document_id,
        content: c.content,
        score: cosineSimilarity(queryVector, vec),
      });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

/** Similaridade cosseno entre dois vetores. */
function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
