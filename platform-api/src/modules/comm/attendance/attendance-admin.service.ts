// CRUD de equipes/filas/membros da Central de Atendimento. Exclusao =
// SOFT-DELETE (is_active=false) com checagem de integridade + reativacao.
// Criar equipe NAO liga roteamento automatico (V1 = claim/transfer manual).
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceQueue, AttendanceTeam, CommTeamRole } from '@prisma/client';
import { AttendanceRepository } from './attendance.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AddMemberDto, CreateQueueDto, CreateTeamDto, UpdateQueueDto, UpdateTeamDto } from '../dto/attendance-admin.dto';

@Injectable()
export class AttendanceAdminService {
  constructor(
    private readonly repository: AttendanceRepository,
    private readonly audit: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Equipes ────────────────────────────────────────

  listTeams(includeInactive = false) {
    return this.repository.listTeams(includeInactive);
  }

  async createTeam(dto: CreateTeamDto) {
    const team = await this.repository.createTeam({
      name: dto.name,
      description: dto.description ?? null,
    } as Prisma.AttendanceTeamUncheckedCreateInput);
    await this.audit.record({
      action: 'comm.whatsapp.team.create',
      entityType: 'AttendanceTeam',
      entityId: team.id,
      newValue: { name: team.name },
    });
    return team;
  }

  async updateTeam(id: string, dto: UpdateTeamDto) {
    const before = await this.loadTeam(id);
    if (dto.default_queue_id) {
      const queue = await this.repository.findQueueById(dto.default_queue_id);
      if (!queue || !queue.is_active) {
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
      oldValue: { name: before.name, is_active: before.is_active, default_queue_id: before.default_queue_id },
      newValue: { name: team.name, is_active: team.is_active, default_queue_id: team.default_queue_id },
    });
    return team;
  }

  // ─── Filas ──────────────────────────────────────────

  listQueues(includeInactive = false) {
    return this.repository.listQueues(includeInactive);
  }

  async createQueue(dto: CreateQueueDto) {
    if (dto.team_id) await this.loadTeam(dto.team_id);
    const queue = await this.repository.createQueue({
      team_id: dto.team_id ?? null,
      name: dto.name,
      description: dto.description ?? null,
    } as Prisma.AttendanceQueueUncheckedCreateInput);
    await this.audit.record({
      action: 'comm.whatsapp.queue.create',
      entityType: 'AttendanceQueue',
      entityId: queue.id,
      newValue: { name: queue.name, team_id: queue.team_id },
    });
    return queue;
  }

  async updateQueue(id: string, dto: UpdateQueueDto) {
    const before = await this.loadQueue(id);
    if (dto.team_id) await this.loadTeam(dto.team_id);
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
      oldValue: { name: before.name, is_active: before.is_active },
      newValue: { name: queue.name, is_active: queue.is_active },
    });
    return queue;
  }

  // ─── Membros ────────────────────────────────────────

  async addMember(teamId: string, dto: AddMemberDto) {
    await this.loadTeam(teamId);
    const user = await this.repository.findUserActive(dto.user_id);
    if (!user) {
      throw new BadRequestException('Usuário inexistente ou inativo nesta instalação.');
    }
    const member = await this.repository.addMember(
      teamId,
      dto.user_id,
      dto.role as CommTeamRole,
      dto.receive_incident_alerts,
    );
    await this.audit.record({
      action: 'comm.whatsapp.team.member.add',
      entityType: 'AttendanceTeamMember',
      entityId: member.id,
      newValue: {
        team_id: teamId,
        user_id: dto.user_id,
        role: dto.role,
        receive_incident_alerts: member.receive_incident_alerts,
      },
    });
    return member;
  }

  async removeMember(teamId: string, userId: string) {
    await this.loadTeam(teamId);
    await this.repository.removeMember(teamId, userId);
    await this.audit.record({
      action: 'comm.whatsapp.team.member.remove',
      entityType: 'AttendanceTeamMember',
      oldValue: { team_id: teamId, user_id: userId },
    });
    return { ok: true };
  }

  listActiveUsers() {
    return this.repository.listActiveUsers();
  }

  // ─── Helpers privados ───────────────────────────────

  private async loadTeam(id: string): Promise<AttendanceTeam> {
    const team = await this.repository.findTeamById(id);
    if (!team) throw new NotFoundException('Equipe não encontrada.');
    return team;
  }

  private async loadQueue(id: string): Promise<AttendanceQueue> {
    const queue = await this.repository.findQueueById(id);
    if (!queue) throw new NotFoundException('Fila não encontrada.');
    return queue;
  }
}
