// Porta unica ao banco do registry — seed create-if-missing dos
// ProviderDefinition a partir do metadata() das implementacoes.
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class RegistryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByKey(key: string) {
    return this.prisma.providerDefinition.findUnique({ where: { key } });
  }

  create(data: Prisma.ProviderDefinitionCreateInput) {
    return this.prisma.providerDefinition.create({ data });
  }

  update(key: string, data: Prisma.ProviderDefinitionUpdateInput) {
    return this.prisma.providerDefinition.update({ where: { key }, data });
  }

  /** Retira um conector da vitrine (is_active=false). Idempotente e nao lanca
   *  quando a linha nao existe (instalacao nova). */
  deactivate(key: string) {
    return this.prisma.providerDefinition.updateMany({
      where: { key, is_active: true },
      data: { is_active: false },
    });
  }
}
