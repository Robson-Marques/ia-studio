// Porta ao banco da config de abertura de OS (pares setor↔assunto por conexão).
// Uma responsabilidade: CRUD do IspOsConfig.
import { Injectable } from '@nestjs/common';
import { IspOsConfig } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

export interface OsConfigPair {
  setor_id: string;
  setor_nome?: string | null;
  assunto_id: string;
  assunto_nome?: string | null;
  is_default?: boolean;
  active?: boolean;
}

@Injectable()
export class IspOsConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByConnection(connectionId: string): Promise<IspOsConfig[]> {
    return this.prisma.ispOsConfig.findMany({
      where: { connection_id: connectionId },
      orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
    });
  }

  /** Par ATIVO marcado como padrão (usado no suporte técnico). */
  defaultForConnection(connectionId: string): Promise<IspOsConfig | null> {
    return this.prisma.ispOsConfig.findFirst({
      where: { connection_id: connectionId, active: true, is_default: true },
    });
  }

  /** Substitui a config inteira da conexão (a tela salva o conjunto completo). */
  async replaceForConnection(
    connectionId: string,
    createdBy: string | null,
    pairs: OsConfigPair[],
  ): Promise<IspOsConfig[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.ispOsConfig.deleteMany({
        where: { connection_id: connectionId },
      });
      if (pairs.length) {
        await tx.ispOsConfig.createMany({
          data: pairs.map((p) => ({
            connection_id: connectionId,
            setor_id: p.setor_id,
            setor_nome: p.setor_nome ?? null,
            assunto_id: p.assunto_id,
            assunto_nome: p.assunto_nome ?? null,
            is_default: !!p.is_default,
            active: p.active !== false,
            created_by: createdBy,
          })),
        });
      }
      return tx.ispOsConfig.findMany({
        where: { connection_id: connectionId },
        orderBy: [{ is_default: 'desc' }, { created_at: 'asc' }],
      });
    });
  }
}
