// Porta unica ao banco da gestao de usuarios de uma org pelo Console.
// Distinto do UsersRepository (que atende o painel do cliente, escopado a org
// do JWT): aqui o Console opera sobre QUALQUER org, recebendo o organization_id
// na rota. Sempre retorna o SAFE_SELECT (nunca password_hash).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';

const ORG_USER_SAFE_SELECT = {
  id: true,
  organization_id: true,
  name: true,
  email: true,
  is_active: true,
  is_platform_admin: true,
  last_login_at: true,
  deleted_at: true,
  created_at: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class OrgUsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllByOrg(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organization_id: organizationId, deleted_at: null },
      select: ORG_USER_SAFE_SELECT,
      orderBy: { created_at: 'asc' },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select: ORG_USER_SAFE_SELECT });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email }, select: { id: true } });
  }

  update(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({ where: { id }, data, select: ORG_USER_SAFE_SELECT });
  }
}
