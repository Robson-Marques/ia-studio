// Gestao de usuarios da organization. Soft-delete SEMPRE (deleted_at +
// is_active=false + jwt_revoked_at) — nunca deletar hard (trilha de auditoria
// e FKs de autoria dependem do registro).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UsersRepository } from './users.repository';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { WorkspacesRepository } from '../workspaces/workspaces.repository';
import { LimitsService } from '../../licensing/limits.service';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { hashPassword } from '../../../shared/auth/password.util';
import { JwtStrategy } from '../../../shared/auth/jwt.strategy';
import { assertSameOrg } from '../../../shared/auth/tenant.util';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { SetMembershipDto } from './dto/set-membership.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly profilesRepository: ProfilesRepository,
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly limits: LimitsService,
    private readonly audit: AuditLogService,
  ) {}

  findAll(orgId: string, includeDeleted = false) {
    return this.repository.findAllByOrg(orgId, includeDeleted);
  }

  async findById(orgId: string, id: string) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    assertSameOrg(user.organization_id, orgId);
    return user;
  }

  async create(orgId: string, dto: CreateUserDto, createdBy?: string) {
    // Enforcement de limite do plano (metrica estrutural "users")
    const activeCount = await this.repository.countActive(orgId);
    await this.limits.assertCountWithin(orgId, 'users', activeCount);

    const emailTaken = await this.repository.findByEmail(dto.email);
    if (emailTaken) throw new ConflictException('E-mail já está em uso.');
    if (dto.profile_id) await this.assertProfileInOrg(orgId, dto.profile_id);

    const user = await this.repository.create({
      organization: { connect: { id: orgId } },
      name: dto.name,
      email: dto.email,
      password_hash: await hashPassword(dto.password),
      ...(dto.profile_id ? { profile: { connect: { id: dto.profile_id } } } : {}),
      created_by: createdBy ?? null,
    });
    await this.audit.record({
      action: 'core.user.create',
      entityType: 'User',
      entityId: user.id,
      organizationId: orgId,
      newValue: { name: user.name, email: user.email, profile_id: user.profile_id },
    });
    return user;
  }

  async update(orgId: string, id: string, dto: UpdateUserDto, updatedBy?: string) {
    const before = await this.findById(orgId, id);
    if (dto.email && dto.email !== before.email) {
      const emailTaken = await this.repository.findByEmail(dto.email);
      if (emailTaken) throw new ConflictException('E-mail já está em uso.');
    }
    if (dto.profile_id) await this.assertProfileInOrg(orgId, dto.profile_id);
    // Reativacao passa pelo limite do plano
    if (dto.is_active === true && !before.is_active) {
      const activeCount = await this.repository.countActive(orgId);
      await this.limits.assertCountWithin(orgId, 'users', activeCount);
    }

    const user = await this.repository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.email !== undefined ? { email: dto.email } : {}),
      ...(dto.password !== undefined
        ? { password_hash: await hashPassword(dto.password), jwt_revoked_at: new Date() }
        : {}),
      ...(dto.profile_id !== undefined
        ? dto.profile_id === null
          ? { profile: { disconnect: true } }
          : { profile: { connect: { id: dto.profile_id } } }
        : {}),
      ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
      updated_by: updatedBy ?? null,
    });
    if (dto.password !== undefined || dto.is_active === false) {
      JwtStrategy.invalidateAuthCache(id);
    }
    await this.audit.record({
      action: 'core.user.update',
      entityType: 'User',
      entityId: id,
      organizationId: orgId,
      oldValue: {
        name: before.name,
        email: before.email,
        profile_id: before.profile_id,
        is_active: before.is_active,
      },
      newValue: {
        name: user.name,
        email: user.email,
        profile_id: user.profile_id,
        is_active: user.is_active,
      },
    });
    return user;
  }

  /** Soft-delete: deleted_at + is_active=false + revoga sessoes. */
  async inactivate(orgId: string, id: string, actorId?: string) {
    const before = await this.findById(orgId, id);
    if (before.deleted_at) throw new BadRequestException('Usuário já está inativado.');
    if (actorId && actorId === id) {
      throw new BadRequestException('Você não pode inativar a própria conta.');
    }
    const user = await this.repository.update(id, {
      deleted_at: new Date(),
      is_active: false,
      jwt_revoked_at: new Date(),
      updated_by: actorId ?? null,
    });
    JwtStrategy.invalidateAuthCache(id);
    await this.audit.record({
      action: 'core.user.inactivate',
      entityType: 'User',
      entityId: id,
      organizationId: orgId,
      oldValue: { is_active: before.is_active, deleted_at: before.deleted_at },
      newValue: { is_active: false, deleted_at: user.deleted_at },
    });
    return user;
  }

  /** Reativa usuario soft-deletado (respeitando o limite do plano). */
  async activate(orgId: string, id: string, actorId?: string) {
    const before = await this.findById(orgId, id);
    if (!before.deleted_at) throw new BadRequestException('Usuário não está inativado.');
    const activeCount = await this.repository.countActive(orgId);
    await this.limits.assertCountWithin(orgId, 'users', activeCount);
    const user = await this.repository.update(id, {
      deleted_at: null,
      is_active: true,
      updated_by: actorId ?? null,
    });
    JwtStrategy.invalidateAuthCache(id);
    await this.audit.record({
      action: 'core.user.activate',
      entityType: 'User',
      entityId: id,
      organizationId: orgId,
      oldValue: { is_active: before.is_active, deleted_at: before.deleted_at },
      newValue: { is_active: true, deleted_at: null },
    });
    return user;
  }

  // ─── Membros de workspace ───────────────────────────
  async listMemberships(orgId: string, userId: string) {
    const user = await this.findById(orgId, userId);
    return user.memberships;
  }

  async setMembership(orgId: string, userId: string, dto: SetMembershipDto) {
    await this.findById(orgId, userId);
    const workspace = await this.workspacesRepository.findById(dto.workspace_id);
    if (!workspace || workspace.organization_id !== orgId) {
      throw new NotFoundException('Workspace não encontrado.');
    }
    if (dto.profile_id) await this.assertProfileInOrg(orgId, dto.profile_id);

    const member = await this.repository.upsertMembership(
      dto.workspace_id,
      userId,
      dto.profile_id ?? null,
    );
    await this.audit.record({
      action: 'core.user.set_membership',
      entityType: 'WorkspaceMember',
      entityId: member.id,
      organizationId: orgId,
      workspaceId: dto.workspace_id,
      newValue: { user_id: userId, workspace_id: dto.workspace_id, profile_id: dto.profile_id ?? null },
    });
    return member;
  }

  async removeMembership(orgId: string, userId: string, workspaceId: string) {
    await this.findById(orgId, userId);
    const workspace = await this.workspacesRepository.findById(workspaceId);
    if (!workspace || workspace.organization_id !== orgId) {
      throw new NotFoundException('Workspace não encontrado.');
    }
    await this.repository.removeMembership(workspaceId, userId);
    await this.audit.record({
      action: 'core.user.remove_membership',
      entityType: 'WorkspaceMember',
      organizationId: orgId,
      workspaceId,
      oldValue: { user_id: userId, workspace_id: workspaceId },
    });
    return { message: 'Membro removido do workspace.' };
  }

  private async assertProfileInOrg(orgId: string, profileId: string): Promise<void> {
    const profile = await this.profilesRepository.findById(profileId);
    if (!profile || profile.organization_id !== orgId || profile.deleted_at) {
      throw new BadRequestException('Perfil de acesso inválido para esta organização.');
    }
  }
}
