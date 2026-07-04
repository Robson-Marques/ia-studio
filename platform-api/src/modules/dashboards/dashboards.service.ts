// Dashboards consolidados (Fase 8, diretriz 34 — Analytics LE agregacoes, nunca
// logs crus, e e READ-ONLY). Reaproveita os contadores que ja existem:
//   * organizations (core)         → total de tenants
//   * automation_executions        → execucoes (total/erros)
//   * ai_cost_records              → custo IA (US$) + tokens
//   * comm_whatsapp_messages       → mensagens WhatsApp (out)
//   * automation_notification_log  → emails enviados (channel=email, SENT)
//   * integration_connections      → health das conexoes (ativas/erro)
// Filas: se o broker Redis estiver ativo, o worker as monitora; aqui reportamos
// "n/d" quando nao ha como inspecionar sem importar o broker no request.
import { Injectable } from '@nestjs/common';
import { CommMessageDirection, ConnectionStatus, ExecutionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

export interface QueueInfo {
  available: boolean;
  detail: string;
}

@Injectable()
export class DashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Visao global (Console/platform-admin) — soma de TODA a instancia. */
  async overview() {
    const [
      organizations,
      executionsTotal,
      executionsError,
      whatsappOut,
      emailsSent,
      connectionsTotal,
      connectionsActive,
      connectionsError,
      costAgg,
    ] = await this.prisma.$transaction([
      this.prisma.organization.count(),
      this.prisma.workflowExecution.count(),
      this.prisma.workflowExecution.count({ where: { status: ExecutionStatus.FAILED } }),
      this.prisma.whatsappMessage.count({ where: { direction: CommMessageDirection.OUTGOING } }),
      this.prisma.automationNotificationLog.count({ where: { channel: 'email', status: 'SENT' } }),
      this.prisma.connection.count(),
      this.prisma.connection.count({ where: { status: ConnectionStatus.ACTIVE } }),
      this.prisma.connection.count({
        where: { status: { in: [ConnectionStatus.ERROR, ConnectionStatus.TOKEN_EXPIRED] } },
      }),
      this.prisma.aiCostRecord.aggregate({
        _sum: { cost_usd: true, tokens_prompt: true, tokens_completion: true },
      }),
    ]);

    return {
      organizations,
      executions: { total: executionsTotal, errors: executionsError },
      ai: {
        cost_usd: costAgg._sum.cost_usd ?? 0,
        tokens: (costAgg._sum.tokens_prompt ?? 0) + (costAgg._sum.tokens_completion ?? 0),
        tokens_prompt: costAgg._sum.tokens_prompt ?? 0,
        tokens_completion: costAgg._sum.tokens_completion ?? 0,
      },
      whatsapp_messages: whatsappOut,
      emails: emailsSent,
      connections: {
        total: connectionsTotal,
        active: connectionsActive,
        error: connectionsError,
      },
      queues: this.queueInfo(),
      generated_at: new Date().toISOString(),
    };
  }

  /** Resumo org-scoped (painel do cliente) — mesma agregacao filtrada. */
  async summary(organizationId: string) {
    const where: Prisma.WorkflowExecutionWhereInput = { organization_id: organizationId };
    const [
      executionsTotal,
      executionsError,
      whatsappOut,
      emailsSent,
      connectionsActive,
      connectionsError,
      costAgg,
    ] = await this.prisma.$transaction([
      this.prisma.workflowExecution.count({ where }),
      this.prisma.workflowExecution.count({
        where: { ...where, status: ExecutionStatus.FAILED },
      }),
      this.prisma.whatsappMessage.count({
        where: { organization_id: organizationId, direction: CommMessageDirection.OUTGOING },
      }),
      this.prisma.automationNotificationLog.count({
        where: { organization_id: organizationId, channel: 'email', status: 'SENT' },
      }),
      this.prisma.connection.count({
        where: { organization_id: organizationId, status: ConnectionStatus.ACTIVE },
      }),
      this.prisma.connection.count({
        where: {
          organization_id: organizationId,
          status: { in: [ConnectionStatus.ERROR, ConnectionStatus.TOKEN_EXPIRED] },
        },
      }),
      this.prisma.aiCostRecord.aggregate({
        where: { organization_id: organizationId },
        _sum: { cost_usd: true, tokens_prompt: true, tokens_completion: true },
      }),
    ]);

    return {
      organization_id: organizationId,
      executions: { total: executionsTotal, errors: executionsError },
      ai: {
        cost_usd: costAgg._sum.cost_usd ?? 0,
        tokens: (costAgg._sum.tokens_prompt ?? 0) + (costAgg._sum.tokens_completion ?? 0),
      },
      whatsapp_messages: whatsappOut,
      emails: emailsSent,
      connections: { active: connectionsActive, error: connectionsError },
      generated_at: new Date().toISOString(),
    };
  }

  // Sem Redis (ou sem inspecao direta no request) reportamos "n/d". A inspecao
  // real das filas BullMQ vive no processo do worker.
  private queueInfo(): QueueInfo {
    const hasRedis = Boolean(process.env['REDIS_URL']);
    return hasRedis
      ? { available: false, detail: 'Monitorado pelo worker (iastudio-worker).' }
      : { available: false, detail: 'n/d — broker Redis indisponível.' };
  }
}
