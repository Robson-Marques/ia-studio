// Porta unica ao banco de execucoes (automation_executions + logs por no).
import { Injectable } from '@nestjs/common';
import { ExecutionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface ExecutionFilters {
  workflowId?: string;
  status?: ExecutionStatus;
  traceId?: string;
  from?: Date;
  to?: Date;
}

@Injectable()
export class ExecutionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.WorkflowExecutionUncheckedCreateInput) {
    return this.prisma.workflowExecution.create({ data });
  }

  findById(id: string) {
    return this.prisma.workflowExecution.findUnique({ where: { id } });
  }

  findByIdWithLogs(id: string) {
    return this.prisma.workflowExecution.findUnique({
      where: { id },
      include: { logs: { orderBy: { created_at: 'asc' } }, workflow: { select: { name: true } } },
    });
  }

  findBySource(workflowId: string, sourceEventId: string) {
    return this.prisma.workflowExecution.findUnique({
      where: { workflow_id_source_event_id: { workflow_id: workflowId, source_event_id: sourceEventId } },
    });
  }

  findAll(filters: ExecutionFilters = {}, take = 25, skip = 0) {
    const where: Prisma.WorkflowExecutionWhereInput = {};
    if (filters.workflowId) where.workflow_id = filters.workflowId;
    if (filters.status) where.status = filters.status;
    if (filters.traceId) where.trace_id = filters.traceId;
    if (filters.from || filters.to) {
      where.created_at = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }
    return this.prisma.$transaction([
      this.prisma.workflowExecution.count({ where }),
      this.prisma.workflowExecution.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take,
        skip,
        include: { workflow: { select: { name: true } } },
      }),
    ]);
  }

  findRecentByWorkflow(workflowId: string, take = 5) {
    return this.prisma.workflowExecution.findMany({
      where: { workflow_id: workflowId },
      orderBy: { created_at: 'desc' },
      take,
    });
  }

  update(id: string, data: Prisma.WorkflowExecutionUpdateInput) {
    return this.prisma.workflowExecution.update({ where: { id }, data });
  }

  /** UPDATE condicional (lock otimista) — cancelamento sem corrida. */
  async updateIfStatus(id: string, expected: ExecutionStatus[], data: Prisma.WorkflowExecutionUpdateInput) {
    const res = await this.prisma.workflowExecution.updateMany({
      where: { id, status: { in: expected } },
      data: data as Prisma.WorkflowExecutionUncheckedUpdateManyInput,
    });
    return res.count > 0;
  }

  createLog(data: Prisma.ExecutionLogUncheckedCreateInput) {
    return this.prisma.executionLog.create({ data });
  }
}
