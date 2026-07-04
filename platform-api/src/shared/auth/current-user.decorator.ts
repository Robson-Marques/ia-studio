import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from './auth.types';

/** @CurrentUser() → AuthenticatedUser (undefined em rota @Public sem token). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return request.user;
  },
);

/** Atalho para ler so o id (sub) do usuario autenticado. */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    return request.user?.sub;
  },
);
