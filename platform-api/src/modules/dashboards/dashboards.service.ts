// Dashboards consolidados (Fase 8, diretriz 34 — Analytics LE agregacoes, nunca
// logs crus, e e READ-ONLY). Reaproveita os contadores que ja existem:
//   * automation_executions        → execucoes (total/erros)
//   * comm_whatsapp_messages       → mensagens WhatsApp (out)
//   * automation_notification_log  → emails enviados (channel=email, SENT)
//   * integration_connections      → health das conexoes (ativas/erro)
// Filas: se o broker Redis estiver ativo, o worker as monitora; aqui reportamos
// "n/d" quando nao ha como inspecionar sem importar o broker no request.
import { Injectable } from '@nestjs/common';
import { CommMessageDirection, ConnectionStatus, ExecutionStatus } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';

export interface QueueInfo {
  available: boolean;
  detail: string;
}

@Injectable()
export class DashboardsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Visão consolidada da instalação dedicada. */
  async overview() {
    const [
      executionsTotal,
      executionsError,
      whatsappOut,
      emailsSent,
      connectionsTotal,
      connectionsActive,
      connectionsError,
    ] = await this.prisma.$transaction([
      this.prisma.workflowExecution.count(),
      this.prisma.workflowExecution.count({ where: { status: ExecutionStatus.FAILED } }),
      this.prisma.whatsappMessage.count({ where: { direction: CommMessageDirection.OUTGOING } }),
      this.prisma.automationNotificationLog.count({ where: { channel: 'email', status: 'SENT' } }),
      this.prisma.connection.count(),
      this.prisma.connection.count({ where: { status: ConnectionStatus.ACTIVE } }),
      this.prisma.connection.count({
        where: { status: { in: [ConnectionStatus.ERROR, ConnectionStatus.TOKEN_EXPIRED] } },
      }),
    ]);

    return {
      executions: { total: executionsTotal, errors: executionsError },
      ai: { cost_tracking: 'not_configured' },
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

  /** Resumo da instalação dedicada. */
  async summary() {
    const [
      executionsTotal,
      executionsError,
      whatsappOut,
      emailsSent,
      connectionsActive,
      connectionsError,
    ] = await this.prisma.$transaction([
      this.prisma.workflowExecution.count(),
      this.prisma.workflowExecution.count({
        where: { status: ExecutionStatus.FAILED },
      }),
      this.prisma.whatsappMessage.count({
        where: { direction: CommMessageDirection.OUTGOING },
      }),
      this.prisma.automationNotificationLog.count({
        where: { channel: 'email', status: 'SENT' },
      }),
      this.prisma.connection.count({
        where: { status: ConnectionStatus.ACTIVE },
      }),
      this.prisma.connection.count({
        where: {
          status: { in: [ConnectionStatus.ERROR, ConnectionStatus.TOKEN_EXPIRED] },
        },
      }),
    ]);

    return {
      executions: { total: executionsTotal, errors: executionsError },
      ai: { cost_tracking: 'not_configured' },
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
