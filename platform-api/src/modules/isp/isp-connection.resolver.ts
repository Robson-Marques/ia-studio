// Resolvedor da conexao de ERP do provedor — a solucao ISP e multi-instancia e
// multi-ERP: matriz/filiais/clientes distintos = N conexoes (Altarede e/ou IXC).
// As tools do agente nunca conhecem a conexao nem o ERP; passam org (+ escopo/
// tag opcional) e este resolver escolhe uma Connection ACTIVE de um dos ERPs
// suportados. Espelha a logica do Meta Orchestrator.
import { BadRequestException, Injectable } from '@nestjs/common';
import { Connection, ConnectionStatus } from '@prisma/client';
import { ConnectionsRepository } from '../integration/connections/connections.repository';
import { ISP_ERP_PROVIDER_KEYS } from './isp.constants';

export interface IspErpResolveScope {
  organizationId: string;
  workspaceId?: string;
  environmentId?: string;
  /** Conexao explicita (config da tool/incidente) — prioridade maxima. */
  connectionId?: string;
  /** Tag/filial (Connection.tags) quando ha multiplas conexoes de ERP. */
  tag?: string;
  /** Forca um ERP especifico (`altarede` | `ixc`) quando a org tem os dois. */
  providerKey?: string;
}

/** @deprecated Nome antigo, mantido pra nao quebrar chamadores. */
export type AltaredeResolveScope = IspErpResolveScope;

@Injectable()
export class IspConnectionResolver {
  constructor(private readonly connections: ConnectionsRepository) {}

  async resolve(scope: IspErpResolveScope): Promise<Connection> {
    // Uma consulta so; o filtro por ERP e feito aqui (findAllByOrg aceita uma
    // providerKey por vez e ja ordena por priority desc, created_at asc).
    const all = await this.connections.findAllByOrg(scope.organizationId, {
      workspaceId: scope.workspaceId,
      environmentId: scope.environmentId,
    });
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
          ? `Nenhuma conexão "${wantedProvider}" ativa neste escopo.`
          : 'Nenhuma conexão de ERP do provedor (Altarede ou IXC) ativa neste escopo. Conecte o ERP primeiro.',
      );
    }

    // 1) Conexao explicita.
    if (scope.connectionId) {
      const found = active.find((c) => c.id === scope.connectionId);
      if (!found) throw new BadRequestException('Conexão de ERP informada não está ativa neste escopo.');
      return found;
    }

    // 2) Tag/filial.
    const wantedTag = (scope.tag ?? '').trim().toLowerCase();
    if (wantedTag) {
      const byTag = active.find((c) => c.tags.some((t) => t.trim().toLowerCase() === wantedTag));
      if (byTag) return byTag;
    }

    // 3) Maior prioridade (ordem preservada do findAllByOrg).
    return active[0];
  }
}
