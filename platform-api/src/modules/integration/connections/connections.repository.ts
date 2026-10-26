// Porta unica ao banco do modulo connections (integration_connections).
// Sem metodo delete — conexao NUNCA e excluida (diretriz 52).
import { Injectable } from '@nestjs/common';
import { ConnectionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface ConnectionFilters {
  providerKey?: string;
  status?: ConnectionStatus;
}

@Injectable()
export class ConnectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: ConnectionFilters = {}) {
    const where: Prisma.ConnectionWhereInput = {};
    if (filters.providerKey) where.provider_key = filters.providerKey;
    if (filters.status) where.status = filters.status;
    return this.prisma.connection.findMany({
      where,
      orderBy: [{ priority: 'desc' }, { created_at: 'asc' }],
    });
  }

  findById(id: string) {
    return this.prisma.connection.findUnique({ where: { id } });
  }

  count() {
    return this.prisma.connection.count();
  }

  countByProvider(providerKey: string) {
    return this.prisma.connection.count({
      where: { provider_key: providerKey },
    });
  }

  create(data: Prisma.ConnectionUncheckedCreateInput) {
    return this.prisma.connection.create({ data });
  }

  update(id: string, data: Prisma.ConnectionUpdateInput) {
    return this.prisma.connection.update({ where: { id }, data });
  }
}
