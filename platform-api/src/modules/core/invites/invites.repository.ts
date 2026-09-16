// Porta unica ao banco do modulo invites.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class InvitesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.userInvite.findMany({
      where: {},
      orderBy: { created_at: 'desc' },
    });
  }

  findById(id: string) {
    return this.prisma.userInvite.findUnique({ where: { id } });
  }

  findByToken(token: string) {
    return this.prisma.userInvite.findUnique({
      where: { token },
    });
  }

  findPendingByEmail(email: string) {
    return this.prisma.userInvite.findFirst({
      where: {
        email,
        accepted_at: null,
        expires_at: { gt: new Date() },
      },
    });
  }

  create(data: Prisma.UserInviteCreateInput) {
    return this.prisma.userInvite.create({ data });
  }

  markAccepted(id: string) {
    return this.prisma.userInvite.update({ where: { id }, data: { accepted_at: new Date() } });
  }

  /** Revogacao = expirar imediatamente (mantem o registro pra trilha). */
  revoke(id: string) {
    return this.prisma.userInvite.update({ where: { id }, data: { expires_at: new Date() } });
  }
}
