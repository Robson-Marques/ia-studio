// Login unico pros dois atores: is_platform_admin=true → actor 'platform'
// (Console); demais → actor 'org'. Licenca suspensa NAO bloqueia login —
// restricao e por feature/limite (LimitsService), o usuario precisa entrar
// pra regularizar a conta.
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
        organizationId: user?.organization_id ?? null,
        userId: user?.id ?? null,
      });
      throw new UnauthorizedException('Credenciais inválidas');
    }

    await this.repository.updateLastLogin(user.id);
    await this.securityLog.record({
      event: 'LOGIN_SUCCESS',
      email: user.email,
      userId: user.id,
      organizationId: user.organization_id,
    });

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      actor: user.is_platform_admin ? 'platform' : 'org',
      organization_id: user.organization_id,
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
        actor: payload.actor,
        is_platform_admin: user.is_platform_admin,
        organization_id: user.organization_id,
        profile_id: user.profile_id,
        profile_name: user.profile?.name ?? null,
        permissions: user.is_platform_admin ? ['*'] : (user.profile?.permissions ?? []),
      },
    };
  }

  /** Perfil completo do ator: user + org + workspaces + perms efetivas + licenca. */
  async me(userId: string) {
    const user = await this.repository.findById(userId);
    if (!user || user.deleted_at) throw new UnauthorizedException('Usuário não encontrado');

    // Permissoes efetivas = perfil do usuario ∪ perfis por workspace
    const effective = new Set<string>();
    if (user.profile && !user.profile.deleted_at) {
      for (const p of user.profile.permissions) effective.add(p);
    }
    const workspaces = user.memberships
      .filter((m) => m.workspace.is_active)
      .map((m) => {
        const perms = m.profile && !m.profile.deleted_at ? m.profile.permissions : [];
        for (const p of perms) effective.add(p);
        return {
          id: m.workspace.id,
          name: m.workspace.name,
          slug: m.workspace.slug,
          profile_id: m.profile?.id ?? null,
          profile_name: m.profile?.name ?? null,
          permissions: perms,
        };
      });

    const license = user.organization_id
      ? await this.repository.findLicenseStatus(user.organization_id)
      : null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      actor: user.is_platform_admin ? 'platform' : 'org',
      is_platform_admin: user.is_platform_admin,
      organization: user.organization
        ? {
            id: user.organization.id,
            name: user.organization.name,
            slug: user.organization.slug,
            branding: user.organization.branding,
            is_active: user.organization.is_active,
          }
        : null,
      workspaces,
      profile_id: user.profile_id,
      profile_name: user.profile?.name ?? null,
      permissions: user.is_platform_admin ? ['*'] : Array.from(effective),
      license: license
        ? {
            status: license.status,
            trial_ends_at: license.trial_ends_at,
            expires_at: license.expires_at,
            plan_name: license.plan.name,
            features: license.plan.features,
          }
        : null,
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
      organizationId: user.organization_id,
    });
    await this.securityLog.record({
      event: 'TOKEN_REVOKED',
      userId,
      email: user.email,
      organizationId: user.organization_id,
    });
    return { message: 'Senha alterada com sucesso. Faça login novamente.' };
  }
}
