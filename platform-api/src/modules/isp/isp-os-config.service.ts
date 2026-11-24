// Config de abertura de OS: descobre setores/assuntos do ERP (discover) e guarda
// os pares que o operador ativou. A IA nunca chuta id — usa só o que está aqui.
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConnectionsService } from '../integration/connections/connections.service';
import { SettingsService } from '../core/settings/settings.service';
import { SEED_CATALOG } from '../comm/whatsapp/template-catalog/catalog.seed';
import { IspConnectionResolver } from './isp-connection.resolver';
import { IspOsConfigRepository, OsConfigPair } from './isp-os-config.repository';
import {
  ISP_QUEUE_SETTING_KEYS,
  ISP_BOLETO_MAX_SETTING_KEY,
  ISP_BOLETO_MAX_DEFAULT,
  ISP_PAGAMENTO_TTL_SETTING_KEY,
  ISP_PAGAMENTO_TTL_DEFAULT,
  ISP_PAGAMENTO_BASE_URL_SETTING_KEY,
  ISP_PLANTAO_TEAM_SETTING_KEY,
  ISP_PLANTAO_LIMIAR_SETTING_KEY,
  ISP_PLANTAO_LIMIAR_DEFAULT,
  ISP_PLANTAO_TEMPLATE_SETTING_KEY,
  ISP_PLANTAO_COOLDOWN_SETTING_KEY,
  ISP_PLANTAO_COOLDOWN_DEFAULT,
  ISP_ENCERRAMENTO_TECNICO_SETTING_KEY,
} from './isp.constants';

export interface PlantaoConfig {
  team_id: string | null;
  limiar_pct: number;
  template: string | null;
  cooldown_min: number;
}

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

  /** Mapa setor→fila (Suporte/Financeiro) da instalação. */
  async getQueueMapping(): Promise<QueueMapping> {
    const suporte = await this.settings.getValue(ISP_QUEUE_SETTING_KEYS.suporte);
    const financeiro = await this.settings.getValue(ISP_QUEUE_SETTING_KEYS.financeiro);
    return {
      suporte: typeof suporte === 'string' && suporte ? suporte : null,
      financeiro: typeof financeiro === 'string' && financeiro ? financeiro : null,
    };
  }

  /** Grava o mapa setor→fila. Valor vazio/null = "não configurado". */
  async setQueueMapping(mapping: Partial<QueueMapping>): Promise<QueueMapping> {
    if (mapping.suporte !== undefined) {
      await this.settings.set(ISP_QUEUE_SETTING_KEYS.suporte, mapping.suporte ?? '');
    }
    if (mapping.financeiro !== undefined) {
      await this.settings.set(ISP_QUEUE_SETTING_KEYS.financeiro, mapping.financeiro ?? '');
    }
    return this.getQueueMapping();
  }

  /** Máximo de boletos em aberto que a IA envia (0 = sem limite). Determinístico. */
  async getBoletoMax(): Promise<number> {
    const raw = await this.settings.getValue(ISP_BOLETO_MAX_SETTING_KEY);
    if (typeof raw !== 'string' || !raw.trim()) return ISP_BOLETO_MAX_DEFAULT;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : ISP_BOLETO_MAX_DEFAULT;
  }

  /** Grava o máximo de boletos. Aceita 0 (todos) até um teto de segurança (20). */
  async setBoletoMax(max: number): Promise<number> {
    const n = Number.isFinite(max) ? Math.trunc(max) : ISP_BOLETO_MAX_DEFAULT;
    if (n < 0 || n > 20) throw new BadRequestException('Informe um número entre 0 (todos) e 20.');
    await this.settings.set(ISP_BOLETO_MAX_SETTING_KEY, String(n));
    return n;
  }

  /** Config do link público de pagamento (TTL em horas + URL pública base). */
  async getPagamentoConfig(): Promise<{ ttl_horas: number; base_url: string }> {
    const ttl = await this.settings.getValue(ISP_PAGAMENTO_TTL_SETTING_KEY);
    const base = await this.settings.getValue(ISP_PAGAMENTO_BASE_URL_SETTING_KEY);
    const n = typeof ttl === 'string' ? Number.parseInt(ttl, 10) : NaN;
    return {
      ttl_horas: Number.isFinite(n) && n > 0 ? n : ISP_PAGAMENTO_TTL_DEFAULT,
      base_url: typeof base === 'string' ? base : '',
    };
  }

  /** Grava TTL (1..168h) e URL pública (http/https). Valores vazios = limpar. */
  async setPagamentoConfig(
    cfg: { ttl_horas?: number; base_url?: string },
  ): Promise<{ ttl_horas: number; base_url: string }> {
    if (cfg.ttl_horas !== undefined) {
      const n = Math.trunc(Number(cfg.ttl_horas));
      if (!Number.isFinite(n) || n <= 0 || n > 168) throw new BadRequestException('Validade inválida (1 a 168 horas).');
      await this.settings.set(ISP_PAGAMENTO_TTL_SETTING_KEY, String(n));
    }
    if (cfg.base_url !== undefined) {
      const url = String(cfg.base_url).trim();
      if (url && !/^https?:\/\//i.test(url)) throw new BadRequestException('A URL pública deve começar com http:// ou https://.');
      await this.settings.set(ISP_PAGAMENTO_BASE_URL_SETTING_KEY, url.replace(/\/$/, ''));
    }
    return this.getPagamentoConfig();
  }

  /** Config do alerta de incidente à equipe de plantão. */
  async getPlantaoConfig(): Promise<PlantaoConfig> {
    const team = await this.settings.getValue(ISP_PLANTAO_TEAM_SETTING_KEY);
    const limiar = await this.settings.getValue(ISP_PLANTAO_LIMIAR_SETTING_KEY);
    const template = await this.settings.getValue(ISP_PLANTAO_TEMPLATE_SETTING_KEY);
    const cooldown = await this.settings.getValue(ISP_PLANTAO_COOLDOWN_SETTING_KEY);
    const limiarN = typeof limiar === 'string' ? Number.parseInt(limiar, 10) : NaN;
    const cooldownN = typeof cooldown === 'string' ? Number.parseInt(cooldown, 10) : NaN;
    return {
      team_id: typeof team === 'string' && team ? team : null,
      limiar_pct: Number.isFinite(limiarN) && limiarN >= 1 && limiarN <= 100 ? limiarN : ISP_PLANTAO_LIMIAR_DEFAULT,
      template: typeof template === 'string' && template ? template : SEED_CATALOG[0].name,
      cooldown_min: Number.isFinite(cooldownN) && cooldownN >= 0 ? cooldownN : ISP_PLANTAO_COOLDOWN_DEFAULT,
    };
  }

  /** Grava a config do plantão. Valores vazios = limpar (equipe/template). */
  async setPlantaoConfig(
    cfg: { team_id?: string | null; limiar_pct?: number; template?: string | null; cooldown_min?: number },
  ): Promise<PlantaoConfig> {
    if (cfg.team_id !== undefined) {
      await this.settings.set(ISP_PLANTAO_TEAM_SETTING_KEY, cfg.team_id ?? '');
    }
    if (cfg.limiar_pct !== undefined) {
      const n = Math.trunc(Number(cfg.limiar_pct));
      if (!Number.isFinite(n) || n < 1 || n > 100) throw new BadRequestException('Limiar inválido (1 a 100%).');
      await this.settings.set(ISP_PLANTAO_LIMIAR_SETTING_KEY, String(n));
    }
    if (cfg.template !== undefined) {
      await this.settings.set(ISP_PLANTAO_TEMPLATE_SETTING_KEY, (cfg.template ?? '').trim());
    }
    if (cfg.cooldown_min !== undefined) {
      const n = Math.trunc(Number(cfg.cooldown_min));
      if (!Number.isFinite(n) || n < 0 || n > 1440) throw new BadRequestException('Cooldown inválido (0 a 1440 minutos).');
      await this.settings.set(ISP_PLANTAO_COOLDOWN_SETTING_KEY, String(n));
    }
    return this.getPlantaoConfig();
  }

  /** Id do técnico curado para analisar/finalizar a O.S. no encerramento. Null = encerra direto. */
  async getEncerramentoTecnico(): Promise<string | null> {
    const raw = await this.settings.getValue(ISP_ENCERRAMENTO_TECNICO_SETTING_KEY);
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  }

  /** Grava o técnico do encerramento. Vazio/null = limpar (passa a encerrar direto). */
  async setEncerramentoTecnico(tecnicoId: string | null): Promise<string | null> {
    const v = (tecnicoId ?? '').trim();
    if (v && !/^\d+$/.test(v)) throw new BadRequestException('Id do técnico deve ser numérico.');
    await this.settings.set(ISP_ENCERRAMENTO_TECNICO_SETTING_KEY, v);
    return this.getEncerramentoTecnico();
  }

  private async resolveConnectionId(connectionId?: string): Promise<string> {
    if (connectionId) return connectionId;
    const conn = await this.resolver.resolve({});
    return conn.id;
  }

  /** Lista setores e assuntos do ERP (via Descobrir recursos da conexão). */
  async discover(
    connectionId?: string,
  ): Promise<{ connection_id: string; setores: DiscoveredOption[]; assuntos: DiscoveredOption[] }> {
    const connId = await this.resolveConnectionId(connectionId);
    const result = await this.connections.discover(connId);
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

  list(connectionId: string) {
    return this.repo.listByConnection(connectionId);
  }

  /** Salva o conjunto de pares. Garante NO MÁXIMO um padrão (o 1º marcado). */
  async save(connectionId: string, createdBy: string | null, pairs: OsConfigPair[]) {
    if (!connectionId) throw new BadRequestException('Informe a conexão.');
    let defaultSeen = false;
    const normalized = pairs
      .filter((p) => p.setor_id && p.assunto_id)
      .map((p) => {
        const isDefault = !!p.is_default && !defaultSeen;
        if (isDefault) defaultSeen = true;
        return { ...p, is_default: isDefault };
      });
    return this.repo.replaceForConnection(connectionId, createdBy, normalized);
  }

  /** Par padrão de suporte (pra IA abrir a OS). Null = não configurado. */
  defaultForSupport(connectionId: string) {
    return this.repo.defaultForConnection(connectionId);
  }
}
