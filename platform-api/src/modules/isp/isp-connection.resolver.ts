// Resolvedor da conexao de ERP do provedor — a solucao ISP e multi-instancia e
// múltiplas conexões IXC: matriz/filiais/clientes distintos = N conexões.
// As tools do agente nunca conhecem a conexao nem o ERP; passam apenas os
// tag opcional) e este resolver escolhe uma Connection ACTIVE de um dos ERPs
// suportados. Espelha a logica do Meta Orchestrator.
import { BadRequestException, Injectable } from '@nestjs/common';
import { Connection, ConnectionStatus } from '@prisma/client';
import { ConnectionsRepository } from '../integration/connections/connections.repository';
import { ISP_ERP_PROVIDER_KEYS } from './isp.constants';

export interface IspErpResolveScope {
  /** Conexao explicita (config da tool/incidente) — prioridade maxima. */
  connectionId?: string;
  /** Tag/filial (Connection.tags) quando ha multiplas conexoes de ERP. */
  tag?: string;
  /** Restringe a resolução a um provider configurado. */
  providerKey?: string;
}

@Injectable()
export class IspConnectionResolver {
  constructor(private readonly connections: ConnectionsRepository) {}

  async resolve(scope: IspErpResolveScope): Promise<Connection> {
    // A instância dedicada mantém suas conexões locais.
    const all = await this.connections.findAll();
    const wantedProvider = (scope.providerKey ?? '').trim().toLowerCase();
    const active = all.filter(
      (c) =>
        c.status === ConnectionStatus.ACTIVE &&
        ISP_ERP_PROVIDER_KEYS.includes(c.provider_key) &&
        (!wantedProvider || c.provider_key === wantedProvider),
    );
    if (active.length === 0) {
      throw new BadRequestException(
        wantedProvider
          ? `Nenhuma conexão "${wantedProvider}" ativa nesta instalação.`
          : 'Nenhuma conexão IXC ativa nesta instalação. Conecte o ERP primeiro.',
      );
    }

    // 1) Conexao explicita.
    if (scope.connectionId) {
      const found = active.find((c) => c.id === scope.connectionId);
      if (!found) throw new BadRequestException('Conexão de ERP informada não está ativa nesta instalação.');
      return found;
    }

    // 2) Tag/filial.
    const wantedTag = (scope.tag ?? '').trim().toLowerCase();
    if (wantedTag) {
      const byTag = active.find((c) => c.tags.some((t) => t.trim().toLowerCase() === wantedTag));
      if (byTag) return byTag;
    }

    // 3) Maior prioridade (ordem preservada do repositório).
    return active[0];
  }
}
