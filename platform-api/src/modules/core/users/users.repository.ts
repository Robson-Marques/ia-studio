// Porta única ao banco de usuários da instalação dedicada.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

const USER_SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  whatsapp_phone: true,
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

  findAll(includeDeleted = false) {
    return this.prisma.user.findMany({
      where: {
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
      },
    });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  countActive() {
    return this.prisma.user.count({
      where: { deleted_at: null, is_active: true },
    });
  }

  create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data, select: USER_SAFE_SELECT });
  }

  update(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({ where: { id }, data, select: USER_SAFE_SELECT });
  }

}
