// Estrategia JWT — valida token E estado vivo do usuario (ativo, nao deletado,
// jwt_revoked_at < iat). Cache em memoria 10s pra nao consultar o banco a cada
// request (padrao portado do Aquapark F3-03).
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser, JwtPayload } from './auth.types';
import { getJwtSecret } from './jwt.config';

interface AuthState {
  checkedAt: number;
  revokedAtMs: number;
  isActive: boolean;
  deleted: boolean;
  profileId: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private static readonly AUTH_CACHE_TTL_MS = 10_000;
  private static authCache = new Map<string, AuthState>();

  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // Query param `?token=` — necessario pra downloads via window.open().
        ExtractJwt.fromUrlQueryParameter('token'),
      ]),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  /** Invalida o cache de auth de um usuario (chamar apos inativar/revogar). */
  static invalidateAuthCache(userId: string): void {
    JwtStrategy.authCache.delete(userId);
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const state = await this.getAuthStateCached(payload.sub);
    if (!state || state.deleted) {
      throw new UnauthorizedException('Conta inativada. Faça login novamente.');
    }
    if (!state.isActive) {
      throw new UnauthorizedException('Conta desativada.');
    }
    // iat vem em SEGUNDOS; jwt_revoked_at em ms.
    if (state.revokedAtMs > 0 && payload.iat && payload.iat * 1000 < state.revokedAtMs) {
      throw new UnauthorizedException('Sessão expirada. Faça login novamente.');
    }
    // Estado do banco e a fonte da verdade; o token nunca determina
    // privilegios nem escopo da instancia.
    return {
      sub: payload.sub,
      email: payload.email,
      profile_id: state.profileId,
    };
  }

  private async getAuthStateCached(userId: string): Promise<AuthState | null> {
    const now = Date.now();
    const cached = JwtStrategy.authCache.get(userId);
    if (cached && now - cached.checkedAt < JwtStrategy.AUTH_CACHE_TTL_MS) {
      return cached;
    }
    const user = await this.prisma.user
      .findUnique({
        where: { id: userId },
        select: {
          id: true,
          is_active: true,
          deleted_at: true,
          jwt_revoked_at: true,
          profile_id: true,
        },
      })
      .catch(() => null);
    if (!user) return null;
    const state: AuthState = {
      checkedAt: now,
      revokedAtMs: user.jwt_revoked_at ? user.jwt_revoked_at.getTime() : 0,
      isActive: user.is_active,
      deleted: user.deleted_at !== null,
      profileId: user.profile_id,
    };
    JwtStrategy.authCache.set(userId, state);
    return state;
  }
}
