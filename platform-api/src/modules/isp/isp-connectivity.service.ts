// Leitura de conectividade Altarede (conectividade/listar/com_status) — usada
// para resolver afetados de um incidente e para a deteccao de outage. A IA/
// servicos NUNCA chamam a API direto: tudo via ConnectionsService.execute.
import { Injectable, Logger } from '@nestjs/common';
import { ConnectionsService } from '../integration/connections/connections.service';
import { ScopeKey, SCOPE_KEYS } from './isp.constants';

export interface ConnectivityRow {
  customer_ref: string;
  name?: string;
  phone?: string;
  status: string;
  online: boolean;
}

export interface ConnectivitySummary {
  total: number;
  offline: number;
  online: number;
  offline_pct: number;
  rows: ConnectivityRow[];
}

@Injectable()
export class IspConnectivityService {
  private readonly logger = new Logger(IspConnectivityService.name);

  constructor(private readonly connections: ConnectionsService) {}

  /** Limpa o escopo para conter apenas as chaves de filtro conhecidas. */
  sanitizeScope(scope: Record<string, unknown> | null | undefined): Record<ScopeKey, string> {
    const out = {} as Record<ScopeKey, string>;
    for (const key of SCOPE_KEYS) {
      const value = scope?.[key];
      if (typeof value === 'string' && value.trim()) out[key] = value.trim();
    }
    return out;
  }

  /** Consulta a conectividade no escopo e agrega % offline + linhas normalizadas. */
  async query(
    organizationId: string,
    connectionId: string,
    scope: Record<string, unknown>,
  ): Promise<ConnectivitySummary> {
    const params = this.sanitizeScope(scope);
    const raw = await this.connections.execute(
      organizationId,
      connectionId,
      'conectividade.listar_com_status',
      params,
    );
    const rows = this.extractRows(raw);
    const offline = rows.filter((r) => !r.online).length;
    const total = rows.length;
    return {
      total,
      offline,
      online: total - offline,
      offline_pct: total > 0 ? Math.round((offline / total) * 100) : 0,
      rows,
    };
  }

  // ─── Helpers ────────────────────────────────────────

  private extractRows(raw: unknown): ConnectivityRow[] {
    // O provider retorna { data: [...] }.
    const data = raw && typeof raw === 'object' ? (raw as { data?: unknown }).data : raw;
    if (!Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).map((row) => {
      const status = String(row['STATUS'] ?? row['status'] ?? '').trim();
      const login = String(row['LOGIN'] ?? row['login'] ?? row['CPF'] ?? row['cpf'] ?? '');
      const phone = String(row['TELEFONE_CELULAR1'] ?? row['TELEFONE_CELULAR2'] ?? row['telefone'] ?? '');
      // Quando o provider ja resolveu o estado (campo booleano `online`), essa e
      // a fonte da verdade. A regex sobre o texto e so o fallback pra providers
      // que devolvem apenas o rotulo — depender dela e fragil: mudar "Offline"
      // para "Desconectado" inverteria a contagem sem quebrar nada visivelmente.
      const online = typeof row['online'] === 'boolean'
        ? (row['online'] as boolean)
        : /online|conectad|ativo|up/i.test(status);
      return {
        customer_ref: login,
        name: this.str(row['NOME'] ?? row['nome']),
        phone: phone || undefined,
        status,
        online,
      };
    });
  }

  private str(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
