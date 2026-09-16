// Regras de colaboracao entre agentes de IA: CRUD + orquestracao do
// consultar_especialista. O AgentRunner NAO e importado aqui (evita ciclo
// runner → collaboration → runner); o runner injeta a si mesmo como callback
// `runAgent` no metodo consult() (injecao de dependencia por parametro).
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CollaborationRepository } from './collaboration.repository';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { CreateCollaborationRuleDto, UpdateCollaborationRuleDto } from './dto/collaboration.dtos';

/** Resultado de uma execucao de agente colaborador. */
export interface RunAgentResult {
  output: string;
}

/** Callback que executa um agente — fornecido pelo AgentRunner em runtime. */
export type RunAgentFn = (args: {
  agentId: string;
  input: string;
  traceId: string;
  executionId?: string;
}) => Promise<RunAgentResult>;

export interface ConsultParams {
  principalAgentId: string;
  query: string;
  traceId: string;
  executionId?: string;
  runAgent: RunAgentFn;
}

export interface ConsultAnswer {
  agent_id: string;
  label: string | null;
  output_mode: string;
  answer: string;
}

@Injectable()
export class CollaborationService {
  private readonly logger = new Logger(CollaborationService.name);

  constructor(
    private readonly repository: CollaborationRepository,
    private readonly audit: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Leitura ────────────────────────────────────────

  list(filters: { principalAgentId?: string }) {
    return this.repository.findAll(filters);
  }

  async getRule(id: string) {
    const rule = await this.repository.findById(id);
    if (!rule) throw new NotFoundException('Regra de colaboração não encontrada.');
    return rule;
  }

  // ─── CRUD ───────────────────────────────────────────

  async create(dto: CreateCollaborationRuleDto, createdBy: string | null) {
    if (dto.principal_agent_id === dto.collaborator_agent_id) {
      throw new BadRequestException('O agente principal e o colaborador devem ser diferentes.');
    }
    await this.assertAgentExists(dto.principal_agent_id, 'principal');
    await this.assertAgentExists(dto.collaborator_agent_id, 'colaborador');

    const rule = await this.repository.create({
      principal_agent_id: dto.principal_agent_id,
      collaborator_agent_id: dto.collaborator_agent_id,
      output_mode: dto.output_mode ?? undefined,
      trigger_mode: dto.trigger_mode ?? undefined,
      label: dto.label ?? null,
      created_by: createdBy,
    } as Prisma.AiCollaborationRuleUncheckedCreateInput);
    await this.audit.record({
      action: 'ai.collaboration.create',
      entityType: 'AiCollaborationRule',
      entityId: rule.id,
      newValue: {
        principal_agent_id: rule.principal_agent_id,
        collaborator_agent_id: rule.collaborator_agent_id,
        output_mode: rule.output_mode,
        trigger_mode: rule.trigger_mode,
        label: rule.label,
      },
    });
    return rule;
  }

  async update(id: string, dto: UpdateCollaborationRuleDto) {
    const before = await this.getRule(id);
    const rule = await this.repository.update(id, {
      output_mode: dto.output_mode ?? undefined,
      trigger_mode: dto.trigger_mode ?? undefined,
      label: dto.label ?? undefined,
      is_active: dto.is_active ?? undefined,
    });
    await this.audit.record({
      action: 'ai.collaboration.update',
      entityType: 'AiCollaborationRule',
      entityId: id,
      oldValue: {
        output_mode: before.output_mode,
        trigger_mode: before.trigger_mode,
        label: before.label,
        is_active: before.is_active,
      },
      newValue: {
        output_mode: rule.output_mode,
        trigger_mode: rule.trigger_mode,
        label: rule.label,
        is_active: rule.is_active,
      },
    });
    return rule;
  }

  // ─── Orquestracao (consultar_especialista) ──────────

  /**
   * Consulta todos os agentes colaboradores ativos do principal.
   * O runner passa `runAgent` (a si mesmo) para rodar cada colaborador —
   * sem import direto do AgentRunner (evita dependencia circular).
   * Um erro em um colaborador nao derruba os demais (try/catch por regra).
   */
  async consult(params: ConsultParams): Promise<{ consulted: ConsultAnswer[] }> {
    const rules = await this.repository.findActiveByPrincipal(params.principalAgentId);
    const consulted: ConsultAnswer[] = [];

    for (const rule of rules) {
      let answer: string;
      try {
        const result = await params.runAgent({
          agentId: rule.collaborator_agent_id,
          input: params.query,
          traceId: params.traceId,
          executionId: params.executionId,
        });
        answer = result.output;
      } catch (e) {
        const message = (e as Error).message;
        this.logger.warn(
          `Falha ao consultar colaborador ${rule.collaborator_agent_id} (regra ${rule.id}): ${message}`,
        );
        answer = `Erro ao consultar especialista: ${message}`;
      }
      consulted.push({
        agent_id: rule.collaborator_agent_id,
        label: rule.label,
        output_mode: rule.output_mode,
        answer,
      });
    }

    return { consulted };
  }

  // ─── Privados ───────────────────────────────────────

  /** Garante que o agente existe na instancia dedicada. */
  private async assertAgentExists(agentId: string, role: string): Promise<void> {
    const agent = await this.prisma.aiAgent.findUnique({
      where: { id: agentId },
      select: { id: true },
    });
    if (!agent) {
      throw new BadRequestException(`Agente ${role} não encontrado nesta instalação.`);
    }
  }
}
