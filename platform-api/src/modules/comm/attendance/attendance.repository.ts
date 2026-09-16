// Porta unica ao banco de equipes/filas/membros do atendimento
// (comm_attendance_teams / comm_attendance_queues / comm_attendance_members).
// Exclusao = SOFT-DELETE (is_active=false) — nunca DELETE fisico de equipe/fila.
import { Injectable } from '@nestjs/common';
import { AttendanceQueue, AttendanceTeam, AttendanceTeamMember, CommTeamRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class AttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Equipes ────────────────────────────────────────

  listTeams(includeInactive = false) {
    return this.prisma.attendanceTeam.findMany({
      where: {
        ...(includeInactive ? {} : { is_active: true }),
      },
      include: { members: true },
      orderBy: { name: 'asc' },
    });
  }

  findTeamById(id: string): Promise<(AttendanceTeam & { members: AttendanceTeamMember[] }) | null> {
    return this.prisma.attendanceTeam.findUnique({ where: { id }, include: { members: true } });
  }

  createTeam(data: Prisma.AttendanceTeamUncheckedCreateInput) {
    return this.prisma.attendanceTeam.create({ data, include: { members: true } });
  }

  updateTeam(id: string, data: Prisma.AttendanceTeamUpdateInput) {
    return this.prisma.attendanceTeam.update({ where: { id }, data, include: { members: true } });
  }

  // ─── Filas ──────────────────────────────────────────

  listQueues(includeInactive = false) {
    return this.prisma.attendanceQueue.findMany({
      where: {
        ...(includeInactive ? {} : { is_active: true }),
      },
      orderBy: { name: 'asc' },
    });
  }

  findQueueById(id: string): Promise<AttendanceQueue | null> {
    return this.prisma.attendanceQueue.findUnique({ where: { id } });
  }

  createQueue(data: Prisma.AttendanceQueueUncheckedCreateInput) {
    return this.prisma.attendanceQueue.create({ data });
  }

  updateQueue(id: string, data: Prisma.AttendanceQueueUpdateInput) {
    return this.prisma.attendanceQueue.update({ where: { id }, data });
  }

  countChatsInQueue(queueId: string) {
    return this.prisma.whatsappChat.count({ where: { queue_id: queueId, attendance_status: { not: 'CLOSED' } } });
  }

  // ─── Membros ────────────────────────────────────────

  listMemberships(userId: string): Promise<AttendanceTeamMember[]> {
    return this.prisma.attendanceTeamMember.findMany({ where: { user_id: userId } });
  }

  addMember(
    teamId: string,
    userId: string,
    role: CommTeamRole,
    receiveIncidentAlerts?: boolean,
  ) {
    return this.prisma.attendanceTeamMember.upsert({
      where: { team_id_user_id: { team_id: teamId, user_id: userId } },
      create: {
        team_id: teamId,
        user_id: userId,
        role,
        ...(receiveIncidentAlerts !== undefined ? { receive_incident_alerts: receiveIncidentAlerts } : {}),
      },
      update: {
        role,
        ...(receiveIncidentAlerts !== undefined ? { receive_incident_alerts: receiveIncidentAlerts } : {}),
      },
    });
  }

  removeMember(teamId: string, userId: string) {
    return this.prisma.attendanceTeamMember.deleteMany({ where: { team_id: teamId, user_id: userId } });
  }

  // ─── Lookups auxiliares ─────────────────────────────

  findUserActive(userId: string) {
    return this.prisma.user.findFirst({
      where: { id: userId, is_active: true, deleted_at: null },
      select: { id: true, name: true },
    });
  }

  /** Nomes dos usuarios (lookup batch — sem N+1 na listagem de conversas). */
  async userNames(userIds: string[]): Promise<Map<string, string>> {
    if (userIds.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  /** Usuários ativos da instalação (seletor de transferência/membros). */
  listActiveUsers() {
    return this.prisma.user.findMany({
      where: { is_active: true, deleted_at: null },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
  }
}
