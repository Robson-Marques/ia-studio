// Sincronizacao continua (~10 min — spec Wizard Meta) de TODAS as conexoes
// whatsapp-meta ACTIVE (todas as orgs): display name, qualidade do numero,
// limite de mensagens, status do nome e templates (bidirecional). Estado em
// comm_whatsapp_sync_state + espelho nao-sensivel em Connection.config;
// mudanca relevante (qualidade) vira IntegrationLog.
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Connection, ConnectionStatus, IntegrationDirection, IntegrationLogStatus, Prisma } from '@prisma/client';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { IntegrationLogsRepository } from '../../integration/connections/integration-logs.repository';
import { WhatsappTemplatesService } from './whatsapp-templates.service';
import { WHATSAPP_PROVIDER_KEY } from './whatsapp-orchestrator.service';
import { processorsEnabled } from '../../automation/worker/processors.gate';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { MetaPhoneNumberInfo } from '../../../shared/integration/meta-graph.client';

@Injectable()
export class WhatsappSyncService {
  private readonly logger = new Logger(WhatsappSyncService.name);
  private running = false;

  constructor(
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly connections: ConnectionsService,
    private readonly templates: WhatsappTemplatesService,
    private readonly integrationLogs: IntegrationLogsRepository,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncAll(): Promise<void> {
    // Roda em UM processo só (worker em prod / API no dev com WORKER_INLINE=on).
    // Sem isto, com CommModule na API E no worker, o sync corria em DOBRO.
    if (!processorsEnabled()) return;
    if (this.running) return; // sem sobreposicao de execucoes
    this.running = true;
    try {
      const all = await this.connectionsRepository.findAllByProvider(WHATSAPP_PROVIDER_KEY);
      const active = all.filter((c) => c.status === ConnectionStatus.ACTIVE);
      if (active.length === 0) return;
      this.logger.log(`Sync WhatsApp: ${active.length} conexão(ões) ativa(s).`);
      for (const connection of active) {
        await this.syncConnection(connection).catch((e) => {
          this.logger.warn(`Sync da conexão ${connection.id} falhou: ${(e as Error).message}`);
        });
      }
    } finally {
      this.running = false;
    }
  }

  /** Sync de UMA conexao (usado tambem pelo botao "Sincronizar agora"). */
  async syncConnection(connection: Connection): Promise<Record<string, unknown>> {
    const startedAt = new Date();
    try {
      // 1) Status do numero na Meta (display name, qualidade, limite).
      const info = (await this.connections.execute(
        connection.organization_id,
        connection.id,
        'syncStatus',
        {},
      )) as MetaPhoneNumberInfo;

      // 2) Templates bidirecionais.
      const templatesResult = await this.templates
        .syncConnection(connection)
        .catch((e) => {
          this.logger.warn(`Sync de templates (${connection.id}) falhou: ${(e as Error).message}`);
          return { pulled: 0, pushed: 0 };
        });
      const templatesCount = await this.templates.countByConnection(connection.id);

      // 3) Estado anterior (pra detectar mudanca relevante de qualidade).
      const previous = await this.prisma.whatsappSyncState.findUnique({
        where: { connection_id: connection.id },
      });
      const qualityChanged = !!previous?.quality_rating && previous.quality_rating !== (info.quality_rating ?? null);

      // 4) Persiste comm_whatsapp_sync_state.
      const state = await this.prisma.whatsappSyncState.upsert({
        where: { connection_id: connection.id },
        create: {
          organization_id: connection.organization_id,
          workspace_id: connection.workspace_id,
          environment_id: connection.environment_id,
          connection_id: connection.id,
          phone_number: info.display_phone_number ?? null,
          display_name: info.verified_name ?? null,
          quality_rating: info.quality_rating ?? null,
          messaging_limit: info.messaging_limit_tier ?? null,
          name_status: info.name_status ?? null,
          templates_count: templatesCount,
          last_sync_at: startedAt,
          last_error: null,
          data: info as unknown as Prisma.InputJsonValue,
        },
        update: {
          phone_number: info.display_phone_number ?? null,
          display_name: info.verified_name ?? null,
          quality_rating: info.quality_rating ?? null,
          messaging_limit: info.messaging_limit_tier ?? null,
          name_status: info.name_status ?? null,
          templates_count: templatesCount,
          last_sync_at: startedAt,
          last_error: null,
          data: info as unknown as Prisma.InputJsonValue,
        },
      });

      // 5) Espelho nao-sensivel no Connection.config (painel da conexao).
      const config = { ...((connection.config ?? {}) as Record<string, unknown>) };
      config['display_name'] = info.verified_name ?? null;
      config['phone'] = info.display_phone_number ?? null;
      config['quality_rating'] = info.quality_rating ?? null;
      config['messaging_limit'] = info.messaging_limit_tier ?? null;
      await this.connectionsRepository.update(connection.id, {
        config: config as Prisma.InputJsonValue,
        last_sync_at: startedAt,
      });

      // 6) Mudanca relevante → IntegrationLog dedicado.
      if (qualityChanged) {
        await this.integrationLogs.record({
          organizationId: connection.organization_id,
          connectionId: connection.id,
          direction: IntegrationDirection.INBOUND,
          operation: 'sync:quality_changed',
          status: IntegrationLogStatus.SUCCESS,
          responseMeta: { from: previous?.quality_rating, to: info.quality_rating ?? null },
        });
        this.logger.warn(
          `Qualidade do número mudou (${connection.id}): ${previous?.quality_rating} → ${info.quality_rating}`,
        );
      }

      return { state, templates: templatesResult };
    } catch (e) {
      await this.prisma.whatsappSyncState
        .upsert({
          where: { connection_id: connection.id },
          create: {
            organization_id: connection.organization_id,
            workspace_id: connection.workspace_id,
            environment_id: connection.environment_id,
            connection_id: connection.id,
            last_error: (e as Error).message,
          },
          update: { last_error: (e as Error).message },
        })
        .catch(() => null);
      throw e;
    }
  }
}
