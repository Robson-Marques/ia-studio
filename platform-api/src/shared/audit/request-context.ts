// Contexto de requisicao via AsyncLocalStorage (portado do Aquapark).
// Permite que AuditLogService/@Auditable saibam QUEM fez a operacao sem
// carregar o request por parametro em todo service.
import { AsyncLocalStorage } from 'async_hooks';
import { ActorType } from '../auth/auth.types';

export interface RequestActor {
  id?: string;
  email?: string;
  actorType?: ActorType;
  organizationId?: string | null;
  profileId?: string | null;
}

export interface RequestStore {
  actor: RequestActor;
  ip?: string;
  userAgent?: string;
  workspaceId?: string;
  environmentId?: string;
  traceId?: string;
}

export const requestStorage = new AsyncLocalStorage<RequestStore>();

export function getRequestActor(): RequestActor | undefined {
  return requestStorage.getStore()?.actor;
}

export function getRequestMeta(): { ip?: string; userAgent?: string } | undefined {
  const s = requestStorage.getStore();
  if (!s) return undefined;
  return { ip: s.ip, userAgent: s.userAgent };
}

export function getRequestStore(): RequestStore | undefined {
  return requestStorage.getStore();
}
