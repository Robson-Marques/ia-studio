// Servico de Incidentes/Manutencao (Fase 6). Regras:
//   * CRUD de incidentes (nasce DRAFT);
//   * resolve afetados via conectividade IXC no escopo → grava targets;
//   * vinculos manuais (incluir/excluir cliente);
//   * ativar (DRAFT/RESOLVED → ACTIVE): se modo PROACTIVE/COMBINED, dispara em
//     massa COM confirmacao (rate limit + log); reativo nao dispara;
//   * encerrar (ACTIVE → RESOLVED): se toggle notify_normalization, avisa.
// Mutations sensiveis (ativar, encerrar, disparo) sao auditadas.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  IspIncident,
  IspIncidentCommMode,
  IspIncidentStatus,
  Prisma,
} from '@prisma/client';
import { IspRepository } from './isp.repository';
import { IspConnectionResolver } from './isp-connection.resolver';
import { IspConnectivityService } from './isp-connectivity.service';
import { IspDispatchService, DispatchResult } from './isp-dispatch.service';
import { IspTeamAlertService, TeamAlertStats } from './isp-team-alert.service';
import { IspOsConfigService } from './isp-os-config.service';
import { scopeHash, scopeLabel } from './isp-scope.util';
import { AuditLogService } from '../../shared/audit/audit-log.service';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
  UpdateTargetsDto,
  DispatchIncidentDto,
} from './dto/incidents.dtos';

@Injectable()
export class IspIncidentsService {
  private readonly logger = new Logger(IspIncidentsService.name);

  constructor(
    private readonly repository: IspRepository,
    private readonly resolver: IspConnectionResolver,
    private readonly connectivity: IspConnectivityService,
    private readonly dispatch: IspDispatchService,
    private readonly teamAlert: IspTeamAlertService,
    private readonly osConfig: IspOsConfigService,
    private readonly audit: AuditLogService,
  ) {}

  // ─── Leitura ────────────────────────────────────────

  findAll(filters: { status?: IspIncidentStatus }) {
    return this.repository.findAll(filters);
  }

  async findOne(id: string): Promise<IspIncident> {
    const incident = await this.repository.findById(id);
    if (!incident) throw new NotFoundException('Incidente não encontrado.');
    return incident;
  }

  async findTargets(id: string) {
    await this.findOne(id);
    return this.repository.findTargets(id);
  }

  async findDispatches(id: string) {
    await this.findOne(id);
    return this.repository.findDispatches(id);
  }

  async findTeamAlerts(id: string) {
    await this.findOne(id);
    return this.repository.findTeamAlerts(id);
  }

  // ─── CRUD ───────────────────────────────────────────

  async create(dto: CreateIncidentDto, createdBy: string | null) {
    // Valida que a conexão IXC existe/ativa na instalação (não resolve aqui).
    await this.resolver.resolve({
      connectionId: dto.connection_id,
    });
    const incident = await this.repository.createIncident({
      title: dto.title,
      message: dto.message ?? null,
      forecast: dto.forecast ?? null,
      status: IspIncidentStatus.DRAFT,
      scope: (dto.scope ?? {}) as Prisma.InputJsonValue,
      connection_id: dto.connection_id,
      comm_mode: dto.comm_mode ?? IspIncidentCommMode.REACTIVE,
      toggles: (dto.toggles ?? {}) as Prisma.InputJsonValue,
      template_active_id: dto.template_active_id ?? null,
      template_normalized_id: dto.template_normalized_id ?? null,
      created_by: createdBy,
    });
    await this.audit.record({
      action: 'isp.incident.create',
      entityType: 'IspIncident',
      entityId: incident.id,
      newValue: { title: incident.title, comm_mode: incident.comm_mode, status: incident.status },
    });
    return incident;
  }

  async update(id: string, dto: UpdateIncidentDto) {
    const before = await this.findOne(id);
    const data: Prisma.IspIncidentUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.message !== undefined) data.message = dto.message;
    if (dto.forecast !== undefined) data.forecast = dto.forecast;
    if (dto.connection_id !== undefined) data.connection_id = dto.connection_id;
    if (dto.comm_mode !== undefined) data.comm_mode = dto.comm_mode;
    if (dto.scope !== undefined) data.scope = dto.scope as Prisma.InputJsonValue;
    if (dto.toggles !== undefined) data.toggles = dto.toggles as Prisma.InputJsonValue;
    if (dto.template_active_id !== undefined) data.template_active_id = dto.template_active_id;
    if (dto.template_normalized_id !== undefined) data.template_normalized_id = dto.template_normalized_id;
    if (dto.auto_detect !== undefined) data.auto_detect = dto.auto_detect;
    const incident = await this.repository.updateIncident(id, data);
    await this.audit.record({
      action: 'isp.incident.update',
      entityType: 'IspIncident',
      entityId: id,
      oldValue: { title: before.title, comm_mode: before.comm_mode },
      newValue: { title: incident.title, comm_mode: incident.comm_mode },
    });
    return incident;
  }

  // ─── Resolver afetados (conectividade IXC no escopo) ───────────

  async resolveAffected(id: string) {
    const incident = await this.findOne(id);
    const connection = await this.resolver.resolve({
      connectionId: incident.connection_id,
    });
    const summary = await this.connectivity.query(
      connection.id,
      (incident.scope ?? {}) as Record<string, unknown>,
    );
    // Grava so os OFFLINE como afetados (foco em quem esta sem servico); mantem
    // vinculos manuais. Se nao ha offline, grava todos para a UI decidir.
    const affected = summary.offline > 0 ? summary.rows.filter((r) => !r.online) : summary.rows;
    const targets = await this.repository.replaceScopeTargets(
      id,
      affected
        .filter((r) => r.customer_ref)
        .map((r) => ({ customer_ref: r.customer_ref, name: r.name, phone: r.phone, last_status: r.status })),
    );
    return { summary: { total: summary.total, offline: summary.offline, offline_pct: summary.offline_pct }, targets };
  }

  // ─── Targets (checkbox include/exclude + vinculos manuais) ──────────

  async updateTargets(id: string, dto: UpdateTargetsDto) {
    await this.findOne(id);
    if (dto.included_ids?.length) await this.repository.setIncluded(id, dto.included_ids, true);
    if (dto.excluded_ids?.length) await this.repository.setIncluded(id, dto.excluded_ids, false);
    for (const m of dto.manual ?? []) {
      await this.repository.upsertManualTarget(id, m);
    }
    return this.repository.findTargets(id);
  }

  // ─── Ativar / Encerrar (sensiveis) ──────────────────

  async activate(id: string, dispatchDto?: DispatchIncidentDto) {
    const incident = await this.findOne(id);
    if (incident.status === IspIncidentStatus.ACTIVE) {
      throw new ConflictException('Incidente já está ativo.');
    }
    const updated = await this.repository.updateIncident(id, {
      status: IspIncidentStatus.ACTIVE,
      activated_at: new Date(),
      resolved_at: null,
    });
    await this.audit.record({
      action: 'isp.incident.activate',
      entityType: 'IspIncident',
      entityId: id,
      oldValue: { status: incident.status },
      newValue: { status: updated.status, comm_mode: updated.comm_mode },
    });

    // Proativo/Combinado: dispara em massa na ativacao (exige confirmacao).
    let dispatch: DispatchResult | undefined;
    if (updated.comm_mode !== IspIncidentCommMode.REACTIVE) {
      if (!dispatchDto?.confirm) {
        throw new BadRequestException(
          'Modo proativo/combinado exige confirmação explícita do disparo em massa na ativação.',
        );
      }
      dispatch = await this.runDispatch(updated, dispatchDto);
    }
    return { incident: updated, dispatch };
  }

  async resolveIncident(id: string, dispatchDto?: DispatchIncidentDto) {
    const incident = await this.findOne(id);
    if (incident.status === IspIncidentStatus.RESOLVED) {
      throw new ConflictException('Incidente já está encerrado.');
    }
    const updated = await this.repository.updateIncident(id, {
      status: IspIncidentStatus.RESOLVED,
      resolved_at: new Date(),
    });
    await this.audit.record({
      action: 'isp.incident.resolve',
      entityType: 'IspIncident',
      entityId: id,
      oldValue: { status: incident.status },
      newValue: { status: updated.status },
    });

    // notify_normalization + proativo/combinado: avisa a normalizacao (com confirmacao).
    let dispatch: DispatchResult | undefined;
    const toggles = (updated.toggles ?? {}) as { notify_normalization?: boolean };
    if (toggles.notify_normalization && updated.comm_mode !== IspIncidentCommMode.REACTIVE && dispatchDto?.confirm) {
      dispatch = await this.dispatch.dispatch(updated, {
        confirm: true,
        ratePerSec: dispatchDto.rate_per_sec,
        normalized: true,
      });
    }
    return { incident: updated, dispatch };
  }

  // ─── Disparo proativo manual (endpoint dedicado) ────

  async dispatchIncident(id: string, dto: DispatchIncidentDto) {
    const incident = await this.findOne(id);
    if (incident.comm_mode === IspIncidentCommMode.REACTIVE) {
      throw new BadRequestException('Incidente em modo reativo não dispara em massa. Troque para proativo/combinado.');
    }
    if (incident.status !== IspIncidentStatus.ACTIVE) {
      throw new ConflictException('Só é possível disparar em massa para incidentes ativos.');
    }
    return this.runDispatch(incident, dto);
  }

  // ─── Deteccao de anomalia → alerta a equipe (frente 6) ──────────────
  //
  // Chamado pelo SISTEMA (tool status_regiao no modo reativo; cron de outage),
  // NUNCA pelo modelo. Registra um rascunho por escopo (dedup deterministico) e
  // aciona o plantao via WhatsApp — com cooldown pra nao re-spammar. O rascunho
  // nasce DRAFT (inerte: nao dispara nada ao cliente); a equipe promove na tela.

  async registerDetectedAnomaly(
    params: {
      connectionId: string;
      scope: Record<string, unknown>;
      stats?: TeamAlertStats;
      forecast?: string | null;
    },
  ): Promise<{ incident_id: string; created: boolean; alerted: boolean; channel?: string; reason?: string }> {
    const hash = scopeHash(params.scope);
    // Sem escopo nao ha dedup possivel (seria a base inteira) — nao registra.
    if (!hash) return { incident_id: '', created: false, alerted: false, reason: 'Escopo vazio.' };

    const cfg = await this.osConfig.getPlantaoConfig();
    let incident = await this.repository.findOpenByScopeHash(params.connectionId, hash);
    let created = false;

    if (!incident) {
      const label = scopeLabel(params.scope);
      incident = await this.repository.createIncident({
        title: label ? `Anomalia detectada — ${label}` : 'Anomalia de rede detectada',
        message: null,
        forecast: params.forecast ?? null,
        status: IspIncidentStatus.DRAFT,
        scope: params.scope as Prisma.InputJsonValue,
        scope_hash: hash,
        connection_id: params.connectionId,
        comm_mode: IspIncidentCommMode.REACTIVE,
        // Rascunho da deteccao reativa: NAO entra no sampling do cron (ja alertou).
        auto_detect: false,
        created_by: null,
      });
      created = true;
      await this.audit.record({
        action: 'isp.incident.auto_detected',
        entityType: 'IspIncident',
        entityId: incident.id,
        newValue: { title: incident.title, scope_hash: hash, stats: params.stats ?? null },
      });
    }

    const fired = await this.fireTeamAlert(incident, cfg.cooldown_min, params.stats, created);
    return { incident_id: incident.id, created, ...fired };
  }

  /**
   * Aciona o plantao para um incidente JA existente (usado pelo cron de outage,
   * que ja tem o rascunho auto_detect). Aplica o mesmo cooldown/dedup do caminho
   * reativo — reusa o IspTeamAlertService (nao reinventa o disparo).
   */
  async alertTeamForIncident(
    incidentId: string,
    stats?: TeamAlertStats,
  ): Promise<{ alerted: boolean; channel?: string; reason?: string }> {
    const incident = await this.repository.findById(incidentId);
    if (!incident) return { alerted: false, reason: 'Incidente inválido.' };
    const cfg = await this.osConfig.getPlantaoConfig();
    return this.fireTeamAlert(incident, cfg.cooldown_min, stats, false);
  }

  /** Cooldown anti-spam + disparo ao plantao + touch + auditoria. */
  private async fireTeamAlert(
    incident: IspIncident,
    cooldownMin: number,
    stats: TeamAlertStats | undefined,
    created: boolean,
  ): Promise<{ alerted: boolean; channel?: string; reason?: string }> {
    const cooldownMs = cooldownMin * 60 * 1000;
    const lastAt = incident.last_team_alert_at?.getTime() ?? 0;
    // created=true (rascunho novo) sempre alerta; senao respeita a janela.
    if (!created && cooldownMs > 0 && Date.now() - lastAt < cooldownMs) {
      return { alerted: false, reason: 'Em cooldown.' };
    }
    const alertResult = await this.teamAlert.alert(incident, { stats });
    await this.repository.touchTeamAlertAt(incident.id);
    await this.audit.record({
      action: 'isp.incident.team_alerted',
      entityType: 'IspIncident',
      entityId: incident.id,
      newValue: {
        channel: alertResult.channel,
        recipients: alertResult.recipients,
        sent: alertResult.sent,
        failed: alertResult.failed,
      },
    });
    return { alerted: true, channel: alertResult.channel };
  }

  private async runDispatch(incident: IspIncident, dto: DispatchIncidentDto): Promise<DispatchResult> {
    const result = await this.dispatch.dispatch(incident, {
      confirm: dto.confirm,
      ratePerSec: dto.rate_per_sec,
      normalized: dto.normalized,
    });
    await this.audit.record({
      action: 'isp.incident.dispatch',
      entityType: 'IspIncident',
      entityId: incident.id,
      newValue: { sent: result.sent, failed: result.failed, skipped: result.skipped, total: result.total },
    });
    return result;
  }
}
