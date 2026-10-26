import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Connection, Prisma } from '@prisma/client';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { NivooConnection, NivooWhatsappClient } from '../../../shared/integration/nivoo-whatsapp.client';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { SecretsService } from '../../integration/secrets/secrets.service';
import { NIVOO_PROVIDER_KEY } from '../../integration/registry/providers/whatsapp-nivoo.provider';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class NivooConnectionsService {
  constructor(
    private readonly connections: ConnectionsRepository,
    private readonly secrets: SecretsService,
    private readonly audit: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  async isConfigured(): Promise<boolean> {
    const rows = await this.connections.findAll({ providerKey: NIVOO_PROVIDER_KEY });
    return rows.some((row) => !!row.secret_id && !!(row.config as Record<string, unknown>)['installation_id']);
  }

  async setup(): Promise<Connection> {
    const all = await this.connections.findAll({ providerKey: NIVOO_PROVIDER_KEY });
    const configured = all.find((row) => row.secret_id && (row.config as Record<string, unknown>)['installation_id']);
    if (!configured) {
      throw new BadRequestException('Configure primeiro o consumidor WhatsApp (Central Nivoo) em Integrações → Conexões.');
    }
    return configured;
  }

  async client(connection?: Connection): Promise<NivooWhatsappClient> {
    const setup = connection ?? await this.setup();
    const config = setup.config as Record<string, unknown>;
    const internalKey = await this.secrets.accessorFor(setup.secret_id).get('internal_key');
    return new NivooWhatsappClient({
      installationId: String(config['installation_id'] ?? ''),
      internalKey: internalKey || '',
      baseUrl: String(config['base_url'] ?? 'https://integracoes.nivoo.dev.br'),
    });
  }

  async createSession() {
    const setup = await this.setup();
    const origin = String((setup.config as Record<string, unknown>)['consumer_origin'] ?? '');
    const session = await (await this.client(setup)).createSession(origin);
    await this.audit.record({
      action: 'comm.whatsapp.nivoo.onboarding.start', entityType: 'Connection', entityId: setup.id,
      newValue: { session_id: session.session_id },
    });
    return session;
  }

  async getSession(id: string) {
    const client = await this.client();
    const result = await client.getSession(id);
    if (result.session.status === 'CONNECTED') await this.syncConnections();
    return result;
  }

  async syncConnections(): Promise<Array<{ local: Connection; remote: NivooConnection }>> {
    const setup = await this.setup();
    const client = await this.client(setup);
    const { connections: remote } = await client.listConnections();
    const existing = await this.connections.findAll({ providerKey: NIVOO_PROVIDER_KEY });
    const linked: Array<{ local: Connection; remote: NivooConnection }> = [];
    const owned = new Set(remote.map((item) => item.id));
    let bootstrap = existing.find((row) => !(row.config as Record<string, unknown>)['remote_connection_id']);

    for (const item of remote) {
      if (item.installation_id !== client.installationId) {
        throw new ConflictException('A Central retornou uma conexão de outra instalação; sincronização interrompida.');
      }
      let local = existing.find((row) => (row.config as Record<string, unknown>)['remote_connection_id'] === item.id);
      const legacyMatches = !local ? await this.prisma.connection.findMany({
        where: {
          provider_key: { in: ['whatsapp-meta', 'whatsapp-ycloud'] },
          config: { path: ['phone_number_id'], equals: item.phone_number_id },
        },
        orderBy: { updated_at: 'desc' },
        take: 2,
      }) : [];
      const legacy = legacyMatches.length === 1 ? legacyMatches[0] : null;
      const legacyConfig = (legacy?.config ?? {}) as Record<string, unknown>;
      const config = {
        ...((local?.config ?? bootstrap?.config ?? {}) as Record<string, unknown>),
        ...(!local && legacy ? {
          department: legacyConfig['department'] ?? null,
          is_default: legacyConfig['is_default'] ?? false,
        } : {}),
        installation_id: client.installationId,
        consumer_origin: (setup.config as Record<string, unknown>)['consumer_origin'],
        base_url: (setup.config as Record<string, unknown>)['base_url'] || 'https://integracoes.nivoo.dev.br',
        remote_connection_id: item.id,
        remote_owned: true,
        phone_number_id: item.phone_number_id,
        waba_id: item.waba_id,
        phone: item.phone_number || null,
        display_name: item.display_name,
        billing_currency: item.billing_currency,
        remote_status: item.status,
        history: item.history ?? null,
      };
      const status = item.status === 'ACTIVE' ? 'ACTIVE' : 'DISABLED';
      if (local) {
        local = await this.connections.update(local.id, {
          name: item.display_name || local.name,
          status, is_active: status === 'ACTIVE',
          connected_at: status === 'ACTIVE' ? (local.connected_at ?? new Date()) : local.connected_at,
          status_detail: status === 'ACTIVE' ? null : 'Número desconectado na Central.',
          config: config as Prisma.InputJsonValue,
          last_sync_at: new Date(),
        });
      } else if (bootstrap) {
        local = await this.connections.update(bootstrap.id, {
          name: item.display_name || bootstrap.name,
          tags: legacy?.tags ?? bootstrap.tags,
          priority: legacy?.priority ?? bootstrap.priority,
          status, is_active: status === 'ACTIVE',
          connected_at: status === 'ACTIVE' ? (bootstrap.connected_at ?? new Date()) : bootstrap.connected_at,
          status_detail: status === 'ACTIVE' ? null : 'Número desconectado na Central.',
          config: config as Prisma.InputJsonValue,
          last_sync_at: new Date(),
        });
        bootstrap = undefined;
      } else {
        local = await this.connections.create({
          provider_key: NIVOO_PROVIDER_KEY,
          name: item.display_name || item.phone_number || item.phone_number_id,
          tags: legacy?.tags ?? [],
          priority: legacy?.priority ?? 0,
          status, is_active: status === 'ACTIVE',
          connected_at: status === 'ACTIVE' ? new Date() : null,
          config: config as Prisma.InputJsonValue,
          secret_id: setup.secret_id,
          last_sync_at: new Date(),
        });
      }
      if (!local) throw new Error('Falha ao espelhar a conexão WhatsApp da Central.');
      if (legacy && legacy.id !== local.id) {
        const binding = await this.prisma.commChannelAgent.findUnique({ where: { connection_id: legacy.id } });
        if (binding) {
          await this.prisma.commChannelAgent.upsert({
            where: { connection_id: local.id },
            create: {
              connection_id: local.id, agent_id: binding.agent_id,
              is_enabled: binding.is_enabled, created_by: binding.created_by,
            },
            update: {},
          });
        }
      }
      linked.push({ local, remote: item });
    }

    for (const row of existing) {
      const config = row.config as Record<string, unknown>;
      const remoteId = String(config['remote_connection_id'] ?? '');
      const canonical = linked.find(({ remote }) => remote.id === remoteId)?.local.id;
      if (remoteId && (!owned.has(remoteId) || (canonical && canonical !== row.id))) {
        await this.connections.update(row.id, {
          status: 'DISABLED', is_active: false,
          status_detail: canonical ? 'Espelho duplicado substituído pelo vínculo ativo.' : 'O número não pertence mais a esta instalação na Central.',
          config: { ...config, remote_owned: false } as Prisma.InputJsonValue,
        });
      }
    }
    return linked;
  }

  async disconnect(localId: string): Promise<{ status: string }> {
    const setup = await this.setup();
    const local = await this.connections.findById(localId);
    if (!local || local.provider_key !== NIVOO_PROVIDER_KEY) throw new NotFoundException('Número não encontrado.');
    const remoteId = String((local.config as Record<string, unknown>)['remote_connection_id'] ?? '');
    if (!remoteId) throw new BadRequestException('Esta conexão ainda não possui número oficial.');
    const client = await this.client(setup);
    await client.disconnect(remoteId, 'Desconexão solicitada no IA Studio');
    const list = await client.listConnections();
    const final = list.connections.find((item) => item.id === remoteId);
    if (final?.status !== 'DISCONNECTED') {
      throw new ConflictException('A Central ainda não confirmou a desconexão. Nenhum dado local foi removido.');
    }
    await this.syncConnections();
    await this.audit.record({
      action: 'comm.whatsapp.nivoo.disconnect', entityType: 'Connection', entityId: localId,
      newValue: { remote_connection_id: remoteId, status: final.status },
    });
    return { status: final.status };
  }

  async assertCurrentOwner(localId: string): Promise<void> {
    const local = await this.connections.findById(localId);
    if (!local || local.provider_key !== NIVOO_PROVIDER_KEY) throw new NotFoundException('Conversa não encontrada.');
    const remoteId = String((local.config as Record<string, unknown>)['remote_connection_id'] ?? '');
    const { connections } = await (await this.client()).listConnections();
    if (!remoteId || !connections.some((item) => item.id === remoteId)) {
      throw new NotFoundException('Conversa não encontrada nesta instalação.');
    }
  }
}
