// Resource Explorer (diretriz 23) — READ-ONLY. Dado (connection, resource_type,
// query), resolve o mapping ATIVO + IProvider.execute() e devolve registros
// CANONICOS (lista/busca/detalhe). Nao persiste nada. So operacoes de leitura
// sao permitidas (allowlist de operacoes read-only por resource_type/mapping).
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConnectionsService } from '../integration/connections/connections.service';
import { ResourceRepository } from './resource.repository';
import { ResourceMapperService, CanonicalRecord } from './resource-mapper.service';

export interface ExploreArgs {
  connectionId: string;
  resourceType: string;
  /** Filtro de busca livre (repassado como parametro para a operacao). */
  query?: string;
  /** Parametros adicionais para a operacao de leitura (ex.: { login: "x" }). */
  params?: Record<string, unknown>;
}

export interface ExploreResult {
  resource_type: string;
  source_operation: string;
  mapping_id: string;
  count: number;
  records: CanonicalRecord[];
  /** true = houve mapping mas a operacao devolveu vazio (sem resultados). */
  empty: boolean;
}

@Injectable()
export class ResourceExplorerService {
  private readonly logger = new Logger(ResourceExplorerService.name);

  constructor(
    private readonly connections: ConnectionsService,
    private readonly repository: ResourceRepository,
    private readonly mapper: ResourceMapperService,
  ) {}

  async explore(args: ExploreArgs): Promise<ExploreResult> {
    const connection = await this.connections.findById(args.connectionId);
    const mapping = await this.repository.findActiveForResource(
      connection.provider_key,
      connection.id,
      args.resourceType,
    );
    if (!mapping) {
      throw new BadRequestException(
        `Nenhum mapeamento ativo de ${args.resourceType} para esta conexão. Crie e ative um mapeamento em Recursos → Mapeamentos.`,
      );
    }

    // Parametros da operacao: query livre + params explicitos. A operacao e
    // definida no mapping (source_operation) — read-only por design do Explorer.
    const params: Record<string, unknown> = { ...(args.params ?? {}) };
    if (args.query) params['query'] = args.query;

    const raw = await this.connections.execute(connection.id, mapping.source_operation, params);

    const rows = this.extractRows(raw);
    const records = this.mapper.toCanonicalList(mapping, rows);
    return {
      resource_type: args.resourceType,
      source_operation: mapping.source_operation,
      mapping_id: mapping.id,
      count: records.length,
      records,
      empty: records.length === 0,
    };
  }

  /**
   * Normaliza o resultado do provider numa lista de registros brutos.
   * Aceita: array; { data: [...] }; { data: {...} } (registro unico); objeto
   * unico. Vazio → [].
   */
  private extractRows(raw: unknown): unknown[] {
    if (raw === null || raw === undefined) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if ('data' in obj) {
        const data = obj['data'];
        if (Array.isArray(data)) return data;
        if (data && typeof data === 'object') return [data];
        return [];
      }
      return [obj];
    }
    return [];
  }
}
