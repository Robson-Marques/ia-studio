// Execution Monitor (diretriz 13): listagem com filtros, detalhe com a
// timeline por no, retry (nova execucao com o mesmo input) e cancel
// (cooperativo — a engine verifica entre nos).
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ExecutionStatus } from '@prisma/client';
import { ExecutionsRepository, ExecutionFilters } from '../engine/executions.repository';
import { WorkflowsService } from '../workflows/workflows.service';
import { AuditLogService } from '../../../shared/audit/audit-log.service';

@Injectable()
export class ExecutionsService {
  constructor(
    private readonly repository: ExecutionsRepository,
    private readonly workflows: WorkflowsService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(filters: ExecutionFilters, take = 25, skip = 0) {
    const [total, items] = await this.repository.findAll(filters, take, skip);
    return { total, items };
  }

  async findById(id: string) {
    const execution = await this.repository.findByIdWithLogs(id);
    if (!execution) throw new NotFoundException('Execução não encontrada.');
    return execution;
  }

  /** Retry = NOVA execucao com o mesmo input/versao (trigger RETRY). */
  async retry(id: string, userId: string | null) {
    const execution = await this.findById(id);
    const workflow = await this.workflows.findById(execution.workflow_id);
    const retried = await this.workflows.startExecution(workflow, {
      triggerType: 'RETRY',
      input: execution.input ?? {},
      dryRun: execution.dry_run,
      userId,
      version: execution.version,
      traceId: execution.trace_id, // mantem a correlacao com a cadeia original
    });
    await this.audit.record({
      action: 'automation.execution.retry',
      entityType: 'WorkflowExecution',
      entityId: id,
      newValue: { retried_execution_id: retried?.id ?? null },
    });
    return retried;
  }

  /** Cancel cooperativo: QUEUED/RUNNING → CANCELLED (409 se ja finalizou). */
  async cancel(id: string) {
    const execution = await this.findById(id);
    const changed = await this.repository.updateIfStatus(
      execution.id,
      [ExecutionStatus.QUEUED, ExecutionStatus.RUNNING],
      { status: 'CANCELLED', finished_at: new Date(), error: 'Cancelada pelo usuário.' },
    );
    if (!changed) {
      throw new ConflictException('Execução já finalizada — não é possível cancelar.');
    }
    await this.audit.record({
      action: 'automation.execution.cancel',
      entityType: 'WorkflowExecution',
      entityId: id,
    });
    return this.repository.findById(id);
  }
}
