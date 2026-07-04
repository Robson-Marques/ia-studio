// Valida permissoes granulares (@RequirePermissions — logica OR).
//   - is_platform_admin: bypass total (Console).
//   - usuario de org: uniao das permissions do profile do usuario + do profile
//     do WorkspaceMember quando o header `x-workspace-id` esta presente.
// Cache em memoria 60s por (userId, workspaceId) — permissoes mudam raro.
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { AuthenticatedUser, RequestWithUser } from './auth.types';
import { headerValue } from './tenant.util';

interface CachedPerms {
  permissions: string[];
  expiresAt: number;
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly cache = new Map<string, CachedPerms>();
  private readonly TTL_MS = 60_000;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true; // rota sem decorator

    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = req.user as AuthenticatedUser | undefined;
    if (!user?.sub) throw new ForbiddenException('Não autenticado.');

    // Admin de plataforma (Console) — bypass total.
    if (user.is_platform_admin) {
      user.permissions = ['*'];
      return true;
    }

    const workspaceId = headerValue(req, 'x-workspace-id');
    const perms = await this.loadEffectivePermissions(user.sub, workspaceId);
    user.permissions = perms; // expoe ACL efetiva pra enforcement fino em services

    const hasAny = required.some((p) => perms.includes(p));
    if (!hasAny) {
      throw new ForbiddenException(`Permissão necessária: ${required.join(' ou ')}.`);
    }
    return true;
  }

  private async loadEffectivePermissions(userId: string, workspaceId?: string): Promise<string[]> {
    const cacheKey = `${userId}:${workspaceId ?? ''}`;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.permissions;

    const set = new Set<string>();

    const user = await this.prisma.user
      .findUnique({
        where: { id: userId },
        select: { organization_id: true, profile: { select: { permissions: true, deleted_at: true } } },
      })
      .catch(() => null);
    if (user?.profile && !user.profile.deleted_at) {
      for (const p of user.profile.permissions) set.add(p);
    }

    // Perfil por workspace (membership) — so quando o header indica o escopo.
    if (workspaceId && user?.organization_id) {
      const member = await this.prisma.workspaceMember
        .findUnique({
          where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } },
          select: {
            profile: { select: { permissions: true, deleted_at: true } },
            workspace: { select: { organization_id: true } },
          },
        })
        .catch(() => null);
      // Header apontando pra workspace de OUTRA org e ignorado (nao soma perms).
      if (member && member.workspace.organization_id === user.organization_id) {
        if (member.profile && !member.profile.deleted_at) {
          for (const p of member.profile.permissions) set.add(p);
        }
      }
    }

    const permissions = Array.from(set);
    this.cache.set(cacheKey, { permissions, expiresAt: now + this.TTL_MS });
    return permissions;
  }
}
