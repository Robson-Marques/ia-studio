// Gestão de usuários locais. Soft-delete SEMPRE (deleted_at +
// is_active=false + jwt_revoked_at) — nunca deletar hard (trilha de auditoria
// e FKs de autoria dependem do registro).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UsersRepository } from './users.repository';
import { ProfilesRepository } from '../profiles/profiles.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { hashPassword } from '../../../shared/auth/password.util';
import { JwtStrategy } from '../../../shared/auth/jwt.strategy';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly repository: UsersRepository,
    private readonly profilesRepository: ProfilesRepository,
    private readonly audit: AuditLogService,
  ) {}

  findAll(includeDeleted = false) {
    return this.repository.findAll(includeDeleted);
  }

  async findById(id: string) {
    const user = await this.repository.findById(id);
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  async create(dto: CreateUserDto, createdBy?: string) {
    const emailTaken = await this.repository.findByEmail(dto.email);
    if (emailTaken) throw new ConflictException('E-mail já está em uso.');
    if (dto.profile_id) await this.assertProfileExists(dto.profile_id);

    const user = await this.repository.create({
      name: dto.name,
      email: dto.email,
      password_hash: await hashPassword(dto.password),
      ...(dto.profile_id ? { profile: { connect: { id: dto.profile_id } } } : {}),
      ...(dto.whatsapp_phone ? { whatsapp_phone: dto.whatsapp_phone.trim() } : {}),
      created_by: createdBy ?? null,
    } as Prisma.UserUncheckedCreateInput);
    await this.audit.record({
      action: 'core.user.create',
      entityType: 'User',
      entityId: user.id,
      newValue: { name: user.name, email: user.email, profile_id: user.profile_id },
    });
    return user;
  }

  async update(id: string, dto: UpdateUserDto, updatedBy?: string) {
    const before = await this.findById(id);
    if (dto.email && dto.email !== before.email) {
      const emailTaken = await this.repository.findByEmail(dto.email);
      if (emailTaken) throw new ConflictException('E-mail já está em uso.');
    }
    if (dto.profile_id) await this.assertProfileExists(dto.profile_id);

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
      ...(dto.whatsapp_phone !== undefined
        ? { whatsapp_phone: dto.whatsapp_phone ? dto.whatsapp_phone.trim() : null }
        : {}),
      updated_by: updatedBy ?? null,
    });
    if (dto.password !== undefined || dto.is_active === false) {
      JwtStrategy.invalidateAuthCache(id);
    }
    await this.audit.record({
      action: 'core.user.update',
      entityType: 'User',
      entityId: id,
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
  async inactivate(id: string, actorId?: string) {
    const before = await this.findById(id);
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
      oldValue: { is_active: before.is_active, deleted_at: before.deleted_at },
      newValue: { is_active: false, deleted_at: user.deleted_at },
    });
    return user;
  }

  /** Reativa usuário soft-deletado. */
  async activate(id: string, actorId?: string) {
    const before = await this.findById(id);
    if (!before.deleted_at) throw new BadRequestException('Usuário não está inativado.');
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
      oldValue: { is_active: before.is_active, deleted_at: before.deleted_at },
      newValue: { is_active: true, deleted_at: null },
    });
    return user;
  }

  private async assertProfileExists(profileId: string): Promise<void> {
    const profile = await this.profilesRepository.findById(profileId);
    if (!profile || profile.deleted_at) {
      throw new BadRequestException('Perfil de acesso inválido para esta instalação.');
    }
  }
}
