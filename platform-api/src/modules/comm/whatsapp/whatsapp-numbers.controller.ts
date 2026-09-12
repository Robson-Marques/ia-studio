// Números WhatsApp — visao das conexoes whatsapp-meta da organization com
// qualidade/limite/status/health (painel da conexao, spec Wizard Meta) +
// sync manual. A criacao de conexao continua no Connection Wizard (Fase 2).
import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Connection } from '@prisma/client';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { resolveOrganizationId } from '../../../shared/auth/tenant.util';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { WhatsappSyncService } from './whatsapp-sync.service';
import { WhatsappAssistantService } from './whatsapp-assistant.service';
import { WHATSAPP_PROVIDER_KEY } from './whatsapp-orchestrator.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SetChannelAssistantDto } from '../dto/set-channel-assistant.dto';

@ApiTags('Comm — WhatsApp Números')
@ApiBearerAuth()
@Controller('comm/whatsapp/numbers')
export class WhatsappNumbersController {
  constructor(
    private readonly connections: ConnectionsRepository,
    private readonly sync: WhatsappSyncService,
    private readonly prisma: PrismaService,
    private readonly assistant: WhatsappAssistantService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_NUMBERS_READ)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('environment_id') environmentId?: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    const organizationId = resolveOrganizationId(user, orgQuery);
    const items = await this.connections.findAllByOrg(organizationId, {
      providerKey: WHATSAPP_PROVIDER_KEY,
      environmentId,
    });
    const states = await this.prisma.whatsappSyncState.findMany({
      where: { organization_id: organizationId },
    });
    const stateByConnection = new Map(states.map((s) => [s.connection_id, s]));
    return items.map((c) => this.toView(c, stateByConnection.get(c.id)));
  }

  @Post(':id/sync')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_NUMBERS_READ, PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  async syncNow(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    const organizationId = resolveOrganizationId(user, orgQuery);
    const connection = await this.connections.findById(id);
    if (!connection || connection.organization_id !== organizationId || connection.provider_key !== WHATSAPP_PROVIDER_KEY) {
      throw new NotFoundException('Conexão WhatsApp não encontrada.');
    }
    return this.sync.syncConnection(connection);
  }

  // ─── Vínculo assistente↔número ──────────────────────
  // Qual assistente de IA atende sozinho este número. Leitura usa a mesma perm
  // de ver números; vincular/desvincular exige a perm de gerência do vínculo.

  @Get(':id/assistant')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_NUMBERS_READ)
  async getAssistant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    const organizationId = resolveOrganizationId(user, orgQuery);
    return this.assistant.get(organizationId, id);
  }

  @Put(':id/assistant')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_ASSISTANT_MANAGE)
  async setAssistant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetChannelAssistantDto,
    @Query('organization_id') orgQuery?: string,
  ) {
    const organizationId = resolveOrganizationId(user, orgQuery);
    return this.assistant.set(organizationId, id, dto.agent_id, dto.is_enabled ?? true, user.sub ?? null);
  }

  @Delete(':id/assistant')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_ASSISTANT_MANAGE)
  async removeAssistant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Query('organization_id') orgQuery?: string,
  ) {
    const organizationId = resolveOrganizationId(user, orgQuery);
    return this.assistant.remove(organizationId, id);
  }

  private toView(connection: Connection, state?: { [k: string]: unknown } | null) {
    const config = (connection.config ?? {}) as Record<string, unknown>;
    return {
      id: connection.id,
      name: connection.name,
      status: connection.status,
      status_detail: connection.status_detail,
      tags: connection.tags,
      priority: connection.priority,
      workspace_id: connection.workspace_id,
      environment_id: connection.environment_id,
      phone_number_id: config['phone_number_id'] ?? null,
      waba_id: config['waba_id'] ?? null,
      department: config['department'] ?? null,
      is_default: config['is_default'] === 'sim' || config['is_default'] === true,
      phone: (state?.['phone_number'] as string | undefined) ?? (config['phone'] as string | undefined) ?? null,
      display_name: (state?.['display_name'] as string | undefined) ?? (config['display_name'] as string | undefined) ?? null,
      quality_rating: (state?.['quality_rating'] as string | undefined) ?? null,
      messaging_limit: (state?.['messaging_limit'] as string | undefined) ?? null,
      templates_count: (state?.['templates_count'] as number | undefined) ?? 0,
      last_sync_at: (state?.['last_sync_at'] as Date | undefined) ?? connection.last_sync_at,
      last_sync_error: (state?.['last_error'] as string | undefined) ?? null,
      last_health_at: connection.last_health_at,
      last_health_ok: connection.last_health_ok,
      connected_at: connection.connected_at,
      last_used_at: connection.last_used_at,
    };
  }
}
