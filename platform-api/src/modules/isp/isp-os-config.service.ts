// Config de abertura de OS: descobre setores/assuntos do ERP (discover) e guarda
// os pares que o operador ativou. A IA nunca chuta id — usa só o que está aqui.
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConnectionsService } from '../integration/connections/connections.service';
import { SettingsService } from '../core/settings/settings.service';
import { IspConnectionResolver } from './isp-connection.resolver';
import { IspOsConfigRepository, OsConfigPair } from './isp-os-config.repository';
import { ISP_QUEUE_SETTING_KEYS, ISP_BOLETO_MAX_SETTING_KEY, ISP_BOLETO_MAX_DEFAULT } from './isp.constants';

export interface DiscoveredOption {
  id: string;
  name: string;
}

export interface QueueMapping {
  suporte: string | null;
  financeiro: string | null;
}

@Injectable()
export class IspOsConfigService {
  constructor(
    private readonly repo: IspOsConfigRepository,
    private readonly connections: ConnectionsService,
    private readonly resolver: IspConnectionResolver,
    private readonly settings: SettingsService,
  ) {}

  /** Mapa setor→fila (Suporte/Financeiro) da organização. */
  async getQueueMapping(organizationId: string): Promise<QueueMapping> {
    const suporte = await this.settings.getValue(organizationId, ISP_QUEUE_SETTING_KEYS.suporte);
    const financeiro = await this.settings.getValue(organizationId, ISP_QUEUE_SETTING_KEYS.financeiro);
    return {
      suporte: typeof suporte === 'string' && suporte ? suporte : null,
      financeiro: typeof financeiro === 'string' && financeiro ? financeiro : null,
    };
  }

  /** Grava o mapa setor→fila. Valor vazio/null = "não configurado". */
  async setQueueMapping(organizationId: string, mapping: Partial<QueueMapping>): Promise<QueueMapping> {
    if (mapping.suporte !== undefined) {
      await this.settings.set(organizationId, ISP_QUEUE_SETTING_KEYS.suporte, mapping.suporte ?? '');
    }
    if (mapping.financeiro !== undefined) {
      await this.settings.set(organizationId, ISP_QUEUE_SETTING_KEYS.financeiro, mapping.financeiro ?? '');
    }
    return this.getQueueMapping(organizationId);
  }

  /** Máximo de boletos em aberto que a IA envia (0 = sem limite). Determinístico. */
  async getBoletoMax(organizationId: string): Promise<number> {
    const raw = await this.settings.getValue(organizationId, ISP_BOLETO_MAX_SETTING_KEY);
    if (typeof raw !== 'string' || !raw.trim()) return ISP_BOLETO_MAX_DEFAULT;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : ISP_BOLETO_MAX_DEFAULT;
  }

  /** Grava o máximo de boletos. Aceita 0 (todos) até um teto de segurança (20). */
  async setBoletoMax(organizationId: string, max: number): Promise<number> {
    const n = Number.isFinite(max) ? Math.trunc(max) : ISP_BOLETO_MAX_DEFAULT;
    if (n < 0 || n > 20) throw new BadRequestException('Informe um número entre 0 (todos) e 20.');
    await this.settings.set(organizationId, ISP_BOLETO_MAX_SETTING_KEY, String(n));
    return n;
  }

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
