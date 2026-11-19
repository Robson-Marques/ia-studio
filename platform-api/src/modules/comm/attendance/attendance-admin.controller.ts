// Config de equipes/filas/membros (tela WhatsApp → Equipes e Filas).
// Sem DELETE fisico — desativacao via PATCH is_active=false (soft-delete).
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { AttendanceAdminService } from './attendance-admin.service';
import { AddMemberDto, CreateQueueDto, CreateTeamDto, UpdateQueueDto, UpdateTeamDto } from '../dto/attendance-admin.dto';

@ApiTags('Comm — WhatsApp Equipes e Filas')
@ApiBearerAuth()
@Controller('comm/attendance')
export class AttendanceAdminController {
  constructor(private readonly admin: AttendanceAdminService) {}

  // ─── Equipes ────────────────────────────────────────

  @Get('teams')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEAMS_READ)
  listTeams(
    @Query('include_inactive') includeInactive?: string,
  ) {
    return this.admin.listTeams(includeInactive === 'true');
  }

  @Post('teams')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEAMS_MANAGE)
  createTeam(
    @Body() dto: CreateTeamDto,
  ) {
    return this.admin.createTeam(dto);
  }

  @Patch('teams/:id')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEAMS_MANAGE)
  updateTeam(
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.admin.updateTeam(id, dto);
  }

  @Post('teams/:id/members')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEAMS_MANAGE)
  addMember(
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.admin.addMember(id, dto);
  }

  @Delete('teams/:id/members/:userId')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEAMS_MANAGE)
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.admin.removeMember(id, userId);
  }

  // ─── Filas ──────────────────────────────────────────

  @Get('queues')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_QUEUES_READ)
  listQueues(
    @Query('include_inactive') includeInactive?: string,
  ) {
    return this.admin.listQueues(includeInactive === 'true');
  }

  @Post('queues')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_QUEUES_MANAGE)
  createQueue(
    @Body() dto: CreateQueueDto,
  ) {
    return this.admin.createQueue(dto);
  }

  @Patch('queues/:id')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_QUEUES_MANAGE)
  updateQueue(
    @Param('id') id: string,
    @Body() dto: UpdateQueueDto,
  ) {
    return this.admin.updateQueue(id, dto);
  }

  // ─── Usuarios (seletor de membro/transferencia) ─────

  @Get('users')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEAMS_READ, PERMISSIONS.COMM_WHATSAPP_TRANSFER)
  listUsers() {
    return this.admin.listActiveUsers();
  }
}
