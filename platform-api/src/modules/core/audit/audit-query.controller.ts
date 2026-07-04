// Leitura da trilha de auditoria:
//   GET /audit          — escopo da propria org (perm core.audit.read)
//   GET /console/audit  — visao global do SaaS (@PlatformAdminOnly)
import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { PlatformAdminOnly } from '../../../shared/auth/platform-admin.guard';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { AuditQueryRepository } from './audit-query.repository';

@ApiTags('Audit')
@ApiBearerAuth()
@Controller()
export class AuditQueryController {
  constructor(private readonly repository: AuditQueryRepository) {}

  @Get('audit')
  @RequirePermissions(PERMISSIONS.CORE_AUDIT_READ)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('entity_type') entityType?: string,
    @Query('entity_id') entityId?: string,
    @Query('action') action?: string,
    @Query('actor_id') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    // Sempre escopado na org do ator (ou na org escolhida, se Console)
    const organizationId = resolveOrganizationId(user, orgQuery);
    return this.repository.findAll({
      organizationId,
      entityType,
      entityId,
      action,
      actorId,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @PlatformAdminOnly()
  @Get('console/audit')
  findAllConsole(
    @Query('organization_id') organizationId?: string,
    @Query('entity_type') entityType?: string,
    @Query('entity_id') entityId?: string,
    @Query('action') action?: string,
    @Query('actor_id') actorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.repository.findAll({
      organizationId,
      entityType,
      entityId,
      action,
      actorId,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}
