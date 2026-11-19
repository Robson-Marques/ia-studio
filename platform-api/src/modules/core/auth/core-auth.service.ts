// Login local da instancia. Autenticacao e ACL nao carregam tenant, Console,
// plano ou licenca; autorizacao vem exclusivamente do perfil local.
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CoreAuthRepository } from './core-auth.repository';
import { SecurityLogService } from '../../../shared/audit/security-log.service';
import { hashPassword, verifyPassword } from '../../../shared/auth/password.util';
import { JwtStrategy } from '../../../shared/auth/jwt.strategy';
import { JwtPayload } from '../../../shared/auth/auth.types';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class CoreAuthService {
  constructor(
    private readonly repository: CoreAuthRepository,
    private readonly jwt: JwtService,
    private readonly securityLog: SecurityLogService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.repository.findByEmail(dto.email);
    const valid =
      !!user &&
      !user.deleted_at &&
      user.is_active &&
      (await verifyPassword(dto.password, user.password_hash));

    if (!valid || !user) {
      await this.securityLog.record({
        event: 'LOGIN_FAILED',
        email: dto.email,
        userId: user?.id ?? null,
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    await this.repository.updateLastLogin(user.id);
    await this.securityLog.record({
      event: 'LOGIN_SUCCESS',
      email: user.email,
      userId: user.id,
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      profile_id: user.profile_id,
    };
    const token = this.jwt.sign(payload as unknown as Record<string, unknown>);

    return {
      access_token: token,
      token_type: 'Bearer',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        profile_id: user.profile_id,
        profile_name: user.profile?.name ?? null,
        permissions: user.profile?.permissions ?? [],
      },
    };
  }

  /** Perfil completo do usuario local da instancia. */
  async me(userId: string) {
    const user = await this.repository.findById(userId);
    if (!user || user.deleted_at) throw new UnauthorizedException('Usuário não encontrado');

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      profile_id: user.profile_id,
      profile_name: user.profile?.name ?? null,
      permissions: user.profile && !user.profile.deleted_at ? user.profile.permissions : [],
      last_login_at: user.last_login_at,
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.repository.findById(userId);
    if (!user || user.deleted_at) throw new UnauthorizedException('Usuário não encontrado');

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) throw new UnauthorizedException('Senha atual incorreta');

    // Troca de senha revoga tokens anteriores (jwt_revoked_at) — o cliente
    // deve refazer o login.
    await this.repository.updatePassword(userId, await hashPassword(newPassword));
    JwtStrategy.invalidateAuthCache(userId);
    await this.securityLog.record({
      event: 'PASSWORD_CHANGED',
      userId,
      email: user.email,
    });
    await this.securityLog.record({
      event: 'TOKEN_REVOKED',
      userId,
      email: user.email,
    });
    return { message: 'Senha alterada com sucesso. Faça login novamente.' };
  }
}
