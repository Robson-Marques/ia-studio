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

  findActiveDefinitions() {
    return this.prisma.providerDefinition.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
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

  /** Aposenta os vínculos antigos e remove credenciais exclusivas deles.
   * Conversas, linhas de conexão e logs permanecem para auditoria. */
  retireLegacyWhatsappConnections() {
    return this.prisma.$transaction(async (tx) => {
      const where = { provider_key: { in: ['whatsapp-meta', 'whatsapp-ycloud'] } };
      const legacy = await tx.connection.findMany({ where, select: { secret_id: true } });
      await tx.connection.updateMany({
        where,
        data: {
          status: 'DISABLED', is_active: false, secret_id: null,
          status_detail: 'Conector substituído pela Central WhatsApp Nivoo.',
        },
      });
      for (const secretId of new Set(legacy.map((item) => item.secret_id).filter((id): id is string => !!id))) {
        const [connections, mcpServers] = await Promise.all([
          tx.connection.count({ where: { secret_id: secretId } }),
          tx.aiMcpServer.count({ where: { secret_id: secretId } }),
        ]);
        if (connections === 0 && mcpServers === 0) {
          await tx.secret.deleteMany({ where: { id: secretId } });
        }
      }
    });
  }
}
