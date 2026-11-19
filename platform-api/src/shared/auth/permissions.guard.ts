// Valida permissoes granulares (@RequirePermissions — logica OR) do usuario
// local da instancia. O perfil e a unica fonte de ACL: nao ha bypass de
// plataforma, membership de workspace ou header de escopo.
// Cache em memoria 60s por usuario — permissoes mudam raro.
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { AuthenticatedUser, RequestWithUser } from './auth.types';

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
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = req.user as AuthenticatedUser | undefined;
    if (!user?.sub) throw new ForbiddenException('Não autenticado.');

    const perms = await this.loadEffectivePermissions(user.sub);
    user.permissions = perms; // expoe ACL efetiva pra enforcement fino em services

    const hasAny = required.some((p) => perms.includes(p));
    if (!hasAny) {
      throw new ForbiddenException(`Permissão necessária: ${required.join(' ou ')}.`);
    }
    return true;
  }

  private async loadEffectivePermissions(userId: string): Promise<string[]> {
    const cacheKey = userId;
    const now = Date.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.permissions;

    const set = new Set<string>();
    // Se a QUERY falhar (blip do Postgres), não cachear o conjunto vazio — senão
    // o usuário levava 403 em tudo por até 60s mesmo com o banco de volta.
    let queryFailed = false;

    const user = await this.prisma.user
      .findUnique({
        where: { id: userId },
        select: { profile: { select: { permissions: true, deleted_at: true } } },
      })
      .catch(() => {
        queryFailed = true;
        return null;
      });
    if (user?.profile && !user.profile.deleted_at) {
      for (const p of user.profile.permissions) set.add(p);
    }

    const permissions = Array.from(set);
    if (!queryFailed) this.cache.set(cacheKey, { permissions, expiresAt: now + this.TTL_MS });
    return permissions;
  }
}
