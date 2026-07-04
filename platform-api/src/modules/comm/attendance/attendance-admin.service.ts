// CRUD de equipes/filas/membros da Central de Atendimento. Exclusao =
// SOFT-DELETE (is_active=false) com checagem de integridade + reativacao.
// Criar equipe NAO liga roteamento automatico (V1 = claim/transfer manual).
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceQueue, AttendanceTeam, CommTeamRole } from '@prisma/client';
import { AttendanceRepository } from './attendance.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { validateWorkspaceScope } from '../../../shared/auth/tenant.util';
import { AddMemberDto, CreateQueueDto, CreateTeamDto, UpdateQueueDto, UpdateTeamDto } from '../dto/attendance-admin.dto';

@Injectable()
export class AttendanceAdminService {
  constructor(
    private readonly repository: AttendanceRepository,
    private readonly audit: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Equipes ────────────────────────────────────────

  listTeams(organizationId: string, environmentId?: string, includeInactive = false) {
    return this.repository.listTeams(organizationId, environmentId, includeInactive);
  }

  async createTeam(organizationId: string, dto: CreateTeamDto) {
    await validateWorkspaceScope(this.prisma, organizationId, dto.workspace_id, dto.environment_id);
    const team = await this.repository.createTeam({
      organization_id: organizationId,
      workspace_id: dto.workspace_id,
      environment_id: dto.environment_id,
      name: dto.name,
      description: dto.description ?? null,
    });
    await this.audit.record({
      action: 'comm.whatsapp.team.create',
      entityType: 'AttendanceTeam',
      entityId: team.id,
      organizationId,
      newValue: { name: team.name },
    });
    return team;
  }

  async updateTeam(organizationId: string, id: string, dto: UpdateTeamDto) {
    const before = await this.loadTeam(organizationId, id);
    if (dto.default_queue_id) {
      const queue = await this.repository.findQueueById(dto.default_queue_id);
      if (!queue || queue.organization_id !== organizationId || !queue.is_active) {
        throw new BadRequestException('Fila padrão inexistente ou inativa.');
      }
    }
    if (dto.is_active === false) {
      // Soft-delete com integridade: sem conversa aberta apontando pra equipe.
      const openChats = await this.prisma.whatsappChat.count({
        where: { team_id: id, attendance_status: { not: 'CLOSED' } },
      });
      if (openChats > 0) {
        throw new ConflictException(
          `Equipe com ${openChats} conversa(s) aberta(s) — transfira antes de desativar.`,
        );
      }
    }
    const team = await this.repository.updateTeam(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.default_queue_id !== undefined ? { default_queue_id: dto.default_queue_id } : {}),
      ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
    });
    await this.audit.record({
      action: 'comm.whatsapp.team.update',
      entityType: 'AttendanceTeam',
      entityId: id,
      organizationId,
      oldValue: { name: before.name, is_active: before.is_active, default_queue_id: before.default_queue_id },
      newValue: { name: team.name, is_active: team.is_active, default_queue_id: team.default_queue_id },
    });
    return team;
  }

  // ─── Filas ──────────────────────────────────────────

  listQueues(organizationId: string, environmentId?: string, includeInactive = false) {
    return this.repository.listQueues(organizationId, environmentId, includeInactive);
  }

  async createQueue(organizationId: string, dto: CreateQueueDto) {
    await validateWorkspaceScope(this.prisma, organizationId, dto.workspace_id, dto.environment_id);
    if (dto.team_id) await this.loadTeam(organizationId, dto.team_id);
    const queue = await this.repository.createQueue({
      organization_id: organizationId,
      workspace_id: dto.workspace_id,
      environment_id: dto.environment_id,
      team_id: dto.team_id ?? null,
      name: dto.name,
      description: dto.description ?? null,
    });
    await this.audit.record({
      action: 'comm.whatsapp.queue.create',
      entityType: 'AttendanceQueue',
      entityId: queue.id,
      organizationId,
      newValue: { name: queue.name, team_id: queue.team_id },
    });
    return queue;
  }

  async updateQueue(organizationId: string, id: string, dto: UpdateQueueDto) {
    const before = await this.loadQueue(organizationId, id);
    if (dto.team_id) await this.loadTeam(organizationId, dto.team_id);
    if (dto.is_active === false) {
      const openChats = await this.repository.countChatsInQueue(id);
      if (openChats > 0) {
        throw new ConflictException(
          `Fila com ${openChats} conversa(s) aberta(s) — transfira antes de desativar.`,
        );
      }
    }
    const queue = await this.repository.updateQueue(id, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.team_id !== undefined ? { team_id: dto.team_id } : {}),
      ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
    });
    await this.audit.record({
      action: 'comm.whatsapp.queue.update',
      entityType: 'AttendanceQueue',
      entityId: id,
      organizationId,
      oldValue: { name: before.name, is_active: before.is_active },
      newValue: { name: queue.name, is_active: queue.is_active },
    });
    return queue;
  }

  // ─── Membros ────────────────────────────────────────

  async addMember(organizationId: string, teamId: string, dto: AddMemberDto) {
    await this.loadTeam(organizationId, teamId);
    const user = await this.repository.findUserActive(dto.user_id);
    if (!user || user.organization_id !== organizationId) {
      throw new BadRequestException('Usuário inexistente ou inativo nesta organização.');
    }
    const member = await this.repository.addMember(organizationId, teamId, dto.user_id, dto.role as CommTeamRole);
    await this.audit.record({
      action: 'comm.whatsapp.team.member.add',
      entityType: 'AttendanceTeamMember',
      entityId: member.id,
      organizationId,
      newValue: { team_id: teamId, user_id: dto.user_id, role: dto.role },
    });
    return member;
  }

  async removeMember(organizationId: string, teamId: string, userId: string) {
    await this.loadTeam(organizationId, teamId);
    await this.repository.removeMember(teamId, userId);
    await this.audit.record({
      action: 'comm.whatsapp.team.member.remove',
      entityType: 'AttendanceTeamMember',
      organizationId,
      oldValue: { team_id: teamId, user_id: userId },
    });
    return { ok: true };
  }

  listOrgUsers(organizationId: string) {
    return this.repository.listOrgUsers(organizationId);
  }

  // ─── Helpers privados ───────────────────────────────

  private async loadTeam(organizationId: string, id: string): Promise<AttendanceTeam> {
    const team = await this.repository.findTeamById(id);
    if (!team || team.organization_id !== organizationId) throw new NotFoundException('Equipe não encontrada.');
    return team;
  }

  private async loadQueue(organizationId: string, id: string): Promise<AttendanceQueue> {
    const queue = await this.repository.findQueueById(id);
    if (!queue || queue.organization_id !== organizationId) throw new NotFoundException('Fila não encontrada.');
    return queue;
  }
}
