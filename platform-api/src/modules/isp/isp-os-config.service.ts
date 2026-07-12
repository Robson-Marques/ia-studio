// Config de abertura de OS: descobre setores/assuntos do ERP (discover) e guarda
// os pares que o operador ativou. A IA nunca chuta id — usa só o que está aqui.
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConnectionsService } from '../integration/connections/connections.service';
import { IspConnectionResolver } from './isp-connection.resolver';
import { IspOsConfigRepository, OsConfigPair } from './isp-os-config.repository';

export interface DiscoveredOption {
  id: string;
  name: string;
}

@Injectable()
export class IspOsConfigService {
  constructor(
    private readonly repo: IspOsConfigRepository,
    private readonly connections: ConnectionsService,
    private readonly resolver: IspConnectionResolver,
  ) {}

  private async resolveConnectionId(organizationId: string, connectionId?: string): Promise<string> {
    if (connectionId) return connectionId;
    const conn = await this.resolver.resolve({ organizationId });
    return conn.id;
  }

  /** Lista setores e assuntos do ERP (via Descobrir recursos da conexão). */
  async discover(
    organizationId: string,
    connectionId?: string,
  ): Promise<{ connection_id: string; setores: DiscoveredOption[]; assuntos: DiscoveredOption[] }> {
    const connId = await this.resolveConnectionId(organizationId, connectionId);
    const result = await this.connections.discover(organizationId, connId);
    const resources = result?.resources ?? [];
    const pick = (kind: string): DiscoveredOption[] =>
      resources.filter((r) => r.kind === kind).map((r) => ({ id: r.id, name: r.name }));
    return {
      connection_id: connId,
      setores: pick('setor'),
      // No IXC o assunto é descoberto como 'motivo_atendimento'.
      assuntos: pick('motivo_atendimento'),
    };
  }

  list(organizationId: string, connectionId: string) {
    return this.repo.listByConnection(organizationId, connectionId);
  }

  /** Salva o conjunto de pares. Garante NO MÁXIMO um padrão (o 1º marcado). */
  async save(organizationId: string, connectionId: string, createdBy: string | null, pairs: OsConfigPair[]) {
    if (!connectionId) throw new BadRequestException('Informe a conexão.');
    let defaultSeen = false;
    const normalized = pairs
      .filter((p) => p.setor_id && p.assunto_id)
      .map((p) => {
        const isDefault = !!p.is_default && !defaultSeen;
        if (isDefault) defaultSeen = true;
        return { ...p, is_default: isDefault };
      });
    return this.repo.replaceForConnection(organizationId, connectionId, createdBy, normalized);
  }

  /** Par padrão de suporte (pra IA abrir a OS). Null = não configurado. */
  defaultForSupport(organizationId: string, connectionId: string) {
    return this.repo.defaultForConnection(organizationId, connectionId);
  }
}
