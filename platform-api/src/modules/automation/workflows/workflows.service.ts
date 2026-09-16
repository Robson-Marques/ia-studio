// Ciclo de vida do workflow: CRUD + versoes IMUTAVEIS estilo git (diretriz 3 —
// editar = nova versao; publicar = apontar current_version; rollback =
// repontar; nunca apagar versao) + disparo de execucoes (a API enfileira, o
// worker executa — diretriz 33) + export/import (diretriz 29, sem secrets).
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Prisma, Workflow, WorkflowExecution } from '@prisma/client';
import { randomBytes, randomUUID } from 'crypto';
import { WorkflowsRepository } from './workflows.repository';
import { ExecutionsRepository } from '../engine/executions.repository';
import { NodeRegistryService } from '../engine/node-registry.service';
import { unknownTokens } from '../engine/variable-resolver';
import { parseGraph, parseTrigger, TriggerDef } from '../engine/workflow-graph';
import { SchedulerService } from '../scheduler/scheduler.service';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { IMessageBroker, MESSAGE_BROKER, QUEUES } from '../../../shared/broker/message-broker.interface';
import { CreateWorkflowDto } from './dto/create-workflow.dto';
import { UpdateWorkflowDto } from './dto/update-workflow.dto';
import { SaveVersionDto } from './dto/save-version.dto';
import { ImportWorkflowDto } from './dto/import-workflow.dto';

export const EXPORT_SCHEMA_VERSION = 1;

export interface StartExecutionOptions {
  triggerType: 'MANUAL' | 'EVENT' | 'SCHEDULE' | 'WEBHOOK' | 'RETRY';
  input?: unknown;
  dryRun?: boolean;
  userId?: string | null;
  sourceEventId?: string | null;
  traceId?: string;
  version?: number;
}

@Injectable()
export class WorkflowsService {
  private readonly logger = new Logger(WorkflowsService.name);

  constructor(
    private readonly repository: WorkflowsRepository,
    private readonly executions: ExecutionsRepository,
    private readonly registry: NodeRegistryService,
    private readonly scheduler: SchedulerService,
    private readonly audit: AuditLogService,
    @Inject(MESSAGE_BROKER) private readonly broker: IMessageBroker,
  ) {}

  // ─── Leitura ────────────────────────────────────────

  async findAll() {
    const rows = await this.repository.findAll();
    // Ultimas execucoes (resumo) sem N+1 pesado: so pros 25 primeiros.
    return Promise.all(
      rows.map(async (w) => ({
        ...w,
        recent_executions: await this.executions.findRecentByWorkflow(w.id, 3),
      })),
    );
  }

  async findById(id: string): Promise<Workflow> {
    const workflow = await this.repository.findById(id);
    if (!workflow) throw new NotFoundException('Fluxo não encontrado.');
    return workflow;
  }

  async findDetail(id: string) {
    const workflow = await this.findById(id);
    const versions = await this.repository.listVersions(id);
    const current = versions.find((v) => v.version === workflow.current_version) ?? versions[0] ?? null;
    return { ...workflow, versions, current_graph: current?.graph ?? null, current_trigger: current?.trigger ?? null };
  }

  listVersions(id: string) {
    return this.findById(id).then(() => this.repository.listVersions(id));
  }

  // ─── CRUD ───────────────────────────────────────────

  async create(dto: CreateWorkflowDto, createdBy: string | null) {
    const workflow = await this.repository.create({
      name: dto.name,
      description: dto.description,
      tags: dto.tags ?? [],
      created_by: createdBy,
    });
    await this.audit.record({
      action: 'automation.workflow.create',
      entityType: 'Workflow',
      entityId: workflow.id,
      newValue: { name: workflow.name },
    });
    return workflow;
  }

  async update(id: string, dto: UpdateWorkflowDto) {
    const before = await this.findById(id);
    const workflow = await this.repository.update(id, {
      name: dto.name ?? undefined,
      description: dto.description ?? undefined,
      tags: dto.tags ?? undefined,
    });
    await this.audit.record({
      action: 'automation.workflow.update',
      entityType: 'Workflow',
      entityId: id,
      oldValue: { name: before.name, description: before.description, tags: before.tags },
      newValue: { name: workflow.name, description: workflow.description, tags: workflow.tags },
    });
    return workflow;
  }

  /** Arquivar (nunca DELETE): para gatilhos e some das listas ativas. */
  async archive(id: string) {
    const workflow = await this.findById(id);
    if (workflow.status === 'ARCHIVED') return workflow;
    const updated = await this.repository.update(id, { status: 'ARCHIVED' });
    await this.scheduler.disableSchedule(id);
    await this.audit.record({
      action: 'automation.workflow.archive',
      entityType: 'Workflow',
      entityId: id,
      oldValue: { status: workflow.status },
      newValue: { status: 'ARCHIVED' },
    });
    return updated;
  }

  /** Exclusão definitiva do fluxo (e de tudo que é dele). Diferente de arquivar:
   *  arquivar tira das listas ativas mas guarda; excluir remove de vez. */
  async remove(id: string) {
    const workflow = await this.findById(id);
    await this.scheduler.disableSchedule(id).catch(() => undefined);
    const execCount = await this.repository.countExecutions(id);
    await this.repository.hardDelete(id);
    await this.audit.record({
      action: 'automation.workflow.delete',
      entityType: 'Workflow',
      entityId: id,
      oldValue: { name: workflow.name, status: workflow.status, executions: execCount },
    });
    return { deleted: true };
  }

  // ─── Versoes (diretriz 3) ───────────────────────────

  /** Salvar = SEMPRE nova versao imutavel (nunca UPDATE de graph). */
  async saveVersion(id: string, dto: SaveVersionDto, createdBy: string | null) {
    await this.findById(id);

    const graph = parseGraph(dto.graph);
    if (graph.nodes.length === 0) throw new BadRequestException('O fluxo precisa de pelo menos um nó.');
    const errors = this.validateGraph(graph);
    if (errors.length > 0) {
      throw new BadRequestException(`Fluxo inválido: ${errors.join(' | ')}`);
    }

    const next = (await this.repository.latestVersionNumber(id)) + 1;
    const version = await this.repository.createVersion({
      workflow_id: id,
      version: next,
      graph: dto.graph as Prisma.InputJsonValue,
      trigger: (dto.trigger ?? { type: 'manual' }) as Prisma.InputJsonValue,
      note: dto.note,
      created_by: createdBy,
    });
    await this.audit.record({
      action: 'automation.workflow.save_version',
      entityType: 'Workflow',
      entityId: id,
      newValue: { version: next, note: dto.note ?? null },
    });
    return { ...version, warnings: this.collectWarnings(graph) };
  }

  /** Publicar/rollback: apontar current_version pra uma versao existente. */
  async publish(id: string, versionNumber: number, actorId: string | null) {
    const workflow = await this.findById(id);
    const version = await this.repository.findVersion(id, versionNumber);
    if (!version) throw new NotFoundException(`Versão v${versionNumber} não existe neste fluxo.`);

    const graph = parseGraph(version.graph);
    const errors = this.validateGraph(graph);
    if (errors.length > 0) throw new BadRequestException(`Não é possível publicar: ${errors.join(' | ')}`);

    const trigger = parseTrigger(version.trigger);

    const data: Prisma.WorkflowUpdateInput = {
      status: 'PUBLISHED',
      current_version: versionNumber,
    };
    // TRIGGER_WEBHOOK: garante o token da rota publica /api/webhooks/flows/:token.
    if (trigger.type === 'webhook' && !workflow.webhook_token) {
      data.webhook_token = this.generateWebhookToken();
    }
    const updated = await this.repository.update(id, data);
    if (!version.published_at) await this.repository.markVersionPublished(id, versionNumber);

    // Scheduler (diretriz 12): agenda/desagenda conforme o trigger publicado.
    await this.scheduler.syncWorkflowSchedule(updated, trigger);

    const isRollback = versionNumber < workflow.current_version;
    await this.audit.record({
      action: isRollback ? 'automation.workflow.rollback' : 'automation.workflow.publish',
      entityType: 'Workflow',
      entityId: id,
      oldValue: { current_version: workflow.current_version, status: workflow.status },
      newValue: { current_version: versionNumber, status: 'PUBLISHED', trigger_type: trigger.type },
    });
    this.logger.log(`Workflow ${id} ${isRollback ? 'revertido' : 'publicado'} na v${versionNumber} por ${actorId ?? 'sistema'}.`);
    return { ...updated, warnings: this.collectWarnings(graph) };
  }

  /** Despublicar: volta a DRAFT (para os gatilhos) MAS mantém o fluxo visível e
   *  editável — diferente de arquivar (que some das listas). É o "desligar" do
   *  toggle de autoresposta. No-op se já não está publicado. */
  async unpublish(id: string, actorId: string | null) {
    const workflow = await this.findById(id);
    if (workflow.status !== 'PUBLISHED') return workflow;
    const updated = await this.repository.update(id, { status: 'DRAFT' });
    await this.scheduler.disableSchedule(id).catch(() => undefined);
    await this.audit.record({
      action: 'automation.workflow.unpublish',
      entityType: 'Workflow',
      entityId: id,
      oldValue: { status: workflow.status },
      newValue: { status: 'DRAFT' },
    });
    this.logger.log(`Workflow ${id} despublicado (DRAFT) por ${actorId ?? 'sistema'}.`);
    return updated;
  }

  async rotateWebhookToken(id: string) {
    await this.findById(id);
    const updated = await this.repository.update(id, { webhook_token: this.generateWebhookToken() });
    await this.audit.record({
      action: 'automation.workflow.webhook_token_rotate',
      entityType: 'Workflow',
      entityId: id,
    });
    return { webhook_token: updated.webhook_token };
  }

  // ─── Execucao (API enfileira; worker executa — diretriz 33) ─────────

  async executeManual(
    id: string,
    input: unknown,
    dryRun: boolean,
    userId: string | null,
  ): Promise<WorkflowExecution> {
    const workflow = await this.findById(id);
    if (workflow.status === 'ARCHIVED') throw new ConflictException('Fluxo arquivado não pode ser executado.');
    // Manual roda a versao publicada; sem publicacao, roda a ULTIMA versao
    // salva (teste de rascunho — combinar com dry_run).
    const version = workflow.current_version > 0
      ? workflow.current_version
      : await this.repository.latestVersionNumber(id);
    if (version === 0) throw new BadRequestException('Salve uma versão do fluxo antes de executar.');

    const exec = await this.startExecution(workflow, {
      triggerType: 'MANUAL',
      input,
      dryRun,
      userId,
      version,
    });
    if (!exec) throw new ConflictException('Execução duplicada.');
    return exec;
  }

  /**
   * Cria a execução (QUEUED) e a enfileira no broker.
   * Retorna a execucao pre-existente quando o source_event_id ja rodou
   * (idempotencia por evento).
   */
  async startExecution(workflow: Workflow, opts: StartExecutionOptions): Promise<WorkflowExecution | null> {
    const version = opts.version ?? workflow.current_version;
    if (!version) return null;

    if (opts.sourceEventId) {
      const prior = await this.executions.findBySource(workflow.id, opts.sourceEventId).catch(() => null);
      if (prior) {
        this.logger.warn(`[dedup] evento ${opts.sourceEventId} já executou o fluxo ${workflow.id} — reutilizando.`);
        return prior;
      }
    }

    let exec: WorkflowExecution;
    try {
      exec = await this.executions.create({
        workflow_id: workflow.id,
        version,
        trace_id: opts.traceId ?? randomUUID(),
        status: 'QUEUED',
        trigger_type: opts.triggerType,
        source_event_id: opts.sourceEventId ?? null,
        input: opts.input === undefined ? undefined : (opts.input as Prisma.InputJsonValue),
        dry_run: opts.dryRun ?? false,
        created_by: opts.userId ?? null,
      });
    } catch (e) {
      // Corrida na unique (workflow_id, source_event_id) → reutiliza.
      if ((e as { code?: string }).code === 'P2002' && opts.sourceEventId) {
        return this.executions.findBySource(workflow.id, opts.sourceEventId);
      }
      throw e;
    }

    await this.broker.enqueue(QUEUES.EXECUTIONS, 'run', { execution_id: exec.id }, { jobId: exec.id });
    return exec;
  }

  // ─── Export / Import (diretriz 29 — JSON versionado, SEM secrets) ───

  async exportWorkflow(id: string, versionNumber?: number) {
    const workflow = await this.findById(id);
    const version = versionNumber
      ? await this.repository.findVersion(id, versionNumber)
      : (await this.repository.findVersion(id, workflow.current_version)) ??
        (await this.repository.listVersions(id))[0];
    if (!version) throw new BadRequestException('Fluxo sem versão salva para exportar.');
    return {
      schema_version: EXPORT_SCHEMA_VERSION,
      kind: 'iastudio.workflow',
      exported_at: new Date().toISOString(),
      name: workflow.name,
      description: workflow.description,
      tags: workflow.tags,
      version: {
        graph: version.graph,
        trigger: version.trigger,
        note: version.note,
      },
    };
  }

  async importWorkflow(dto: ImportWorkflowDto, createdBy: string | null) {
    const data = dto.data as {
      schema_version?: number;
      kind?: string;
      name?: string;
      description?: string;
      tags?: string[];
      version?: { graph?: unknown; trigger?: unknown; note?: string };
    };
    if (data.kind !== 'iastudio.workflow' || !data.version?.graph) {
      throw new BadRequestException('Arquivo de importação inválido (esperado kind=iastudio.workflow).');
    }
    if ((data.schema_version ?? 0) > EXPORT_SCHEMA_VERSION) {
      throw new BadRequestException('Export gerado por versão mais nova da plataforma — atualize o sistema.');
    }
    const workflow = await this.create(
      {
        name: dto.name ?? data.name ?? 'Fluxo importado',
        description: data.description,
        tags: Array.isArray(data.tags) ? data.tags : [],
      },
      createdBy,
    );
    await this.saveVersion(
      workflow.id,
      {
        graph: data.version.graph as Record<string, unknown>,
        trigger: (data.version.trigger ?? { type: 'manual' }) as Record<string, unknown>,
        note: data.version.note ?? 'Importado',
      },
      createdBy,
    );
    await this.audit.record({
      action: 'automation.workflow.import',
      entityType: 'Workflow',
      entityId: workflow.id,
      newValue: { name: workflow.name },
    });
    return this.findDetail(workflow.id);
  }

  // ─── Privados ───────────────────────────────────────

  /** Validacao estrutural: tipos conhecidos + validators + edges integras. */
  private validateGraph(graph: ReturnType<typeof parseGraph>): string[] {
    const errors: string[] = [];
    const ids = new Set<string>();
    for (const node of graph.nodes) {
      if (!node.id) errors.push('Nó sem id.');
      if (ids.has(node.id)) errors.push(`Id de nó duplicado: ${node.id}`);
      ids.add(node.id);
      if (!this.registry.has(node.type)) {
        errors.push(`Tipo de nó desconhecido: ${node.type}`);
        continue;
      }
      for (const err of this.registry.validate(node.type, node.config ?? {})) {
        errors.push(`${node.name || node.id}: ${err}`);
      }
    }
    for (const edge of graph.edges) {
      if (!ids.has(edge.from) || !ids.has(edge.to)) {
        errors.push(`Conexão inválida ${edge.from} → ${edge.to} (nó inexistente).`);
      }
    }
    return errors;
  }

  private collectWarnings(graph: ReturnType<typeof parseGraph>): string[] {
    const warnings: string[] = [];
    for (const node of graph.nodes) {
      for (const token of unknownTokens(node.config ?? {})) {
        warnings.push(`${node.name || node.id}: variável desconhecida {{${token}}}.`);
      }
    }
    return warnings;
  }

  private generateWebhookToken(): string {
    return randomBytes(24).toString('hex');
  }
}
