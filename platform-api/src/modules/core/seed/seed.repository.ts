// Porta unica ao banco do seed de boot.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class SeedRepository {
  constructor(private readonly prisma: PrismaService) {}

  countUsers(): Promise<number> {
    return this.prisma.user.count();
  }

  ensureInstallationAdminProfile(permissions: string[]) {
    return this.prisma.permissionProfile.upsert({
      where: { name: 'Administrador' },
      create: {
        name: 'Administrador',
        description: 'Acesso administrativo total à instalação.',
        permissions,
        is_system: true,
      },
      update: { permissions, is_system: true, deleted_at: null },
    });
  }

  createInitialAdmin(input: { name: string; email: string; passwordHash: string; profileId: string }) {
    return this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        password_hash: input.passwordHash,
        profile_id: input.profileId,
      },
    });
  }
}
