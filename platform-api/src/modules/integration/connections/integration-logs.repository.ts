// Porta unica de escrita/leitura do log de integracao (diretriz 55 —
// natureza propria, separado de audit/application logs).
import { Injectable, Logger } from '@nestjs/common';
import { IntegrationDirection, IntegrationLogStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface IntegrationLogInput {
  connectionId: string;
  direction: IntegrationDirection;
  operation: string;
  status: IntegrationLogStatus;
  durationMs?: number;
  requestMeta?: unknown;
  responseMeta?: unknown;
  error?: string;
  traceId?: string | null;
}

@Injectable()
export class IntegrationLogsRepository {
  private readonly logger = new Logger(IntegrationLogsRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Nunca lanca — log de integracao nao pode derrubar a operacao. */
  async record(input: IntegrationLogInput): Promise<void> {
    try {
      await this.prisma.integrationLog.create({
        data: {
          connection_id: input.connectionId,
          direction: input.direction,
          operation: input.operation,
          status: input.status,
          duration_ms: input.durationMs ?? null,
          request_meta: this.toJson(input.requestMeta),
          response_meta: this.toJson(input.responseMeta),
          error: input.error ?? null,
          trace_id: input.traceId ?? null,
        },
      });
    } catch (e) {
      this.logger.warn(`Falha ao gravar log de integração: ${(e as Error).message}`);
    }
  }

  findByConnection(connectionId: string, take = 50) {
    return this.prisma.integrationLog.findMany({
      where: { connection_id: connectionId },
      orderBy: { created_at: 'desc' },
      take: Math.min(Math.max(take, 1), 200),
    });
  }

  private toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }
}
