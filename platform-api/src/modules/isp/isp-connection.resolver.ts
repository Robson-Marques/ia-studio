// Resolvedor da conexao Altarede (ERP) — a solucao ISP e multi-instancia:
// matriz/filiais/clientes distintos = N conexoes Altarede. As tools do agente
// nunca conhecem a conexao; passam org (+ escopo/tag opcional) e este resolver
// escolhe a Connection altarede ACTIVE. Espelha a logica do Meta Orchestrator.
import { BadRequestException, Injectable } from '@nestjs/common';
import { Connection, ConnectionStatus } from '@prisma/client';
import { ConnectionsRepository } from '../integration/connections/connections.repository';
import { ALTAREDE_PROVIDER_KEY } from './isp.constants';

export interface AltaredeResolveScope {
  organizationId: string;
  workspaceId?: string;
  environmentId?: string;
  /** Conexao explicita (config da tool/incidente) — prioridade maxima. */
  connectionId?: string;
  /** Tag/filial (Connection.tags) quando ha multiplas Altarede. */
  tag?: string;
}

@Injectable()
export class IspConnectionResolver {
  constructor(private readonly connections: ConnectionsRepository) {}

  async resolve(scope: AltaredeResolveScope): Promise<Connection> {
    const all = await this.connections.findAllByOrg(scope.organizationId, {
      providerKey: ALTAREDE_PROVIDER_KEY,
      workspaceId: scope.workspaceId,
      environmentId: scope.environmentId,
    });
    const active = all.filter((c) => c.status === ConnectionStatus.ACTIVE);
    if (active.length === 0) {
      throw new BadRequestException('Nenhuma conexão Altarede ativa neste escopo. Conecte o ERP primeiro.');
    }

    // 1) Conexao explicita.
    if (scope.connectionId) {
      const found = active.find((c) => c.id === scope.connectionId);
      if (!found) throw new BadRequestException('Conexão Altarede informada não está ativa neste escopo.');
      return found;
    }

    // 2) Tag/filial.
    const wanted = (scope.tag ?? '').trim().toLowerCase();
    if (wanted) {
      const byTag = active.find((c) => c.tags.some((t) => t.trim().toLowerCase() === wanted));
      if (byTag) return byTag;
    }

    // 3) Maior prioridade (findAllByOrg ordena priority desc, created_at asc).
    return active[0];
  }
}
