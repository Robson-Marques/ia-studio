import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Connection, Prisma } from '@prisma/client';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { NivooConnection, NivooWhatsappClient } from '../../../shared/integration/nivoo-whatsapp.client';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { SecretsService } from '../../integration/secrets/secrets.service';
import { NIVOO_PROVIDER_KEY } from '../../integration/registry/providers/whatsapp-nivoo.provider';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { WhatsappTemplatesRepository } from './whatsapp-templates.repository';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { ConfigureNivooConsumerDto } from '../dto/configure-nivoo-consumer.dto';

@Injectable()
export class NivooConnectionsService {
  constructor(
    private readonly connections: ConnectionsRepository,
    private readonly secrets: SecretsService,
    private readonly audit: AuditLogService,
    private readonly prisma: PrismaService,
    private readonly templates: WhatsappTemplatesRepository,
    private readonly integrationConnections: ConnectionsService,
  ) {}

  async isConfigured(): Promise<boolean> {
    return (await this.configuration()).configured;
  }

  async configuration() {
    const row = await this.findConsumerSetup();
    const config = (row?.config ?? {}) as Record<string, unknown>;
    return {
      configured: !!row?.secret_id && !!config['installation_id'] && !!config['consumer_origin'],
      connection_id: row?.id ?? null,
      installation_id: config['installation_id'] ?? null,
      consumer_origin: config['consumer_origin'] ?? null,
      status: row?.status ?? null,
      status_detail: row?.status_detail ?? null,
      last_health_at: row?.last_health_at ?? null,
      last_health_ok: row?.last_health_ok ?? null,
    };
  }

  async configureConsumer(dto: ConfigureNivooConsumerDto, createdBy: string | null) {
    const installationId = dto.installation_id.trim();
    const consumerOrigin = this.normalizeConsumerOrigin(dto.consumer_origin);
    const internalKey = dto.internal_key?.trim() ?? '';
    const current = await this.findConsumerSetup();

    if (!installationId) {
      throw new BadRequestException('Informe o identificador da instalação na Central Nivoo.');
    }
    if (!current?.secret_id && !internalKey) {
      throw new BadRequestException('Informe a chave interna do consumidor da Central Nivoo.');
    }

    const config = {
      installation_id: installationId,
      consumer_origin: consumerOrigin,
      base_url: 'https://integracoes.nivoo.dev.br',
      consumer_setup: true,
    };
    const secrets = internalKey ? { internal_key: internalKey } : undefined;

    let saved: Connection;
    if (current) {
      const currentConfig = (current.config ?? {}) as Record<string, unknown>;
      saved = await this.integrationConnections.update(current.id, {
        // Em instalações antigas o primeiro número também era a configuração.
        // Preserve seu nome operacional até a sincronização separá-lo.
        name: currentConfig['remote_connection_id']
          ? current.name
          : 'Central Nivoo — consumidor WhatsApp',
        config,
        ...(secrets ? { secrets } : {}),
      });
      saved = (await this.integrationConnections.test(saved.id)).connection;
    } else {
      saved = await this.integrationConnections.create({
        provider_key: NIVOO_PROVIDER_KEY,
        name: 'Central Nivoo — consumidor WhatsApp',
        config,
        secrets,
      }, createdBy, { allowWhatsappConsumer: true });
    }

    // Todos os espelhos usam a mesma identificacao e o mesmo segredo do
    // consumidor. Assim uma rotacao aqui nao deixa numeros antigos apontando
    // para credenciais obsoletas.
    const canonical = await this.connections.findById(saved.id);
    if (!canonical) throw new NotFoundException('Configuração da Central não encontrada após salvar.');
    const rows = await this.connections.findAll({ providerKey: NIVOO_PROVIDER_KEY });
    for (const row of rows) {
      if (row.id === canonical.id) continue;
      const rowConfig = (row.config ?? {}) as Record<string, unknown>;
      await this.connections.update(row.id, {
        secret_id: canonical.secret_id,
        config: {
          ...rowConfig,
          installation_id: installationId,
          consumer_origin: consumerOrigin,
          base_url: 'https://integracoes.nivoo.dev.br',
        } as Prisma.InputJsonValue,
      });
    }

    await this.audit.record({
      action: 'comm.whatsapp.nivoo.consumer.configure',
      entityType: 'Connection', entityId: canonical.id,
      newValue: { installation_id: installationId, consumer_origin: consumerOrigin },
    });
    return this.configuration();
  }

  async setup(): Promise<Connection> {
    const configured = await this.findConsumerSetup();
    const config = (configured?.config ?? {}) as Record<string, unknown>;
    if (!configured?.secret_id || !config['installation_id'] || !config['consumer_origin']) {
      throw new BadRequestException('Configure primeiro a Central Nivoo em WhatsApp → Números.');
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
    // Configuracoes novas permanecem tecnicas e nunca viram um numero. O
    // fallback sem `consumer_setup` preserva instalações criadas antes desta
    // separacao, nas quais a primeira linha era reaproveitada como espelho.
    let bootstrap = existing.find((row) => {
      const config = row.config as Record<string, unknown>;
      return !config['remote_connection_id'] && config['consumer_setup'] !== true;
    });

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
      const sourceConfig = ((local?.config ?? bootstrap?.config ?? {}) as Record<string, unknown>);
      const config = {
        ...sourceConfig,
        ...(!local && legacy ? {
          department: legacyConfig['department'] ?? null,
          is_default: legacyConfig['is_default'] ?? false,
        } : {}),
        installation_id: client.installationId,
        consumer_origin: (setup.config as Record<string, unknown>)['consumer_origin'],
        base_url: (setup.config as Record<string, unknown>)['base_url'] || 'https://integracoes.nivoo.dev.br',
        // Um bootstrap legado continua sendo também a configuração; os
        // espelhos novos são exclusivamente números operacionais.
        consumer_setup: local
          ? local.id === setup.id || sourceConfig['consumer_setup'] === true
          : bootstrap
            ? sourceConfig['consumer_setup'] !== false
            : false,
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
      await this.templates.seedCatalog(local.id);
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

  private async findConsumerSetup(): Promise<Connection | null> {
    const rows = await this.connections.findAll({ providerKey: NIVOO_PROVIDER_KEY });
    const isConfigured = (row: Connection) => {
      const config = row.config as Record<string, unknown>;
      return !!row.secret_id && !!config['installation_id'] && !!config['consumer_origin'];
    };
    return rows.find((row) => (row.config as Record<string, unknown>)['consumer_setup'] === true && isConfigured(row))
      ?? rows.find((row) => !(row.config as Record<string, unknown>)['remote_connection_id'] && isConfigured(row))
      ?? rows.find(isConfigured)
      ?? rows[0]
      ?? null;
  }

  private normalizeConsumerOrigin(value: string): string {
    let parsed: URL;
    try { parsed = new URL(value.trim()); }
    catch { throw new BadRequestException('Informe uma origem HTTPS válida para o painel.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password ||
        (parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash) {
      throw new BadRequestException('A origem do painel deve usar HTTPS e não pode ter caminho, parâmetros ou fragmento.');
    }
    return parsed.origin;
  }
}
