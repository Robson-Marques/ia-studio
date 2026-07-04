// Execution Monitor (diretriz 13): listagem com filtros, detalhe com a
// timeline por no, retry (nova execucao com o mesmo input) e cancel
// (cooperativo — a engine verifica entre nos).
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ExecutionStatus } from '@prisma/client';
import { ExecutionsRepository, ExecutionFilters } from '../engine/executions.repository';
import { WorkflowsService } from '../workflows/workflows.service';
import { AuditLogService } from '../../../shared/audit/audit-log.service';
import { assertSameOrg } from '../../../shared/auth/tenant.util';

@Injectable()
export class ExecutionsService {
  constructor(
    private readonly repository: ExecutionsRepository,
    private readonly workflows: WorkflowsService,
    private readonly audit: AuditLogService,
  ) {}

  async findAll(organizationId: string, filters: ExecutionFilters, take = 25, skip = 0) {
    const [total, items] = await this.repository.findAllByOrg(organizationId, filters, take, skip);
    return { total, items };
  }

  async findById(organizationId: string, id: string) {
    const execution = await this.repository.findByIdWithLogs(id);
    if (!execution) throw new NotFoundException('Execução não encontrada.');
    assertSameOrg(execution.organization_id, organizationId);
    return execution;
  }

  /** Retry = NOVA execucao com o mesmo input/versao (trigger RETRY). */
  async retry(organizationId: string, id: string, userId: string | null) {
    const execution = await this.findById(organizationId, id);
    const workflow = await this.workflows.findById(organizationId, execution.workflow_id);
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
      organizationId,
      newValue: { retried_execution_id: retried?.id ?? null },
    });
    return retried;
  }

  /** Cancel cooperativo: QUEUED/RUNNING → CANCELLED (409 se ja finalizou). */
  async cancel(organizationId: string, id: string) {
    const execution = await this.findById(organizationId, id);
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
      organizationId,
    });
    return this.repository.findById(id);
  }
}
