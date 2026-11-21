import { Injectable, Logger } from '@nestjs/common';
import { ConnectchatConversation } from '../../../shared/integration/connectchat.client';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { rows, projectChamado, projectOrdemServico } from '../../isp/isp-projections';

/** Evidências restritas ao vínculo confirmado da conversa; nunca recebe
 * identificador escolhido pelo LLM ou CPF digitado como prova de titularidade. */
export interface VerifiedSupportContext {
  available: boolean;
  reason?: string;
  openOs: Record<string, unknown>[];
  recentOs: Record<string, unknown>[];
  recentTickets: Record<string, unknown>[];
  recurrentWithin48h: boolean;
  recurrenceEvidence: string[];
}

@Injectable()
export class ConnectchatSupportContextService {
  private readonly logger = new Logger(ConnectchatSupportContextService.name);

  constructor(
    private readonly connections: ConnectionsService,
    private readonly repository: ConnectionsRepository,
  ) {}

  async byVerifiedConversation(conversation: ConnectchatConversation): Promise<VerifiedSupportContext> {
    const empty: VerifiedSupportContext = {
      available: false, openOs: [], recentOs: [], recentTickets: [],
      recurrentWithin48h: false, recurrenceEvidence: [],
    };
    if (conversation.businessContact?.status !== 'CUSTOMER'
      || conversation.businessContact.linkStatus !== 'ACTIVE') {
      return { ...empty, reason: 'Cliente ainda não verificado no ConnectChat' };
    }
    const match = /^ixc:([0-9a-f-]{36}):([1-9]\d*)$/i.exec(conversation.customerRef || '');
    if (!match) return { ...empty, reason: 'Vínculo IXC inválido' };
    const [, connectionId, customerId] = match;
    const provider = await this.repository.findById(connectionId);
    if (!provider || provider.provider_key !== 'ixc'
      || provider.status !== 'ACTIVE' || !provider.is_active) {
      return { ...empty, reason: 'Conexão IXC vinculada não está ativa' };
    }

    // A falha na busca de OS ABERTA bloqueia conclusões de "não há chamado"
    // e qualquer decisão de abrir outro. Não há fallback otimista.
    let openOs: Record<string, unknown>[];
    try {
      openOs = rows(await this.connections.execute(connectionId, 'os.listar_abertas',
        { id_cliente: customerId })).slice(0, 10).map(projectOrdemServico);
    } catch (error) {
      this.logger.warn(`Consulta de OS aberta não concluída: ${(error as Error).message}`);
      return { ...empty, reason: 'Não foi possível verificar ordens de serviço abertas' };
    }

    // Histórico complementar: falha não apaga a evidência de OS em andamento.
    const [os, tickets] = await Promise.all([
      this.connections.execute(connectionId, 'os.listar_recentes',
        { id_cliente: customerId }).then(rows).then((v) => v.slice(0, 5).map(projectOrdemServico)).catch(() => []),
      this.connections.execute(connectionId, 'atendimento.listar_chamados_recentes',
        { id_cliente: customerId }).then(rows).then((v) => v.slice(0, 5).map(projectChamado)).catch(() => []),
    ]);

    const now = Date.now();
    const evidence: string[] = [];
    for (const item of [...os, ...tickets]) {
      const closed = item['concluida_em'] ?? item['encerrado_em'];
      const opened = item['aberta_em'] ?? item['aberto_em'];
      const end = typeof closed === 'string' ? Date.parse(closed) : NaN;
      const start = typeof opened === 'string' ? Date.parse(opened) : NaN;
      if (!Number.isFinite(end) || end > now || now - end > 48 * 3600000) continue;
      const id = typeof item['protocolo'] === 'string' ? item['protocolo'] : String(item['id'] ?? '');
      const elapsed = Number.isFinite(start) && start <= end
        ? `; duração aproximada: ${Math.round((end - start) / 60000)} min` : '';
      evidence.push(`Atendimento ${id || 'recente'} concluído nas últimas 48 horas${elapsed}`);
    }
    return {
      available: true, openOs, recentOs: os, recentTickets: tickets,
      recurrentWithin48h: evidence.length > 0, recurrenceEvidence: evidence.slice(0, 5),
    };
  }
}
