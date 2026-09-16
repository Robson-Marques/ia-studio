// Trilha de auditoria (diretriz 18): quem, o que, quando, IP, user-agent,
// valor antigo → valor novo (diff), com redact de sensiveis.
// Nunca quebra o fluxo de negocio: falha de insert vira warning.
//
// Nota de arquitetura: este service E a porta unica de escrita na tabela
// core_audit_logs (papel de repository da infra de auditoria).
import { Injectable, Logger } from '@nestjs/common';
import { AuditStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getRequestStore } from './request-context';

const SENSITIVE_KEYS = ['password', 'password_hash', 'secret', 'token', 'api_key', 'client_secret'];

export interface AuditRecordInput {
  action: string;
  entityType: string;
  entityId?: string;
  /** @deprecated Durante S1 o valor e ignorado; o log pertence a instancia. */
  organizationId?: string | null;
  /** @deprecated Durante S1 o valor e ignorado; o log pertence a instancia. */
  workspaceId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  params?: unknown;
  status?: 'SUCCESS' | 'FAILURE';
  error?: string;
}

/** Redact recursivo de chaves sensiveis (nunca gravar segredo em log). */
export function redactSensitive(value: unknown, extraKeys: string[] = []): unknown {
  const keys = [...SENSITIVE_KEYS, ...extraKeys];
  const walk = (v: unknown): unknown => {
    if (v === null || v === undefined) return v;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'bigint') return v.toString();
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = keys.includes(k) ? '***' : walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(value);
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditRecordInput): Promise<void> {
    try {
      const store = getRequestStore();
      const actor = store?.actor;
      await this.prisma.auditLog.create({
        data: {
          actor_id: actor?.id ?? null,
          actor_email: actor?.email ?? null,
          action: input.action,
          entity_type: input.entityType,
          entity_id: input.entityId ?? null,
          status: input.status === 'FAILURE' ? AuditStatus.FAILURE : AuditStatus.SUCCESS,
          old_value: this.toJson(input.oldValue),
          new_value: this.toJson(input.newValue),
          params: this.toJson(
            input.error ? { ...this.asObject(input.params), error: input.error } : input.params,
          ),
          ip: store?.ip ?? null,
          user_agent: store?.userAgent ?? null,
          trace_id: store?.traceId ?? null,
        },
      });
    } catch (e) {
      this.logger.warn(`Falha ao gravar auditoria: ${(e as Error).message}`);
    }
  }

  private toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === undefined || value === null) return Prisma.JsonNull;
    return redactSensitive(value) as Prisma.InputJsonValue;
  }

  private asObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return value === undefined ? {} : { value };
  }
}
