// Config de equipes/filas/membros (tela WhatsApp → Equipes e Filas).
// Sem DELETE fisico — desativacao via PATCH is_active=false (soft-delete).
import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
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
    @CurrentUser() user: AuthenticatedUser,
    @Query('environment_id') environmentId?: string,
    @Query('include_inactive') includeInactive?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.admin.listTeams(resolveOrganizationId(user, orgQuery), environmentId, includeInactive === 'true');
  }

  @Post('teams')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEAMS_MANAGE)
  createTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTeamDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.admin.createTeam(resolveOrganizationId(user, orgQuery), dto);
  }

  @Patch('teams/:id')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEAMS_MANAGE)
  updateTeam(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateTeamDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.admin.updateTeam(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Post('teams/:id/members')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEAMS_MANAGE)
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddMemberDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.admin.addMember(resolveOrganizationId(user, orgQuery), id, dto);
  }

  @Delete('teams/:id/members/:userId')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEAMS_MANAGE)
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.admin.removeMember(resolveOrganizationId(user, orgQuery), id, userId);
  }

  // ─── Filas ──────────────────────────────────────────

  @Get('queues')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_QUEUES_READ)
  listQueues(
    @CurrentUser() user: AuthenticatedUser,
    @Query('environment_id') environmentId?: string,
    @Query('include_inactive') includeInactive?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.admin.listQueues(resolveOrganizationId(user, orgQuery), environmentId, includeInactive === 'true');
  }

  @Post('queues')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_QUEUES_MANAGE)
  createQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateQueueDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.admin.createQueue(resolveOrganizationId(user, orgQuery), dto);
  }

  @Patch('queues/:id')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_QUEUES_MANAGE)
  updateQueue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateQueueDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    return this.admin.updateQueue(resolveOrganizationId(user, orgQuery), id, dto);
  }

  // ─── Usuarios (seletor de membro/transferencia) ─────

  @Get('users')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_TEAMS_READ, PERMISSIONS.COMM_WHATSAPP_TRANSFER)
  listUsers(@CurrentUser() user: AuthenticatedUser, @Query('organization_id') orgQuery?: string) {
    return this.admin.listOrgUsers(resolveOrganizationId(user, orgQuery));
  }
}
