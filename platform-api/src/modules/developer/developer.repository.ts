// Porta unica ao banco do Developer Center (developer_api_keys). Nenhum
// service toca Prisma direto. Chave em claro NUNCA persiste — so prefix + hash.
import { Injectable } from '@nestjs/common';
import { DeveloperApiKey, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class DeveloperRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<DeveloperApiKey[]> {
    return this.prisma.developerApiKey.findMany({
      orderBy: { created_at: 'desc' },
    });
  }

  findById(id: string): Promise<DeveloperApiKey | null> {
    return this.prisma.developerApiKey.findUnique({ where: { id } });
  }

  /** Resolve por hash (autenticacao da Public API). */
  findByHash(hashedKey: string): Promise<DeveloperApiKey | null> {
    return this.prisma.developerApiKey.findUnique({ where: { hashed_key: hashedKey } });
  }

  create(data: Prisma.DeveloperApiKeyUncheckedCreateInput): Promise<DeveloperApiKey> {
    return this.prisma.developerApiKey.create({ data });
  }

  update(id: string, data: Prisma.DeveloperApiKeyUpdateInput): Promise<DeveloperApiKey> {
    return this.prisma.developerApiKey.update({ where: { id }, data });
  }

  /** Marca last_used_at sem lancar (usado no guard, best-effort). */
  touch(id: string): Promise<unknown> {
    return this.prisma.developerApiKey
      .update({ where: { id }, data: { last_used_at: new Date() } })
      .catch(() => undefined);
  }
}
