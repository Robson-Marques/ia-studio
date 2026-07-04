// Porta unica ao banco do seed de boot.
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class SeedRepository {
  constructor(private readonly prisma: PrismaService) {}

  countUsers(): Promise<number> {
    return this.prisma.user.count();
  }

  createPlatformAdmin(input: { name: string; email: string; passwordHash: string }) {
    return this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        password_hash: input.passwordHash,
        is_platform_admin: true,
        organization_id: null, // admin de plataforma nao pertence a org
      },
    });
  }
}
