import { Injectable, Logger } from '@nestjs/common';
import { ConnectchatConversation } from '../../../shared/integration/connectchat.client';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { rows, projectChamado, projectOrdemServico, projectContrato, projectConexao } from '../../isp/isp-projections';

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
  contracts: Record<string, unknown>[];
  connections: Record<string, unknown>[];
  blockedContracts: number;
  technology: 'FIBRA' | 'RADIO' | null;
}

@Injectable()
export class ConnectchatSupportContextService {
  private readonly logger = new Logger(ConnectchatSupportContextService.name);

  constructor(
    private readonly connections: ConnectionsService,
    private readonly repository: ConnectionsRepository,
  ) {}

  /** Busca CPF somente em cadastro e jamais usa a existência como prova de
   * posse ou autorização de acesso. Não retorna PII ao modelo nem ao chat. */
  async lookupCpf(cpf: string): Promise<{ status: 'FOUND' | 'NOT_FOUND' | 'UNAVAILABLE'; customerId?: string }> {
    const digits = cpf.replace(/\D/g, '');
    if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return { status: 'NOT_FOUND' };
    for (let position = 9; position <= 10; position += 1) {
      const sum = [...digits.slice(0, position)].reduce((total, digit, index) =>
        total + Number(digit) * (position + 1 - index), 0);
      const calculated = (sum * 10) % 11;
      if (Number(digits[position]) !== (calculated === 10 ? 0 : calculated)) return { status: 'NOT_FOUND' };
    }
    const providers = (await this.repository.findAll({ providerKey: 'ixc', status: 'ACTIVE' }))
      .filter((provider) => provider.is_active);
    if (providers.length !== 1) return { status: 'UNAVAILABLE' };
    try {
      const data = rows(await this.connections.execute(providers[0].id, 'cliente.dados', { cpf: digits }));
      if (data.length !== 1 || !/^\d+$/.test(String(data[0]['id'] ?? ''))) {
        return { status: 'NOT_FOUND' };
      }
      return { status: 'FOUND', customerId: String(data[0]['id']) };
    } catch (error) {
      this.logger.warn(`Consulta CPF não concluída: ${(error as Error).message}`);
      return { status: 'UNAVAILABLE' };
    }
  }

  async byVerifiedConversation(conversation: ConnectchatConversation): Promise<VerifiedSupportContext> {
    const empty: VerifiedSupportContext = {
      available: false, openOs: [], recentOs: [], recentTickets: [],
      recurrentWithin48h: false, recurrenceEvidence: [], contracts: [], connections: [], blockedContracts: 0, technology: null,
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

    // O contrato é consultado de forma determinística pelo ID confirmado,
    // sem CPF no prompt e sem delegar seleção de cliente ao modelo.
    // Campo comercial de PLANO não comprova tecnologia física.
    let contracts: Record<string, unknown>[] = [];
    let connections: Record<string, unknown>[] = [];
    let blockedContracts = 0;
    let technology: 'FIBRA' | 'RADIO' | null = null;
    try {
      const records = rows(await this.connections.execute(connectionId, 'ixc.listar', {
        tabela: 'cliente_contrato',
        qtype: 'cliente_contrato.id_cliente', query: customerId, oper: '=',
        rp: '30', sortname: 'cliente_contrato.id',
      }));
      contracts = records.map(projectContrato).filter((row) => String(row['status'] ?? '').toUpperCase() === 'A').slice(0, 8);
      blockedContracts = contracts.filter((contract) => {
        const state = String(contract['status_internet'] ?? '').trim().toUpperCase();
        return !!state && state !== 'A';
      }).length;
      // Somente um campo técnico EXPLÍCITO da fonte IXC é aceito.
      const active = records.filter((row) => String(row['status'] ?? '').toUpperCase() === 'A');
      const declared = active.map((row) => {
        const raw = String(row['tecnologia'] ?? row['tipo_tecnologia'] ?? row['tipo_conexao'] ?? '').trim().toUpperCase();
        if (/^(FIBRA|FIBRA OPTICA|FTTH|GPON)$/.test(raw)) return 'FIBRA';
        if (/^(RADIO|RÁDIO|WIRELESS)$/.test(raw)) return 'RADIO';
        return null;
      });
      if (declared.length === 1 && declared[0]) technology = declared[0];
    } catch (error) {
      this.logger.warn(`Consulta de contratos não concluída: ${(error as Error).message}`);
    }

    // Estado do acesso do cliente, pela mesma conexão IXC confirmada.
    // Nunca usa "conectividade" genérica sem escopo para evitar expor terceiros.
    try {
      const records = rows(await this.connections.execute(connectionId, 'ixc.listar', {
        tabela: 'radusuarios',
        qtype: 'radusuarios.id_cliente', query: customerId, oper: '=',
        rp: '30', sortname: 'radusuarios.id',
      }));
      const active = records.map(projectConexao).filter((row) => row['ativo'] === true);
      connections = active.slice(0, 8).map((row) => ({
        id_contrato: row['id_contrato'], online: row['online'],
        status: row['status'], referencia: row['referencia'],
      }));
    } catch (error) {
      this.logger.warn(`Consulta de acessos não concluída: ${(error as Error).message}`);
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
      contracts, connections, blockedContracts, technology,
    };
  }
}
