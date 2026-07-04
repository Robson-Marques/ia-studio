// Guard do Console (diretriz 41): rotas marcadas com @PlatformAdminOnly()
// so passam para usuarios com is_platform_admin=true.
// Registrado como APP_GUARD global — rota sem o decorator nao e afetada.
import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from './auth.types';

export const PLATFORM_ADMIN_KEY = 'platform_admin_only';
export const PlatformAdminOnly = () => SetMetadata(PLATFORM_ADMIN_KEY, true);

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean>(PLATFORM_ADMIN_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required) return true;

    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user?.sub) throw new ForbiddenException('Não autenticado.');
    if (!req.user.is_platform_admin) {
      throw new ForbiddenException('Rota exclusiva do Console (administrador da plataforma).');
    }
    return true;
  }
}
