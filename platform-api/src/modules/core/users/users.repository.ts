// Porta unica ao banco do modulo users (+ memberships).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

const USER_SAFE_SELECT = {
  id: true,
  organization_id: true,
  name: true,
  email: true,
  is_platform_admin: true,
  profile_id: true,
  is_active: true,
  last_login_at: true,
  deleted_at: true,
  created_at: true,
  updated_at: true,
  profile: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllByOrg(organizationId: string, includeDeleted = false) {
    return this.prisma.user.findMany({
      where: {
        organization_id: organizationId,
        ...(includeDeleted ? {} : { deleted_at: null }),
      },
      select: USER_SAFE_SELECT,
      orderBy: { created_at: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        ...USER_SAFE_SELECT,
        memberships: {
          select: {
            id: true,
            workspace_id: true,
            profile_id: true,
            workspace: { select: { id: true, name: true, slug: true } },
            profile: { select: { id: true, name: true } },
          },
        },
      },
    });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  countActive(organizationId: string) {
    return this.prisma.user.count({
      where: { organization_id: organizationId, deleted_at: null, is_active: true },
    });
  }

  create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data, select: USER_SAFE_SELECT });
  }

  update(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({ where: { id }, data, select: USER_SAFE_SELECT });
  }

  // ─── Memberships ────────────────────────────────────
  upsertMembership(workspaceId: string, userId: string, profileId: string | null) {
    return this.prisma.workspaceMember.upsert({
      where: { workspace_id_user_id: { workspace_id: workspaceId, user_id: userId } },
      create: { workspace_id: workspaceId, user_id: userId, profile_id: profileId },
      update: { profile_id: profileId },
      include: { workspace: { select: { id: true, name: true, slug: true } } },
    });
  }

  removeMembership(workspaceId: string, userId: string) {
    return this.prisma.workspaceMember.deleteMany({
      where: { workspace_id: workspaceId, user_id: userId },
    });
  }
}
