// Números WhatsApp da Central Nivoo, com onboarding e desconexão oficiais.
import { Body, Controller, Delete, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Connection } from '@prisma/client';
import { RequirePermissions } from '../../../shared/auth/permissions.decorator';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { NivooSyncService } from './nivoo-sync.service';
import { WhatsappAssistantService } from './whatsapp-assistant.service';
import { WHATSAPP_PROVIDER_KEY } from './whatsapp-orchestrator.service';
import { SetChannelAssistantDto } from '../dto/set-channel-assistant.dto';
import { NivooConnectionsService } from './nivoo-connections.service';
import { WhatsappTemplatesRepository } from './whatsapp-templates.repository';
import { ConfigureNivooConsumerDto } from '../dto/configure-nivoo-consumer.dto';

@ApiTags('Comm — WhatsApp Números')
@ApiBearerAuth()
@Controller('comm/whatsapp/numbers')
export class WhatsappNumbersController {
  constructor(
    private readonly connections: ConnectionsRepository,
    private readonly sync: NivooSyncService,
    private readonly assistant: WhatsappAssistantService,
    private readonly nivoo: NivooConnectionsService,
    private readonly templates: WhatsappTemplatesRepository,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_NUMBERS_READ)
  async list() {
    const current = await this.connections.findAll({ providerKey: WHATSAPP_PROVIDER_KEY });
    const owned = current.filter((c) => (c.config as Record<string, unknown>)['remote_owned'] === true);
    return Promise.all(owned.map(async (connection) => ({
      ...this.toView(connection),
      templates_count: await this.templates.countByConnection(connection.id),
    })));
  }

  @Post('onboarding/sessions')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  createSession() {
    return this.nivoo.createSession();
  }

  @Get('setup')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_NUMBERS_READ)
  async setup() {
    return this.nivoo.configuration();
  }

  @Put('setup')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  configureSetup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ConfigureNivooConsumerDto,
  ) {
    return this.nivoo.configureConsumer(dto, user.sub ?? null);
  }

  @Get('onboarding/sessions/:sessionId')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  getSession(@Param('sessionId') sessionId: string) {
    return this.nivoo.getSession(sessionId);
  }

  @Post(':id/disconnect')
  @RequirePermissions(PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  disconnect(@Param('id') id: string) {
    return this.nivoo.disconnect(id);
  }

  @Post(':id/sync')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_NUMBERS_READ, PERMISSIONS.INTEGRATIONS_CONNECTIONS_WRITE)
  async syncNow(
    @Param('id') id: string,
  ) {
    const connection = await this.connections.findById(id);
    if (!connection || connection.provider_key !== WHATSAPP_PROVIDER_KEY) {
      throw new NotFoundException('Conexão WhatsApp não encontrada.');
    }
    return this.sync.sync();
  }

  // ─── Vínculo assistente↔número ──────────────────────
  // Qual assistente de IA atende sozinho este número. Leitura usa a mesma perm
  // de ver números; vincular/desvincular exige a perm de gerência do vínculo.

  @Get(':id/assistant')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_NUMBERS_READ)
  async getAssistant(
    @Param('id') id: string,
  ) {
    return this.assistant.get(id);
  }

  @Put(':id/assistant')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_ASSISTANT_MANAGE)
  async setAssistant(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SetChannelAssistantDto,
  ) {
    return this.assistant.set(id, dto.agent_id, dto.is_enabled ?? true, user.sub ?? null);
  }

  @Delete(':id/assistant')
  @RequirePermissions(PERMISSIONS.COMM_WHATSAPP_ASSISTANT_MANAGE)
  async removeAssistant(
    @Param('id') id: string,
  ) {
    return this.assistant.remove(id);
  }

  private toView(connection: Connection) {
    const config = (connection.config ?? {}) as Record<string, unknown>;
    return {
      id: connection.id,
      name: connection.name,
      status: connection.status,
      status_detail: connection.status_detail,
      tags: connection.tags,
      priority: connection.priority,
      phone_number_id: config['phone_number_id'] ?? null,
      waba_id: config['waba_id'] ?? null,
      department: config['department'] ?? null,
      is_default: config['is_default'] === 'sim' || config['is_default'] === true,
      phone: (config['phone'] as string | undefined) ?? null,
      display_name: (config['display_name'] as string | undefined) ?? null,
      remote_status: config['remote_status'] ?? null,
      billing_currency: config['billing_currency'] ?? null,
      history: config['history'] ?? null,
      last_sync_at: connection.last_sync_at,
      last_health_at: connection.last_health_at,
      last_health_ok: connection.last_health_ok,
      connected_at: connection.connected_at,
      last_used_at: connection.last_used_at,
    };
  }
}
