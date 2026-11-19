// Instances (conexoes) — diretriz 52: Provider = tipo; Instance = conexao
// nomeada. Criacao via Connection Wizard (secrets → Secrets Manager; config
// so nao-sensivel), estados via state machine, execute com IntegrationLog.
// Conexao NUNCA e excluida — sem delete em toda a cadeia.
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Connection,
  ConnectionStatus,
  IntegrationDirection,
  IntegrationLogStatus,
  Prisma,
  ProviderDefinition,
  SecretKind,
} from '@prisma/client';
import { ConnectionsRepository } from './connections.repository';
import { IntegrationLogsRepository } from './integration-logs.repository';
import { assertConnectionTransition } from './connection-state.machine';
import { SecretsService } from '../secrets/secrets.service';
import { ProviderCatalogService } from '../catalog/provider-catalog.service';
import { ProviderRegistryService } from '../registry/provider-registry.service';
import { CodexCliService } from '../registry/providers/codex-cli.service';
import { AuditLogService, redactSensitive } from '../../../shared/audit/audit-log.service';
import { getRequestStore } from '../../../shared/audit/request-context';
import {
  HealthResult,
  ProviderContext,
  WizardSchema,
} from '../../../shared/integration/provider.interface';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import { ConnectchatApiError } from '../../../shared/integration/connectchat.client';
import { WahaApiError } from '../../../shared/integration/waha.client';
import { ConnectionStateAction } from './dto/update-connection-state.dto';

const STATE_ACTION_TARGET: Record<ConnectionStateAction, ConnectionStatus> = {
  enable: 'ACTIVE',
  disable: 'DISABLED',
  maintenance: 'MAINTENANCE',
};

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    private readonly repository: ConnectionsRepository,
    private readonly integrationLogs: IntegrationLogsRepository,
    private readonly secrets: SecretsService,
    private readonly providerCatalog: ProviderCatalogService,
    private readonly registry: ProviderRegistryService,
    private readonly codexCli: CodexCliService,
    private readonly audit: AuditLogService,
  ) {}

  // ─── Leitura ────────────────────────────────────────
  async findAll() {
    const connections = await this.repository.findAll();
    // Providers retirados da instalação podem ter registros históricos no banco.
    // Eles continuam preservados (sem apagar segredo/log), mas não reaparecem na
    // superfície operacional nem podem ser selecionados por fluxos atuais.
    return connections.filter((connection) =>
      !connection.tags.includes('__archived_codex__') && this.registry.has(connection.provider_key) && connection.provider_key !== 'whatsapp-nivoo');
  }

  listAvailableProviders() {
    // Os dois métodos de WhatsApp têm jornadas próprias em WhatsApp → Números.
    // A WAHA também exige aceite explícito do risco antes de criar a sessão.
    return this.providerCatalog.listAvailable().then((providers) =>
      providers.filter((provider) => !['whatsapp-nivoo', 'whatsapp-waha'].includes(provider.key)));
  }

  async findById(id: string): Promise<Connection> {
    const connection = await this.repository.findById(id);
    if (!connection || connection.tags.includes('__archived_codex__') || !this.registry.has(connection.provider_key)) throw new NotFoundException('Conexão não encontrada.');
    return connection;
  }

  /** Oculta apenas conexões Codex; mantém logs, vínculo e ID no banco. */
  async archiveCodex(id: string) {
    const connection = await this.findById(id);
    if (connection.provider_key !== 'codex-cli') {
      throw new BadRequestException('Arquivamento pela interface permitido apenas para conexões Codex CLI.');
    }
    await this.codexCli.forget(id);
    const result = await this.repository.archive(id);
    await this.audit.record({
      action: 'integration.connection.archive',
      entityType: 'Connection',
      entityId: id,
      oldValue: { status: connection.status, is_active: connection.is_active },
      newValue: { status: result.status, is_active: result.is_active },
    });
    return { archived: true, id };
  }

  async findLogs(id: string, take = 50) {
    await this.findById(id);
    return this.integrationLogs.findByConnection(id, take);
  }

  // ─── Criacao via wizard ─────────────────────────────
  async create(
    dto: CreateConnectionDto,
    createdBy: string | null,
    options: { allowWhatsappConsumer?: boolean; allowWhatsappWaha?: boolean } = {},
  ) {
    const definition = await this.providerCatalog.definitionForConnection(dto.provider_key);
    if (dto.provider_key === 'whatsapp-nivoo' && !options.allowWhatsappConsumer) {
      throw new BadRequestException('Configure a Central Nivoo em WhatsApp → Números.');
    }
    if (dto.provider_key === 'whatsapp-nivoo' &&
        (await this.repository.countByProvider('whatsapp-nivoo')) > 0) {
      throw new ConflictException('O consumidor da Central WhatsApp já está configurado. Conecte outros números em WhatsApp → Números.');
    }
    if (dto.provider_key === 'whatsapp-waha' && !options.allowWhatsappWaha) {
      throw new BadRequestException('Conecte a WAHA em WhatsApp → Números e confirme o aviso de risco.');
    }

    // Higiene: campo marcado como secret no wizard NUNCA entra no config.
    const config = this.stripSecretFields(dto.config ?? {}, definition);
    const secretValues = dto.secrets ?? {};

    // Secret(s) da conexao (diretriz 5) — referencia por id, nunca inline.
    let secretId: string | null = null;
    if (Object.keys(secretValues).length > 0) {
      const secret = await this.secrets.create({
        name: `${dto.name} — credenciais (${dto.provider_key})`,
        kind: this.resolveSecretKind(dto.provider_key),
        values: secretValues,
        createdBy,
      });
      secretId = secret.id;
    }

    let connection = await this.repository.create({
      provider_key: dto.provider_key,
      name: dto.name,
      status: 'PENDING_AUTH',
      tags: dto.tags ?? [],
      priority: dto.priority ?? 0,
      config: config as Prisma.InputJsonValue,
      secret_id: secretId,
      created_by: createdBy,
    });

    // PENDING_AUTH → testa → ACTIVE/ERROR (quando ha implementacao; a Meta,
    // por exemplo, so ganha IProvider na Fase 3 e fica aguardando).
    // Providers com wizard testable:false (ex.: google-workspace/OAuth) NAO
    // rodam health no create — a ativacao vem do callback OAuth.
    const isTestable = this.registry.has(dto.provider_key)
      ? this.registry.get(dto.provider_key).metadata().wizardSchema.testable
      : false;
    if (this.registry.has(dto.provider_key) && isTestable) {
      connection = await this.runConnectAndHealth(connection);
    } else if (this.registry.has(dto.provider_key)) {
      connection = await this.repository.update(connection.id, {
        status_detail: dto.provider_key === 'codex-cli'
          ? 'Aguardando autorização — clique em “Entrar com ChatGPT” na conexão e conclua o código no site oficial da OpenAI.'
          : 'Aguardando autenticação — conclua o fluxo de autorização (ex.: “Entrar com Google”).',
      });
    } else {
      connection = await this.repository.update(connection.id, {
        status_detail: 'Conector sem implementação nesta fase — conexão aguardando autenticação.',
      });
    }

    await this.audit.record({
      action: 'integration.connection.create',
      entityType: 'Connection',
      entityId: connection.id,
      newValue: {
        name: connection.name,
        provider_key: connection.provider_key,
        status: connection.status,
      },
    });
    return connection;
  }

  // ─── Atualizacao (nome/tags/prioridade + credenciais) ─
  // provider_key nunca muda aqui. config faz merge
  // shallow no atual; secrets grava so as chaves nao-vazias (mantem o resto).
  async update(id: string, dto: UpdateConnectionDto) {
    const before = await this.findById(id);
    const data: Prisma.ConnectionUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.priority !== undefined) data.priority = dto.priority;

    // Config: merge shallow (novos valores sobrescrevem, mantem os nao
    // enviados). Higiene: remove qualquer campo secreto que tenha vazado.
    if (dto.config !== undefined) {
      const definition = await this.providerCatalog.definitionForConnection(before.provider_key);
      const incoming = this.stripSecretFields(dto.config, definition);
      const currentConfig = (before.config ?? {}) as Record<string, unknown>;
      data.config = { ...currentConfig, ...incoming } as Prisma.InputJsonValue;
    }

    const connection = await this.repository.update(id, data);

    // Secrets: so as chaves com valor nao-vazio. Chave ausente/vazia MANTEM
    // o segredo atual (nunca apaga). Cria o Secret se a conexao ainda nao tem.
    if (dto.secrets) {
      const provided: Record<string, string> = {};
      for (const [k, v] of Object.entries(dto.secrets)) {
        if (typeof v === 'string' && v.trim() !== '') provided[k] = v;
      }
      if (Object.keys(provided).length > 0) {
        if (before.secret_id) {
          await this.secrets.mergeValues(before.secret_id, provided);
        } else {
          const created = await this.secrets.create({
            name: `${before.name} — credenciais (${before.provider_key})`,
            kind: this.resolveSecretKind(before.provider_key),
            values: provided,
            createdBy: before.created_by,
          });
          await this.repository.update(id, { secret_id: created.id });
        }
      }
    }

    await this.audit.record({
      action: 'integration.connection.update',
      entityType: 'Connection',
      entityId: id,
      oldValue: { name: before.name, tags: before.tags, priority: before.priority },
      newValue: {
        name: connection.name,
        tags: connection.tags,
        priority: connection.priority,
        config_changed: dto.config !== undefined,
        secrets_changed: dto.secrets ? Object.keys(dto.secrets) : undefined,
      },
    });
    return connection;
  }

  // ─── Estado (enable/disable/maintenance) ────────────
  async changeState(id: string, action: ConnectionStateAction) {
    const connection = await this.findById(id);
    if (connection.provider_key === 'whatsapp-nivoo') {
      throw new ConflictException('Gerencie este número em WhatsApp → Números. A desconexão precisa ser confirmada pela Central.');
    }
    // Não permitir "Ativar" a conta Codex só mudando o rótulo no banco:
    // antes o botão criava conexão aparentemente ACTIVE sem login real.
    if (connection.provider_key === 'codex-cli' && action === 'enable') {
      const health = await this.safeHealth(connection);
      if (!health.ok) {
        throw new ConflictException(health.detail || 'Faça login com ChatGPT e valide a conexão antes de ativar.');
      }
    }
    const target = STATE_ACTION_TARGET[action];
    assertConnectionTransition(connection.status, target);

    const data: Prisma.ConnectionUpdateInput = {
      status: target,
      status_detail: null,
      is_active: target === 'ACTIVE',
    };
    const updated = await this.repository.update(id, data);
    await this.audit.record({
      action: `integration.connection.${action}`,
      entityType: 'Connection',
      entityId: id,
      oldValue: { status: connection.status },
      newValue: { status: updated.status },
    });
    return updated;
  }

  // ─── Teste de saude ─────────────────────────────────
  async test(id: string) {
    const connection = await this.findById(id);
    if (!this.registry.has(connection.provider_key)) {
      throw new BadRequestException('Conector sem implementação nesta fase — teste indisponível.');
    }
    const startedAt = Date.now();
    const result = await this.safeHealth(connection);
    const durationMs = Date.now() - startedAt;

    const updated = await this.applyHealthResult(connection, result);
    await this.integrationLogs.record({
      connectionId: id,
      direction: IntegrationDirection.OUTBOUND,
      operation: 'health',
      status: result.ok || result.pendingAuth ? IntegrationLogStatus.SUCCESS : IntegrationLogStatus.FAILURE,
      durationMs,
      responseMeta: { detail: result.detail, checks: result.checks },
      error: result.ok || result.pendingAuth ? undefined : result.detail,
      traceId: getRequestStore()?.traceId ?? null,
    });
    return { connection: updated, health: result };
  }

  // ─── Execucao de operacao ───────────────────────────
  async execute(id: string, operation: string, params: unknown) {
    const connection = await this.repository.findById(id);
    if (!connection) throw new NotFoundException('Conexão não encontrada.');
    if (connection.status !== 'ACTIVE') {
      throw new ConflictException('Conexão não está ativa — teste/reative antes de executar operações.');
    }
    const provider = this.registry.get(connection.provider_key);
    const ctx = this.buildContext(connection);
    const startedAt = Date.now();
    // Conversas são conteúdo de atendimento. Mantemos operação e metadados
    // rastreáveis, mas nunca o texto da mensagem ou a prova de vínculo no log.
    const sensitiveParamKeys = connection.provider_key === 'connectchat'
      ? ['body', 'proof', 'customerRef', 'globalIdentityId']
      : connection.provider_key === 'whatsapp-nivoo'
        ? ['to', 'body', 'variables', 'caption', 'url', 'media_id', 'remote_chat_id', 'filename']
        : connection.provider_key === 'whatsapp-waha'
          ? ['to', 'body', 'data', 'variables', 'caption', 'url', 'media_id', 'filename']
          : connection.provider_key === 'ixc' ? ['cpf', 'customerId'] : [];
    try {
      const result = await provider.execute(ctx, operation, params);
      const durationMs = Date.now() - startedAt;
      try {
        await this.repository.update(id, { last_used_at: new Date() });
        await this.integrationLogs.record({
          connectionId: id,
          direction: IntegrationDirection.OUTBOUND,
          operation,
          status: IntegrationLogStatus.SUCCESS,
          durationMs,
          requestMeta: redactSensitive({ operation, params: this.withoutBinary(params) }, sensitiveParamKeys),
          responseMeta: { summary: this.summarize(result) },
          traceId: getRequestStore()?.traceId ?? null,
        });
      } catch (logError) {
        const acceptedNivooJob = connection.provider_key === 'whatsapp-nivoo' &&
          ['sendText', 'sendMedia', 'sendTemplate'].includes(operation) &&
          !!(result as { job_id?: string } | null)?.job_id;
        if (!acceptedNivooJob) throw logError;
        this.logger.error(`A Central aceitou o envio, mas o registro de uso/log local falhou: ${(logError as Error).message}`);
      }
      return result;
    } catch (e) {
      const durationMs = Date.now() - startedAt;
      // Token OAuth expirado/revogado: reflete no estado da conexao (diretriz 52
      // — nunca deleta; muda de estado). O provider sinaliza via TokenExpiredError.
      if ((e as Error)?.name === 'TokenExpiredError' && connection.status === 'ACTIVE') {
        await this.repository
          .update(id, {
            status: 'TOKEN_EXPIRED',
            is_active: false,
            status_detail: (e as Error).message,
          })
          .catch(() => undefined);
      }
      await this.integrationLogs.record({
        connectionId: id,
        direction: IntegrationDirection.OUTBOUND,
        operation,
        status: IntegrationLogStatus.FAILURE,
        durationMs,
        requestMeta: redactSensitive({ operation, params: this.withoutBinary(params) }, sensitiveParamKeys),
        error: (e as Error).message,
        traceId: getRequestStore()?.traceId ?? null,
      });
      // O ConnectChat já devolve erros públicos e seguros (por exemplo,
      // credencial sem escopo). Preservar essa informação evita que a Central
      // transforme uma falha configurável em um opaco "Internal server error".
      if (e instanceof ConnectchatApiError) {
        const status = e.status >= HttpStatus.BAD_REQUEST && e.status < HttpStatus.INTERNAL_SERVER_ERROR
          ? e.status
          : HttpStatus.BAD_GATEWAY;
        throw new HttpException({
          statusCode: status,
          message: e.message,
          code: e.code ?? 'CONNECTCHAT_REQUEST_FAILED',
        }, status);
      }
      if (e instanceof WahaApiError) {
        throw new HttpException({
          statusCode: HttpStatus.BAD_GATEWAY,
          message: e.message,
          code: 'WAHA_REQUEST_FAILED',
        }, HttpStatus.BAD_GATEWAY);
      }
      throw e;
    }
  }

  // ─── Descoberta de recursos (Schema Discovery) ──────
  /**
   * `IProvider.discover()`: lista os recursos que a conexao expoe — assuntos/
   * setores/planos no IXC, numeros e templates na Meta, tabelas no Postgres.
   * READ-ONLY: a plataforma NAO e dona de dados de negocio (principio reitor).
   * Nao persiste os recursos; devolve pro chamador e grava so `last_sync_at`
   * mais o IntegrationLog. Serve pra UI preencher ids que o usuario nao deve
   * digitar a mao (ex.: `id_assunto` da OS no IXC).
   */
  async discover(id: string) {
    const connection = await this.findById(id);
    if (!this.registry.has(connection.provider_key)) {
      throw new BadRequestException('Conector sem implementação — descoberta de recursos indisponível.');
    }
    if (connection.status !== 'ACTIVE') {
      throw new ConflictException('Conexão não está ativa — teste/reative antes de descobrir recursos.');
    }
    const provider = this.registry.get(connection.provider_key);
    const ctx = this.buildContext(connection);
    const startedAt = Date.now();
    try {
      const result = await provider.discover(ctx);
      const durationMs = Date.now() - startedAt;
      await this.repository.update(id, { last_sync_at: new Date() });
      await this.integrationLogs.record({
        connectionId: id,
        direction: IntegrationDirection.OUTBOUND,
        operation: 'discover',
        status: IntegrationLogStatus.SUCCESS,
        durationMs,
        responseMeta: { resources: result.resources.length },
        traceId: getRequestStore()?.traceId ?? null,
      });
      return result;
    } catch (e) {
      const durationMs = Date.now() - startedAt;
      await this.integrationLogs.record({
        connectionId: id,
        direction: IntegrationDirection.OUTBOUND,
        operation: 'discover',
        status: IntegrationLogStatus.FAILURE,
        durationMs,
        error: (e as Error).message,
        traceId: getRequestStore()?.traceId ?? null,
      });
      throw e;
    }
  }

  /**
   * Upload de mídia binária pelo provider WhatsApp (retorna media_id/referência). Caminho separado do
   * execute() porque o binario NAO pode ir pro log de integracao (redactSensitive
   * serializaria o Buffer inteiro) — aqui logamos so metadados (mime/filename/tamanho).
   * Os providers whatsapp-nivoo e whatsapp-waha expõem `uploadMedia`.
   */
  async uploadMedia(
    id: string,
    file: { data: Buffer; mimeType: string; filename: string; kind: 'image' | 'audio' | 'video' | 'document' },
  ): Promise<{ media_id: string }> {
    const connection = await this.findById(id);
    if (connection.status !== 'ACTIVE') {
      throw new ConflictException('Conexão não está ativa — teste/reative antes de enviar mídia.');
    }
    const provider = this.registry.get(connection.provider_key);
    const ctx = this.buildContext(connection);
    const startedAt = Date.now();
    try {
      const result = (await provider.execute(ctx, 'uploadMedia', file)) as { media_id?: string };
      await this.repository.update(id, { last_used_at: new Date() });
      await this.integrationLogs.record({
        connectionId: id,
        direction: IntegrationDirection.OUTBOUND,
        operation: 'uploadMedia',
        status: IntegrationLogStatus.SUCCESS,
        durationMs: Date.now() - startedAt,
        // So metadados — nunca o binario.
        requestMeta: { kind: file.kind, mime_type: file.mimeType, filename: file.filename, size: file.data.length },
        responseMeta: {
          media_id: connection.provider_key === 'whatsapp-waha'
            ? (result?.media_id ? '[base64 protegido]' : null)
            : result?.media_id ?? null,
        },
        traceId: getRequestStore()?.traceId ?? null,
      });
      if (!result?.media_id) throw new BadRequestException('Falha ao subir a mídia (sem media_id).');
      return { media_id: result.media_id };
    } catch (e) {
      await this.integrationLogs.record({
        connectionId: id,
        direction: IntegrationDirection.OUTBOUND,
        operation: 'uploadMedia',
        status: IntegrationLogStatus.FAILURE,
        durationMs: Date.now() - startedAt,
        requestMeta: { kind: file.kind, mime_type: file.mimeType, filename: file.filename, size: file.data.length },
        error: (e as Error).message,
        traceId: getRequestStore()?.traceId ?? null,
      });
      throw e;
    }
  }

  // ─── OAuth (Google Workspace — Fase 7) ──────────────

  /**
   * Persiste os tokens OAuth no Secret da conexao e ativa (PENDING_AUTH/
   * TOKEN_EXPIRED → ACTIVE). Cria o Secret se a conexao ainda nao tiver um.
   * Chamado pelo callback OAuth (fluxo de sistema — sem token de usuario).
   */
  async completeOAuth(
    connectionId: string,
    tokens: { access_token: string; refresh_token: string },
    meta: { expires_at: number; account?: string; scope?: string },
  ): Promise<Connection> {
    const connection = await this.repository.findById(connectionId);
    if (!connection) throw new NotFoundException('Conexão não encontrada.');

    let secretId = connection.secret_id;
    if (secretId) {
      await this.secrets.updateOauth(secretId, tokens, meta);
    } else {
      const created = await this.secrets.create({
        name: `${connection.name} — OAuth (${connection.provider_key})`,
        kind: SecretKind.OAUTH,
        values: tokens,
        createdBy: connection.created_by,
      });
      secretId = created.id;
      await this.secrets.updateOauth(secretId, tokens, meta);
    }

    const updated = await this.repository.update(connectionId, {
      secret_id: secretId,
      status: 'ACTIVE',
      is_active: true,
      status_detail: meta.account ? `Conta autenticada: ${meta.account}` : 'Conta Google autenticada.',
      connected_at: connection.connected_at ?? new Date(),
      last_health_at: new Date(),
      last_health_ok: true,
    });

    await this.integrationLogs.record({
      connectionId,
      direction: IntegrationDirection.OUTBOUND,
      operation: 'oauth.callback',
      status: IntegrationLogStatus.SUCCESS,
      responseMeta: { account: meta.account },
      traceId: getRequestStore()?.traceId ?? null,
    });
    await this.audit.record({
      action: 'integration.connection.oauth',
      entityType: 'Connection',
      entityId: connectionId,
      newValue: { status: 'ACTIVE', account: meta.account },
    });
    return updated;
  }

  // ─── Helpers privados ───────────────────────────────

  private buildContext(connection: Connection): ProviderContext {
    return {
      connection,
      secrets: this.secrets.accessorFor(connection.secret_id),
      logger: new Logger(`Provider:${connection.provider_key}`),
    };
  }

  /** connect() + health() logo apos o wizard — nunca lanca. */
  private async runConnectAndHealth(connection: Connection): Promise<Connection> {
    const startedAt = Date.now();
    let result: HealthResult;
    try {
      const provider = this.registry.get(connection.provider_key);
      const ctx = this.buildContext(connection);
      const connectResult = await provider.connect(
        ctx,
        (connection.config ?? {}) as Record<string, unknown>,
      );
      result = connectResult.ok
        ? await provider.health(ctx)
        : { ok: false, detail: connectResult.detail };
    } catch (e) {
      result = { ok: false, detail: (e as Error).message };
    }
    await this.integrationLogs.record({
      connectionId: connection.id,
      direction: IntegrationDirection.OUTBOUND,
      operation: 'connect',
      status: result.ok || result.pendingAuth ? IntegrationLogStatus.SUCCESS : IntegrationLogStatus.FAILURE,
      durationMs: Date.now() - startedAt,
      responseMeta: { detail: result.detail, checks: result.checks },
      error: result.ok || result.pendingAuth ? undefined : result.detail,
      traceId: getRequestStore()?.traceId ?? null,
    });
    return this.applyHealthResult(connection, result, true);
  }

  /** Atualiza last_health_* e deriva status conforme a state machine. */
  private async applyHealthResult(
    connection: Connection,
    result: HealthResult,
    isFirstConnect = false,
  ): Promise<Connection> {
    const data: Prisma.ConnectionUpdateInput = {
      last_health_at: new Date(),
      last_health_ok: result.pendingAuth ? null : result.ok,
      status_detail: result.detail ?? null,
    };

    // DISABLED/MAINTENANCE sao estados escolhidos pelo usuario — health nao
    // os sobrepoe; so registra o resultado.
    const userPinned: ConnectionStatus[] = ['DISABLED', 'MAINTENANCE'];
    if (!userPinned.includes(connection.status)) {
      const target: ConnectionStatus = result.pendingAuth
        ? 'PENDING_AUTH'
        : result.ok
          ? 'ACTIVE'
          : 'ERROR';
      assertConnectionTransition(connection.status, target);
      data.status = target;
      data.is_active = result.ok && !result.pendingAuth;
      if (result.ok && (isFirstConnect || !connection.connected_at)) {
        data.connected_at = new Date();
      }
    }
    return this.repository.update(connection.id, data);
  }

  private async safeHealth(connection: Connection): Promise<HealthResult> {
    try {
      const provider = this.registry.get(connection.provider_key);
      return await provider.health(this.buildContext(connection));
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  }

  /** Remove do config qualquer campo marcado secret no wizard_schema. */
  private stripSecretFields(
    config: Record<string, unknown>,
    definition: ProviderDefinition,
  ): Record<string, unknown> {
    const schema = definition.wizard_schema as unknown as WizardSchema | null;
    const secretKeys = new Set<string>();
    for (const step of schema?.steps ?? []) {
      for (const field of step.fields ?? []) {
        if (field.secret) secretKeys.add(field.key);
      }
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config)) {
      if (!secretKeys.has(k)) out[k] = v;
    }
    return out;
  }

  private resolveSecretKind(providerKey: string): SecretKind {
    if (this.registry.has(providerKey)) {
      const kind = this.registry.get(providerKey).metadata().secretKind;
      if (kind) return kind as SecretKind;
    }
    return SecretKind.API_KEY;
  }

  /** Resumo seguro do resultado pro response_meta (sem payload gigante). */
  private summarize(result: unknown): string {
    if (result === null || result === undefined) return 'vazio';
    if (Array.isArray(result)) return `array[${result.length}]`;
    if (typeof result === 'object') return `object{${Object.keys(result as object).length} chaves}`;
    return typeof result;
  }

  private withoutBinary(value: unknown): unknown {
    if (Buffer.isBuffer(value)) return `[arquivo: ${value.length} bytes]`;
    if (Array.isArray(value)) return value.map((item) => this.withoutBinary(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.withoutBinary(item)]));
    }
    return value;
  }
}
