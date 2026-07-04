// Porta unica ao banco do modulo de autenticacao.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class CoreAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { profile: { select: { id: true, name: true, permissions: true, deleted_at: true } } },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        profile: { select: { id: true, name: true, permissions: true, deleted_at: true } },
        organization: { select: { id: true, name: true, slug: true, branding: true, is_active: true } },
        memberships: {
          include: {
            workspace: { select: { id: true, name: true, slug: true, is_active: true } },
            profile: { select: { id: true, name: true, permissions: true, deleted_at: true } },
          },
        },
      },
    });
  }

  updateLastLogin(id: string) {
    return this.prisma.user.update({ where: { id }, data: { last_login_at: new Date() } });
  }

  updatePassword(id: string, passwordHash: string) {
    return this.prisma.user.update({
      where: { id },
      data: { password_hash: passwordHash, jwt_revoked_at: new Date() },
    });
  }

  findLicenseStatus(organizationId: string) {
    return this.prisma.license.findUnique({
      where: { organization_id: organizationId },
      select: { status: true, trial_ends_at: true, expires_at: true, plan: { select: { name: true, features: true } } },
    });
  }
}
