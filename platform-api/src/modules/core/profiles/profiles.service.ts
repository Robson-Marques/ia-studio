import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProfilesRepository } from './profiles.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { Prisma } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
} from '../../../shared/permissions.constants';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly repository: ProfilesRepository,
    private readonly audit: AuditLogService,
  ) {}

  /** Catalogo de permissoes pro front montar a tela de perfis. */
  permissionsCatalog() {
    return {
      permissions: ALL_PERMISSIONS,
      groups: PERMISSION_GROUPS,
      labels: PERMISSION_LABELS,
    };
  }

  findAll() {
    return this.repository.findAll();
  }

  async findById(id: string) {
    const profile = await this.repository.findById(id);
    if (!profile || profile.deleted_at) throw new NotFoundException('Perfil não encontrado.');
    return profile;
  }

  async create(dto: CreateProfileDto) {
    this.assertKnownPermissions(dto.permissions);
    const dup = await this.repository.findByName(dto.name);
    if (dup && !dup.deleted_at) throw new ConflictException('Já existe um perfil com este nome.');

    const profile = await this.repository.create({
      name: dto.name,
      description: dto.description ?? null,
      permissions: dto.permissions,
      is_system: false,
    } as Prisma.PermissionProfileUncheckedCreateInput);
    await this.audit.record({
      action: 'core.profile.create',
      entityType: 'PermissionProfile',
      entityId: profile.id,
      newValue: { name: profile.name, permissions: profile.permissions },
    });
    return profile;
  }

  async update(id: string, dto: UpdateProfileDto) {
    const before = await this.findById(id);
    if (before.is_system) {
      throw new BadRequestException('Perfis de sistema não podem ser editados.');
    }
    if (dto.permissions) this.assertKnownPermissions(dto.permissions);
    if (dto.name && dto.name !== before.name) {
      const dup = await this.repository.findByName(dto.name);
      if (dup) throw new ConflictException('Já existe um perfil com este nome.');
    }
    const profile = await this.repository.update(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.permissions !== undefined ? { permissions: dto.permissions } : {}),
    });
    await this.audit.record({
      action: 'core.profile.update',
      entityType: 'PermissionProfile',
      entityId: id,
      oldValue: { name: before.name, description: before.description, permissions: before.permissions },
      newValue: { name: profile.name, description: profile.description, permissions: profile.permissions },
    });
    return profile;
  }

  /** Soft-delete — bloqueado pra perfis de sistema e perfis em uso. */
  async inactivate(id: string) {
    const before = await this.findById(id);
    if (before.is_system) {
      throw new BadRequestException('Perfis de sistema não podem ser excluídos.');
    }
    const linked = await this.repository.countUsersLinked(id);
    if (linked > 0) {
      throw new BadRequestException(
        `Perfil em uso por ${linked} usuário(s). Reatribua os usuários antes de excluir.`,
      );
    }
    const profile = await this.repository.update(id, { deleted_at: new Date() });
    await this.audit.record({
      action: 'core.profile.inactivate',
      entityType: 'PermissionProfile',
      entityId: id,
      oldValue: { deleted_at: null },
      newValue: { deleted_at: profile.deleted_at },
    });
    return profile;
  }

  private assertKnownPermissions(perms: string[]): void {
    const unknown = perms.filter((p) => !ALL_PERMISSIONS.includes(p));
    if (unknown.length > 0) {
      throw new BadRequestException(`Permissões desconhecidas: ${unknown.join(', ')}.`);
    }
  }
}
