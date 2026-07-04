// Escopo de tenant — REGRA DE OURO da plataforma:
//   * Ator 'org': TODA query filtra por organization_id do JWT (nunca do input).
//   * Ator 'platform' (Console): pode indicar a org por query `organization_id`
//     nos endpoints /console/*.
//   * Headers opcionais `x-workspace-id` / `x-environment-id` indicam o escopo
//     operacional — SEMPRE validados contra a org (validateWorkspaceScope).
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser, RequestWithUser } from './auth.types';

/** Le um header simples (primeiro valor se vier lista). */
export function headerValue(req: RequestWithUser, name: string): string | undefined {
  const raw = req.headers?.[name];
  if (raw === undefined) return undefined;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && v.trim() !== '' ? v.trim() : undefined;
}

export function getWorkspaceIdHeader(req: RequestWithUser): string | undefined {
  return headerValue(req, 'x-workspace-id');
}

export function getEnvironmentIdHeader(req: RequestWithUser): string | undefined {
  return headerValue(req, 'x-environment-id');
}

/**
 * Resolve a organization do request.
 * - Usuario de org: sempre a org do JWT (query e ignorada).
 * - Platform admin: exige `organization_id` na query (Console operando uma org).
 */
export function resolveOrganizationId(user: AuthenticatedUser, queryOrgId?: string): string {
  if (user.is_platform_admin) {
    if (!queryOrgId) {
      throw new BadRequestException('Informe organization_id na query (ator de plataforma).');
    }
    return queryOrgId;
  }
  if (!user.organization_id) {
    throw new ForbiddenException('Usuário sem organização vinculada.');
  }
  return user.organization_id;
}

/** Garante que a entidade pertence a org do ator — 404 pra nao vazar existencia. */
export function assertSameOrg(entityOrgId: string | null | undefined, orgId: string): void {
  if (entityOrgId !== orgId) {
    throw new NotFoundException('Registro não encontrado.');
  }
}

export interface TenantScope {
  organizationId: string;
  workspaceId?: string;
  environmentId?: string;
}

/**
 * Valida os headers x-workspace-id / x-environment-id contra a organization.
 * Header invalido (workspace de outra org, ambiente de outro workspace) → 400.
 */
export async function validateWorkspaceScope(
  prisma: PrismaService,
  orgId: string,
  workspaceId?: string,
  environmentId?: string,
): Promise<TenantScope> {
  const scope: TenantScope = { organizationId: orgId };
  if (workspaceId) {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, organization_id: true },
    });
    if (!ws || ws.organization_id !== orgId) {
      throw new BadRequestException('x-workspace-id não pertence à sua organização.');
    }
    scope.workspaceId = ws.id;
  }
  if (environmentId) {
    if (!workspaceId) {
      throw new BadRequestException('x-environment-id exige x-workspace-id.');
    }
    const env = await prisma.environment.findUnique({
      where: { id: environmentId },
      select: { id: true, workspace_id: true },
    });
    if (!env || env.workspace_id !== workspaceId) {
      throw new BadRequestException('x-environment-id não pertence ao workspace informado.');
    }
    scope.environmentId = env.id;
  }
  return scope;
}
