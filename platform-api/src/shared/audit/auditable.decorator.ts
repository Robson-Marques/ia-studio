// Decorator simples de auditoria por metodo (versao enxuta do Aquapark).
// Para diffs old_value/new_value ricos, os services chamam
// AuditLogService.record() diretamente — este decorator cobre o caso base
// (acao + entidade + params redactados + SUCCESS/FAILURE).
//
// Uso:
//   @Auditable({ action: 'core.user.create', entityType: 'User', captureParams: true })
//   async create(dto: CreateUserDto) { ... }
import { AuditLogService, redactSensitive } from './audit-log.service';

interface AuditableOptions {
  action: string;
  entityType: string;
  captureParams?: boolean;
  sensitiveFields?: string[];
  extractEntityId?: (args: unknown[], result?: unknown) => string | undefined;
}

// Singleton resolvido no boot (AuditModule.onModuleInit) — decorators nao
// participam do DI do Nest.
let auditService: AuditLogService | null = null;
export function setAuditableAuditService(svc: AuditLogService): void {
  auditService = svc;
}

function idFromResult(result: unknown): string | undefined {
  if (result && typeof result === 'object' && 'id' in (result as Record<string, unknown>)) {
    const id = (result as Record<string, unknown>)['id'];
    if (typeof id === 'string') return id;
  }
  return undefined;
}

export function Auditable(opts: AuditableOptions): MethodDecorator {
  return function (_target, _propertyKey, descriptor: PropertyDescriptor) {
    const original = descriptor.value as (...args: unknown[]) => unknown;
    if (typeof original !== 'function') return descriptor;

    descriptor.value = async function (...args: unknown[]) {
      const params = opts.captureParams
        ? (redactSensitive(args, opts.sensitiveFields ?? []) as unknown)
        : undefined;
      try {
        const result = await Promise.resolve(original.apply(this, args));
        if (auditService) {
          await auditService
            .record({
              action: opts.action,
              entityType: opts.entityType,
              entityId: opts.extractEntityId?.(args, result) ?? idFromResult(result),
              params,
              status: 'SUCCESS',
            })
            .catch(() => undefined);
        }
        return result;
      } catch (err) {
        if (auditService) {
          await auditService
            .record({
              action: opts.action,
              entityType: opts.entityType,
              entityId: opts.extractEntityId?.(args),
              params,
              status: 'FAILURE',
              error: (err as Error).message,
            })
            .catch(() => undefined);
        }
        throw err;
      }
    };
    return descriptor;
  };
}
