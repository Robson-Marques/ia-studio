// Ciclo de vida do agente: CRUD + versoes imutaveis (draft/publish/rollback,
// estilo git — diretriz 3) + export/import JSON SEM secrets (diretriz 29).
// Agente nunca e deletado — so is_active=false.
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PERMISSIONS } from '../../../shared/permissions.constants';
import { AuthenticatedUser } from '../../../shared/auth/auth.types';
import { AiAgent, Prisma } from '@prisma/client';
import { AgentsRepository } from './agents.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  CreateAgentDto,
  ImportAgentDto,
  SaveAgentVersionDto,
  UpdateAgentDto,
} from './dto/agents.dtos';

export const AGENT_EXPORT_SCHEMA_VERSION = 1;

// Capacidades ISP de consulta que já existem no catálogo. Não incluir aqui
// operações de escrita, acesso SQL/HTTP genérico ou ações financeiras sensíveis.
// Se o IXC estiver ativo, novos assistentes nascem com as consultas habilitadas;
// o operador ainda pode modificar a lista em "O que faz".
const ISP_DEFAULT_READ_TOOLS = [
  'identificar_cliente',
  'consultar_chamados_recentes',
  'diagnosticar_conexao',
  'consultar_contrato',
  'status_conexao',
  'conversation_history',
  'current_datetime',
] as const;

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly repository: AgentsRepository,
    private readonly audit: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Leitura ────────────────────────────────────────

  findAll() {
    return this.repository.findAll();
  }

  findActive() {
    return this.repository.findActive();
  }

  async findById(id: string): Promise<AiAgent> {
    const agent = await this.repository.findById(id);
    if (!agent) throw new NotFoundException('Agente não encontrado.');
    return agent;
  }

  async findDetail(id: string) {
    const agent = await this.findById(id);
    const versions = await this.repository.listVersions(id);
    const runs = await this.repository.listRuns(id, 20);
    return { ...agent, versions, recent_runs: runs };
  }

  listVersions(id: string) {
    return this.findById(id).then(() => this.repository.listVersions(id));
  }

  listRuns(id: string) {
    return this.findById(id).then(() => this.repository.listRuns(id, 50));
  }

  // ─── Anti-escalada de ações da IA ───────────────────

  /**
   * Trava de concessão de poder à IA: marcar uma ferramenta que GRAVA dados
   * (`requires_approval` no catálogo) num assistente exige a permissão
   * `ai.agents.actions`. Sem ela, o operador só concede ferramentas de leitura.
   * Platform admin (bypass ['*']) e quem tem a perm passam. Ninguém eleva o
   * poder da IA além do próprio. (No runtime, a ação ainda passa por aprovação.)
   */
  private async assertActionGrant(
    allowedTools: string[] | undefined,
    actor?: AuthenticatedUser,
  ): Promise<void> {
    if (!allowedTools || allowedTools.length === 0) return;
    const perms = actor?.permissions ?? [];
    const canGrant = perms.includes('*') || perms.includes(PERMISSIONS.AI_AGENTS_ACTIONS);
    if (canGrant) return;

    const writeTools = await this.prisma.aiTool.findMany({
      where: { key: { in: allowedTools }, requires_approval: true },
      select: { name: true },
    });
    if (writeTools.length > 0) {
      const nomes = writeTools.map((t) => `"${t.name}"`).join(', ');
      throw new ForbiddenException(
        `Você não tem permissão para conceder ações que gravam dados (${nomes}). Peça a um administrador a permissão "Conceder à IA ações que gravam dados", ou marque apenas habilidades de consulta.`,
      );
    }
  }

  // ─── CRUD ───────────────────────────────────────────

  async create(dto: CreateAgentDto, createdBy: string | null, actor?: AuthenticatedUser) {
    await this.assertActionGrant(dto.allowed_tools, actor);

    // Conectou o IXC? O assistente já conhece as ferramentas ISP de leitura,
    // sem configurar IDs, schemas ou endpoints. Quem informou allowed_tools
    // explicitamente (inclusive []) tem sua decisão preservada.
    let allowedTools = dto.allowed_tools;
    if (allowedTools === undefined) {
      const ixc = await this.prisma.connection.findMany({
        where: { provider_key: 'ixc', is_active: true, status: 'ACTIVE' },
        select: { id: true },
        take: 2,
      });
      if (ixc.length === 1) {
        const available = await this.prisma.aiTool.findMany({
          where: { key: { in: [...ISP_DEFAULT_READ_TOOLS] }, is_active: true, builtin: true, requires_approval: false },
          select: { key: true },
        });
        allowedTools = available.map((tool) => tool.key);
      }
    }

    const agent = await this.repository.create({
      name: dto.name,
      description: dto.description,
      connection_id: dto.connection_id,
      model: dto.model,
      system_prompt: dto.system_prompt,
      persona: dto.persona === undefined ? undefined : (dto.persona as Prisma.InputJsonValue),
      roteiro: dto.roteiro === undefined ? undefined : (dto.roteiro as Prisma.InputJsonValue),
      goal: dto.goal,
      temperature: dto.temperature ?? 0.3,
      max_steps: dto.max_steps ?? 6,
      max_tokens: dto.max_tokens,
      allowed_tools: allowedTools ?? [],
      knowledge_base_ids: dto.knowledge_base_ids ?? [],
      memory_profile_ids: dto.memory_profile_ids ?? [],
      action_permissions: dto.action_permissions ?? [],
      guardrails: dto.guardrails === undefined ? undefined : (dto.guardrails as Prisma.InputJsonValue),
      conversation: dto.conversation === undefined ? undefined : (dto.conversation as Prisma.InputJsonValue),
      created_by: createdBy,
    } as Prisma.AiAgentUncheckedCreateInput);
    await this.audit.record({
      action: 'ai.agent.create',
      entityType: 'AiAgent',
      entityId: agent.id,
      newValue: { name: agent.name, model: agent.model },
    });
    return agent;
  }

  async update(id: string, dto: UpdateAgentDto, actor?: AuthenticatedUser) {
    const before = await this.findById(id);
    // Só valida quando o próprio update mexe em allowed_tools.
    if (dto.allowed_tools !== undefined) {
      await this.assertActionGrant(dto.allowed_tools, actor);
    }
    const data: Prisma.AiAgentUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.connection_id !== undefined) data.connection_id = dto.connection_id;
    if (dto.model !== undefined) data.model = dto.model;
    if (dto.system_prompt !== undefined) data.system_prompt = dto.system_prompt;
    if (dto.persona !== undefined) data.persona = dto.persona as Prisma.InputJsonValue;
    if (dto.roteiro !== undefined) data.roteiro = dto.roteiro as Prisma.InputJsonValue;
    if (dto.goal !== undefined) data.goal = dto.goal;
    if (dto.temperature !== undefined) data.temperature = dto.temperature;
    if (dto.max_steps !== undefined) data.max_steps = dto.max_steps;
    if (dto.max_tokens !== undefined) data.max_tokens = dto.max_tokens;
    if (dto.allowed_tools !== undefined) data.allowed_tools = dto.allowed_tools;
    if (dto.knowledge_base_ids !== undefined) data.knowledge_base_ids = dto.knowledge_base_ids;
    if (dto.memory_profile_ids !== undefined) data.memory_profile_ids = dto.memory_profile_ids;
    if (dto.action_permissions !== undefined) data.action_permissions = dto.action_permissions;
    if (dto.guardrails !== undefined) data.guardrails = dto.guardrails as Prisma.InputJsonValue;
    if (dto.conversation !== undefined) data.conversation = dto.conversation as Prisma.InputJsonValue;
    if (dto.is_active !== undefined) data.is_active = dto.is_active;
    const agent = await this.repository.update(id, data);
    await this.audit.record({
      action: 'ai.agent.update',
      entityType: 'AiAgent',
      entityId: id,
      oldValue: { name: before.name, model: before.model, is_active: before.is_active },
      newValue: { name: agent.name, model: agent.model, is_active: agent.is_active },
    });
    return agent;
  }

  // ─── Versoes (diretriz 3) ───────────────────────────

  /** Salvar = nova versao imutavel (snapshot do estado corrente do agente). */
  async saveVersion(id: string, dto: SaveAgentVersionDto, createdBy: string | null) {
    const agent = await this.findById(id);
    const next = (await this.repository.latestVersionNumber(id)) + 1;
    const version = await this.repository.createVersion({
      agent_id: id,
      version: next,
      snapshot: this.snapshotOf(agent) as Prisma.InputJsonValue,
      note: dto.note,
      created_by: createdBy,
    });
    await this.audit.record({
      action: 'ai.agent.save_version',
      entityType: 'AiAgent',
      entityId: id,
      newValue: { version: next, note: dto.note ?? null },
    });
    return version;
  }

  /** Publicar/rollback: aponta current_version pra uma versao existente. */
  async publish(id: string, versionNumber: number, actorId: string | null) {
    const agent = await this.findById(id);
    const version = await this.repository.findVersion(id, versionNumber);
    if (!version) throw new NotFoundException(`Versão v${versionNumber} não existe neste agente.`);

    const updated = await this.repository.update(id, { current_version: versionNumber });
    if (!version.published_at) await this.repository.markVersionPublished(id, versionNumber);

    const isRollback = versionNumber < agent.current_version;
    await this.audit.record({
      action: isRollback ? 'ai.agent.rollback' : 'ai.agent.publish',
      entityType: 'AiAgent',
      entityId: id,
      oldValue: { current_version: agent.current_version },
      newValue: { current_version: versionNumber },
    });
    this.logger.log(`Agente ${id} ${isRollback ? 'revertido' : 'publicado'} na v${versionNumber} por ${actorId ?? 'sistema'}.`);
    return updated;
  }

  // ─── Export / Import (SEM secrets — diretriz 29) ────

  async exportAgent(id: string) {
    const agent = await this.findById(id);
    return {
      schema_version: AGENT_EXPORT_SCHEMA_VERSION,
      kind: 'iastudio.agent',
      exported_at: new Date().toISOString(),
      agent: this.snapshotOf(agent),
    };
  }

  async importAgent(dto: ImportAgentDto, createdBy: string | null, actor?: AuthenticatedUser) {
    const data = dto.data as {
      kind?: string;
      schema_version?: number;
      agent?: Record<string, unknown>;
    };
    if (data.kind !== 'iastudio.agent' || !data.agent) {
      throw new BadRequestException('Arquivo de importação inválido (esperado kind=iastudio.agent).');
    }
    if ((data.schema_version ?? 0) > AGENT_EXPORT_SCHEMA_VERSION) {
      throw new BadRequestException('Export gerado por versão mais nova da plataforma — atualize o sistema.');
    }
    const snap = data.agent;
    const createDto: CreateAgentDto = {
      name: dto.name ?? (typeof snap['name'] === 'string' ? (snap['name'] as string) : 'Agente importado'),
      description: typeof snap['description'] === 'string' ? (snap['description'] as string) : undefined,
      model: typeof snap['model'] === 'string' ? (snap['model'] as string) : 'gpt-4o-mini',
      system_prompt: typeof snap['system_prompt'] === 'string' ? (snap['system_prompt'] as string) : undefined,
      persona: this.asObject(snap['persona']),
      roteiro: this.asObject(snap['roteiro']),
      goal: typeof snap['goal'] === 'string' ? (snap['goal'] as string) : undefined,
      temperature: typeof snap['temperature'] === 'number' ? (snap['temperature'] as number) : undefined,
      max_steps: typeof snap['max_steps'] === 'number' ? (snap['max_steps'] as number) : undefined,
      allowed_tools: this.asStringArray(snap['allowed_tools']),
      knowledge_base_ids: [],
      memory_profile_ids: [],
      guardrails: this.asObject(snap['guardrails']),
      conversation: this.asObject(snap['conversation']),
    };
    const agent = await this.create(createDto, createdBy, actor);
    await this.audit.record({
      action: 'ai.agent.import',
      entityType: 'AiAgent',
      entityId: agent.id,
      newValue: { name: agent.name },
    });
    return agent;
  }

  // ─── Helpers ────────────────────────────────────────

  /** Snapshot versionavel/exportavel do agente (sem connection secreta). */
  private snapshotOf(agent: AiAgent): Record<string, unknown> {
    return {
      name: agent.name,
      description: agent.description,
      model: agent.model,
      system_prompt: agent.system_prompt,
      goal: agent.goal,
      temperature: agent.temperature,
      max_steps: agent.max_steps,
      max_tokens: agent.max_tokens,
      persona: agent.persona,
      roteiro: (agent as AiAgent & { roteiro?: unknown }).roteiro,
      conversation: (agent as AiAgent & { conversation?: unknown }).conversation,
      allowed_tools: agent.allowed_tools,
      knowledge_base_ids: agent.knowledge_base_ids,
      memory_profile_ids: agent.memory_profile_ids,
      guardrails: agent.guardrails,
    };
  }

  private asObject(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  }
}
