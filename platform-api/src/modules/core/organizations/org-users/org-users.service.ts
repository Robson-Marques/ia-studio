// Gestao dos usuarios de uma organization cliente PELO CONSOLE (operador da
// plataforma). Distinto do UsersService (painel do cliente, escopado a org do
// JWT): aqui o ator e platform admin e o organization_id vem da rota — todo
// metodo valida que o usuario pertence aquela org (senao 404, nao vaza
// existencia). Reset de senha revoga sessoes anteriores (jwt_revoked_at +
// cache de auth) — mesmo comportamento do change-password do core.
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrgUsersRepository } from './org-users.repository';
import { AuditLogService } from '../../../../shared/audit/audit-log.service';
import { hashPassword } from '../../../../shared/auth/password.util';
import { JwtStrategy } from '../../../../shared/auth/jwt.strategy';
import { assertSameOrg } from '../../../../shared/auth/tenant.util';
import { UpdateOrgUserDto } from './dto/update-org-user.dto';
import { ResetOrgUserPasswordDto } from './dto/reset-org-user-password.dto';

@Injectable()
export class OrgUsersService {
  private readonly logger = new Logger(OrgUsersService.name);

  constructor(
    private readonly repository: OrgUsersRepository,
    private readonly audit: AuditLogService,
  ) {}

  findAll(orgId: string) {
    return this.repository.findAllByOrg(orgId);
  }

  /** Busca o usuario garantindo que ele pertence a org informada (404 senao). */
  private async findInOrg(orgId: string, userId: string) {
    const user = await this.repository.findById(userId);
    if (!user || user.deleted_at) throw new NotFoundException('Usuário não encontrado.');
    assertSameOrg(user.organization_id, orgId);
    return user;
  }

  async update(orgId: string, userId: string, dto: UpdateOrgUserDto) {
    const before = await this.findInOrg(orgId, userId);

    if (dto.email && dto.email !== before.email) {
      const taken = await this.repository.findByEmail(dto.email);
      if (taken) throw new ConflictException('E-mail já está em uso.');
    }

    const user = await this.repository.update(userId, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.email !== undefined ? { email: dto.email } : {}),
    });

    await this.audit.record({
      action: 'console.org_user.update',
      entityType: 'User',
      entityId: userId,
      organizationId: orgId,
      oldValue: { name: before.name, email: before.email },
      newValue: { name: user.name, email: user.email },
    });
    this.logger.log(`Console atualizou usuário ${userId} da org ${orgId}.`);
    return user;
  }

  /** Reset administrativo de senha: grava hash + revoga sessoes anteriores. */
  async resetPassword(orgId: string, userId: string, dto: ResetOrgUserPasswordDto) {
    const before = await this.findInOrg(orgId, userId);

    const user = await this.repository.update(userId, {
      password_hash: await hashPassword(dto.new_password),
      jwt_revoked_at: new Date(),
    });
    JwtStrategy.invalidateAuthCache(userId);

    // A senha NUNCA vai pro log (sem newValue com o valor).
    await this.audit.record({
      action: 'console.org_user.reset_password',
      entityType: 'User',
      entityId: userId,
      organizationId: orgId,
      newValue: { email: before.email, password_reset: true, sessions_revoked: true },
    });
    this.logger.log(`Console resetou a senha do usuário ${userId} da org ${orgId}.`);
    return { message: 'Senha redefinida. O usuário precisará fazer login novamente.' };
  }
}
