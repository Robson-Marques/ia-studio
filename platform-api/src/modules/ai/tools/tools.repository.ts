// Porta unica ao banco do catalogo de tools (ai_tools) e logs (ai_tool_call_logs).
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class ToolsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: { onlyActive?: boolean } = {}) {
    const where: Prisma.AiToolWhereInput = {};
    if (filters.onlyActive) where.is_active = true;
    return this.prisma.aiTool.findMany({ where, orderBy: { name: 'asc' } });
  }

  findByKeys(keys: string[]) {
    return this.prisma.aiTool.findMany({
      where: { key: { in: keys }, is_active: true },
    });
  }

  findByKey(key: string) {
    return this.prisma.aiTool.findFirst({ where: { key } });
  }

  findById(id: string) {
    return this.prisma.aiTool.findUnique({ where: { id } });
  }

  create(data: Prisma.AiToolUncheckedCreateInput) {
    return this.prisma.aiTool.create({ data });
  }

  update(id: string, data: Prisma.AiToolUpdateInput) {
    return this.prisma.aiTool.update({ where: { id }, data });
  }

  upsertByKey(key: string, data: Prisma.AiToolUncheckedCreateInput) {
    return this.prisma.aiTool.upsert({
      where: { key },
      create: data,
      update: {},
    });
  }

  // ─── Logs de chamada ────────────────────────────────

  createCallLog(data: Prisma.AiToolCallLogUncheckedCreateInput) {
    return this.prisma.aiToolCallLog.create({ data });
  }

  findCallLogsByRun(agentRunId: string) {
    return this.prisma.aiToolCallLog.findMany({
      where: { agent_run_id: agentRunId },
      orderBy: { created_at: 'asc' },
    });
  }

  deleteCallLogsBefore(cutoff: Date) {
    return this.prisma.aiToolCallLog.deleteMany({ where: { created_at: { lt: cutoff } } });
  }
}
