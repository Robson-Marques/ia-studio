// Porta unica ao banco do modulo ISP (isp_incidents / isp_incident_targets /
// isp_incident_dispatches). Nenhum service toca Prisma direto.
import { Injectable } from '@nestjs/common';
import { IspIncidentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class IspRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Incidentes ─────────────────────────────────────

  findAll(organizationId: string, filters: { workspaceId?: string; environmentId?: string; status?: IspIncidentStatus } = {}) {
    const where: Prisma.IspIncidentWhereInput = { organization_id: organizationId };
    if (filters.workspaceId) where.workspace_id = filters.workspaceId;
    if (filters.environmentId) where.environment_id = filters.environmentId;
    if (filters.status) where.status = filters.status;
    return this.prisma.ispIncident.findMany({
      where,
      orderBy: { created_at: 'desc' },
      include: { _count: { select: { targets: true, dispatches: true } } },
    });
  }

  findById(id: string) {
    return this.prisma.ispIncident.findUnique({ where: { id } });
  }

  findByIdWithTargets(id: string) {
    return this.prisma.ispIncident.findUnique({
      where: { id },
      include: { targets: { orderBy: { created_at: 'asc' } } },
    });
  }

  /** Incidentes ACTIVE de uma org (consulta reativa das tools). */
  findActive(organizationId: string) {
    return this.prisma.ispIncident.findMany({
      where: { organization_id: organizationId, status: IspIncidentStatus.ACTIVE },
      include: { targets: true },
    });
  }

  /** Rascunhos com deteccao automatica ligada (cron de outage — nasce OFF). */
  findAutoDetectDrafts() {
    return this.prisma.ispIncident.findMany({
      where: { status: IspIncidentStatus.DRAFT, auto_detect: true },
    });
  }

  createIncident(data: Prisma.IspIncidentUncheckedCreateInput) {
    return this.prisma.ispIncident.create({ data });
  }

  updateIncident(id: string, data: Prisma.IspIncidentUpdateInput) {
    return this.prisma.ispIncident.update({ where: { id }, data });
  }

  // ─── Targets ────────────────────────────────────────

  findTargets(incidentId: string) {
    return this.prisma.ispIncidentTarget.findMany({
      where: { incident_id: incidentId },
      orderBy: { created_at: 'asc' },
    });
  }

  findIncludedTargets(incidentId: string) {
    return this.prisma.ispIncidentTarget.findMany({
      where: { incident_id: incidentId, included: true },
    });
  }

  /** Substitui os targets de origem SCOPE por uma nova resolucao (mantem MANUAL). */
  async replaceScopeTargets(
    incidentId: string,
    organizationId: string,
    rows: { customer_ref: string; name?: string; phone?: string; last_status?: string }[],
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.ispIncidentTarget.deleteMany({ where: { incident_id: incidentId, source: 'SCOPE' } });
      if (rows.length === 0) return;
      await tx.ispIncidentTarget.createMany({
        data: rows.map((r) => ({
          organization_id: organizationId,
          incident_id: incidentId,
          customer_ref: r.customer_ref,
          name: r.name ?? null,
          phone: r.phone ?? null,
          last_status: r.last_status ?? null,
          source: 'SCOPE' as const,
        })),
        skipDuplicates: true,
      });
    });
    return this.findTargets(incidentId);
  }

  upsertManualTarget(
    incidentId: string,
    organizationId: string,
    data: { customer_ref: string; name?: string; phone?: string },
  ) {
    return this.prisma.ispIncidentTarget.upsert({
      where: { incident_id_customer_ref: { incident_id: incidentId, customer_ref: data.customer_ref } },
      create: {
        organization_id: organizationId,
        incident_id: incidentId,
        customer_ref: data.customer_ref,
        name: data.name ?? null,
        phone: data.phone ?? null,
        source: 'MANUAL',
        included: true,
      },
      update: { name: data.name ?? null, phone: data.phone ?? null, included: true },
    });
  }

  setIncluded(incidentId: string, ids: string[], included: boolean) {
    if (ids.length === 0) return Promise.resolve({ count: 0 });
    return this.prisma.ispIncidentTarget.updateMany({
      where: { incident_id: incidentId, id: { in: ids } },
      data: { included },
    });
  }

  // ─── Dispatches ─────────────────────────────────────

  createDispatch(data: Prisma.IspIncidentDispatchUncheckedCreateInput) {
    return this.prisma.ispIncidentDispatch.create({ data });
  }

  findDispatches(incidentId: string) {
    return this.prisma.ispIncidentDispatch.findMany({
      where: { incident_id: incidentId },
      orderBy: { created_at: 'desc' },
    });
  }

  // ─── Deteccao/dedup por escopo (frente 6) ───────────

  /**
   * Incidente ABERTO (DRAFT ou ACTIVE) que cobre o mesmo escopo/conexao — ancora
   * de dedup: um escopo tem um rascunho aberto (o 2o cliente da regiao nao cria
   * outro). Match deterministico pelo hash do escopo normalizado.
   */
  findOpenByScopeHash(organizationId: string, connectionId: string, scopeHash: string) {
    return this.prisma.ispIncident.findFirst({
      where: {
        organization_id: organizationId,
        connection_id: connectionId,
        scope_hash: scopeHash,
        status: { in: [IspIncidentStatus.DRAFT, IspIncidentStatus.ACTIVE] },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  /** Marca o instante do ultimo alerta a equipe (cooldown anti-spam). */
  touchTeamAlertAt(id: string) {
    return this.prisma.ispIncident.update({ where: { id }, data: { last_team_alert_at: new Date() } });
  }

  // ─── Alerta a equipe de plantao (frente 6) ──────────

  /**
   * Destinatarios do plantao: membros da equipe com opt-in ligado, cujo usuario
   * esta ativo e tem telefone cadastrado. Dois passos (AttendanceTeamMember nao
   * tem relation com User no schema) — resolve os user_ids, depois os usuarios.
   */
  async findPlantaoRecipients(
    organizationId: string,
    teamId: string,
  ): Promise<{ user_id: string; name: string; phone: string }[]> {
    const members = await this.prisma.attendanceTeamMember.findMany({
      where: { organization_id: organizationId, team_id: teamId, receive_incident_alerts: true },
      select: { user_id: true },
    });
    const ids = members.map((m) => m.user_id);
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids }, is_active: true, deleted_at: null, whatsapp_phone: { not: null } },
      select: { id: true, name: true, whatsapp_phone: true },
    });
    return users
      .filter((u) => (u.whatsapp_phone ?? '').trim())
      .map((u) => ({ user_id: u.id, name: u.name, phone: (u.whatsapp_phone as string).trim() }));
  }

  createTeamAlert(data: Prisma.IspIncidentTeamAlertUncheckedCreateInput) {
    return this.prisma.ispIncidentTeamAlert.create({ data });
  }

  findTeamAlerts(incidentId: string) {
    return this.prisma.ispIncidentTeamAlert.findMany({
      where: { incident_id: incidentId },
      orderBy: { created_at: 'desc' },
    });
  }
}
