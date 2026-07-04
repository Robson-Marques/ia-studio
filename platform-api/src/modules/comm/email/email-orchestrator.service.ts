// Email Orchestrator (Fase 7 — Email Platform). Espelha o Meta Orchestrator do
// WhatsApp: o chamador (fluxo/IA/Notification Center) NUNCA conhece a conexao —
// pede org/workspace/ambiente + criterios (connection_id explicito | tag) e o
// orquestrador resolve uma Connection de e-mail (categoria COMMUNICATION:
// google-workspace ou smtp). Todo envio passa pelo ConnectionsService.execute
// (Provider Registry → IntegrationLog + last_used_at) e registra consumo 'emails'.
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Connection, ConnectionStatus } from '@prisma/client';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { UsageService } from '../../licensing/usage.service';
import { LimitsService } from '../../licensing/limits.service';

// Providers que sabem enviar e-mail (email.send). Ordem = preferencia default.
export const EMAIL_PROVIDER_KEYS = ['google-workspace', 'smtp'];

export interface EmailScope {
  organizationId: string;
  workspaceId?: string;
  environmentId?: string;
}

export interface EmailSendCriteria {
  connectionId?: string;
  tag?: string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  fromName?: string;
}

export interface EmailSendResult {
  connectionId: string;
  provider_key: string;
  message_id: string | null;
}

@Injectable()
export class EmailOrchestratorService {
  private readonly logger = new Logger(EmailOrchestratorService.name);

  constructor(
    private readonly connections: ConnectionsService,
    private readonly connectionsRepository: ConnectionsRepository,
    private readonly usage: UsageService,
    private readonly limits: LimitsService,
  ) {}

  /** Resolve a conexao de e-mail ativa por criterio (o fluxo nunca conhece a conta). */
  async resolveConnection(scope: EmailScope, criteria?: EmailSendCriteria): Promise<Connection> {
    // Uma consulta por provider de e-mail; junta e filtra pelas ativas.
    const lists = await Promise.all(
      EMAIL_PROVIDER_KEYS.map((providerKey) =>
        this.connectionsRepository.findAllByOrg(scope.organizationId, {
          providerKey,
          workspaceId: scope.workspaceId,
          environmentId: scope.environmentId,
        }),
      ),
    );
    const active = lists.flat().filter((c) => c.status === ConnectionStatus.ACTIVE);
    if (active.length === 0) {
      throw new BadRequestException(
        'Nenhuma conexão de e-mail ativa neste escopo. Conecte uma conta Google ou SMTP primeiro.',
      );
    }

    // 1) Conexao explicita.
    if (criteria?.connectionId) {
      const found = active.find((c) => c.id === criteria.connectionId);
      if (!found) throw new BadRequestException('Conexão de e-mail informada não está ativa neste escopo.');
      return found;
    }

    // 2) Tag.
    const wanted = (criteria?.tag ?? '').trim().toLowerCase();
    if (wanted) {
      const byTag = active.find((c) => c.tags.some((t) => t.trim().toLowerCase() === wanted));
      if (byTag) return byTag;
      this.logger.warn(`Nenhuma conexão de e-mail com tag "${wanted}" — caindo na preferência/prioridade.`);
    }

    // 3) Preferencia de provider (google-workspace antes de smtp) + maior priority.
    for (const providerKey of EMAIL_PROVIDER_KEYS) {
      const byProvider = active
        .filter((c) => c.provider_key === providerKey)
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      if (byProvider.length) return byProvider[0];
    }
    return active[0];
  }

  /** Envia um e-mail: resolve conexao → execute('email.send') → mete consumo. */
  async send(scope: EmailScope, message: EmailMessage, criteria?: EmailSendCriteria): Promise<EmailSendResult> {
    const connection = await this.resolveConnection(scope, criteria);
    return this.sendViaConnection(scope, connection, message);
  }

  /** Envio quando a conexao ja e conhecida. */
  async sendViaConnection(
    scope: EmailScope,
    connection: Connection,
    message: EmailMessage,
  ): Promise<EmailSendResult> {
    if (!message.to || (Array.isArray(message.to) && message.to.length === 0)) {
      throw new BadRequestException('Informe ao menos um destinatário de e-mail.');
    }
    // Enforcement de limite mensal do plano (diretriz 19) antes de enviar.
    await this.limits.checkLimit(scope.organizationId, 'email_sends_month', 1);

    const result = (await this.connections.execute(scope.organizationId, connection.id, 'email.send', {
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      cc: message.cc,
      bcc: message.bcc,
      reply_to: message.replyTo,
      from_name: message.fromName,
    })) as { message_id?: string } | undefined;

    // Metering (diretriz 40): 'emails' (métrica de consumo) + 'email_sends_month'
    // (a métrica que o limite do plano acumula/checa).
    await this.usage.increment(scope.organizationId, scope.workspaceId ?? null, 'emails');
    await this.usage.increment(scope.organizationId, scope.workspaceId ?? null, 'email_sends_month');

    return {
      connectionId: connection.id,
      provider_key: connection.provider_key,
      message_id: result?.message_id ?? null,
    };
  }
}
