// Porta unica ao banco do modulo profiles.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class ProfilesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(includeDeleted = false) {
    return this.prisma.permissionProfile.findMany({
      where: {
        ...(includeDeleted ? {} : { deleted_at: null }),
      },
      include: { _count: { select: { users: true } } },
      orderBy: [{ is_system: 'desc' }, { name: 'asc' }],
    });
  }

  findById(id: string) {
    return this.prisma.permissionProfile.findUnique({ where: { id } });
  }

  findByName(name: string) {
    return this.prisma.permissionProfile.findFirst({ where: { name } });
  }

  create(data: Prisma.PermissionProfileCreateInput) {
    return this.prisma.permissionProfile.create({ data });
  }

  update(id: string, data: Prisma.PermissionProfileUpdateInput) {
    return this.prisma.permissionProfile.update({ where: { id }, data });
  }

  countUsersLinked(profileId: string) {
    return this.prisma.user.count({ where: { profile_id: profileId, deleted_at: null } });
  }
}
