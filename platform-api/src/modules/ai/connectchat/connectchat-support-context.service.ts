import { Injectable, Logger } from '@nestjs/common';
import { ConnectchatConversation } from '../../../shared/integration/connectchat.client';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { rows, projectChamado, projectOrdemServico, projectContrato, projectConexao, projectBoleto, limitBoletos } from '../../isp/isp-projections';
import { IncidentLookupService, IncidentInfo } from '../../isp/incident-lookup.service';
import { isValidSubscriberDocument, normalizeSubscriberDocument } from './subscriber-document';
import { scopeVerifiedInvoices } from './billing-response';

/**
 * Triagem operacional interna feita após localizar o cadastro pelo documento.
 * Não devolve nome, endereço, IDs, login, faturas ou registros de chamados ao LLM.
 * Nunca confundir esta leitura com prova de titularidade.
 */
export interface IdentifiedOperationalSnapshot {
  status: 'READY' | 'UNAVAILABLE';
  hasOpenOs: boolean | null;
  hasOpenTicket: boolean | null;
  incident: { publicMessage: string; forecast: string | null; suppressOs: boolean } | null;
  online: boolean | null;
  blocked: boolean | null;
  multipleAccesses: boolean;
}

/** Evidências restritas ao vínculo confirmado da conversa; nunca recebe
 * identificador escolhido pelo LLM ou CPF digitado como prova de titularidade. */
export interface VerifiedSupportContext {
  available: boolean;
  reason?: string;
  openOs: Record<string, unknown>[];
  recentOs: Record<string, unknown>[];
  recentTickets: Record<string, unknown>[];
  openTickets: Record<string, unknown>[];
  incidents: IncidentInfo[];
  uncertainTickets: boolean;
  recurrentWithin48h: boolean;
  recurrenceEvidence: string[];
  contracts: Record<string, unknown>[];
  connections: Record<string, unknown>[];
  blockedContracts: number;
  technology: 'FIBRA' | 'RADIO' | null;
  technologyByContract: Record<string, 'FIBRA' | 'RADIO'>;
}

@Injectable()
export class ConnectchatSupportContextService {
  private readonly logger = new Logger(ConnectchatSupportContextService.name);

  constructor(
    private readonly connections: ConnectionsService,
    private readonly repository: ConnectionsRepository,
    private readonly incidentLookup: IncidentLookupService,
  ) {}

  /** Leitura operacional do registro localizado. Não autentica quem digitou o CPF. */
  async triageIdentifiedCustomer(connectionId: string, customerId: string): Promise<IdentifiedOperationalSnapshot> {
    const unavailable: IdentifiedOperationalSnapshot = {
      status: 'UNAVAILABLE', hasOpenOs: null, hasOpenTicket: null,
      incident: null, online: null, blocked: null, multipleAccesses: false,
    };
    if (!/^[0-9a-f-]{36}$/i.test(connectionId) || !/^[1-9]\d*$/.test(customerId)) return unavailable;
    const provider = await this.repository.findById(connectionId);
    if (!provider || provider.provider_key !== 'ixc' || provider.status !== 'ACTIVE' || !provider.is_active) return unavailable;
    try {
      // Falha ao ler OS é bloqueante: nunca concluir "não há OS" por ausência de dados.
      const openOs = rows(await this.connections.execute(connectionId, 'os.listar_abertas', {
        id_cliente: customerId,
      }));
      const [contracts, accesses, recent] = await Promise.all([
        this.connections.execute(connectionId, 'ixc.listar', {
          tabela: 'cliente_contrato', qtype: 'cliente_contrato.id_cliente',
          query: customerId, oper: '=', rp: '30', sortname: 'cliente_contrato.id',
        }).then(rows),
        this.connections.execute(connectionId, 'ixc.listar', {
          tabela: 'radusuarios', qtype: 'radusuarios.id_cliente',
          query: customerId, oper: '=', rp: '30', sortname: 'radusuarios.id',
        }).then(rows),
        this.connections.execute(connectionId, 'atendimento.listar_chamados_recentes', {
          id_cliente: customerId,
        }).then(rows).catch(() => null),
      ]);
      const activeContracts = contracts.map(projectContrato).filter((c) =>
        String(c['status'] ?? '').toUpperCase() === 'A');
      const blocked = activeContracts.length === 0 ? null
        : activeContracts.some((c) => {
          const state = String(c['status_internet'] ?? '').toUpperCase().trim();
          return !!state && state !== 'A';
        });
      const activeAccess = accesses.map(projectConexao).filter((a) => a['ativo'] === true);
      const logins = activeAccess.map((a) => String(a['login'] ?? '')).filter(Boolean);
      const incidents = await this.incidentLookup.activeForMany(logins.slice(0, 8));
      const outage = incidents.find((i) => i.suppress_os) ?? incidents[0];
      const opened = new Set(['A', 'ABERTO', 'P', 'PENDENTE', 'EM ANDAMENTO', 'ANDAMENTO']);
      const hasOpenTicket = recent === null ? null : recent.map(projectChamado)
        .some((t) => opened.has(String(t['situacao_interna'] ?? t['status'] ?? '').toUpperCase().trim()));
      return {
        status: 'READY',
        hasOpenOs: openOs.length > 0,
        hasOpenTicket,
        incident: outage ? {
          publicMessage: String(outage.message || outage.title || 'Ocorrência técnica registrada').slice(0, 250),
          forecast: outage.inform_forecast ? String(outage.forecast || '').slice(0, 90) || null : null,
          suppressOs: outage.suppress_os,
        } : null,
        online: activeAccess.length === 1 ? activeAccess[0]['online'] === true : null,
        blocked,
        multipleAccesses: activeAccess.length > 1,
      };
    } catch (error) {
      this.logger.warn(`Triagem de cadastro identificado indisponível: ${(error as Error).message}`);
      return unavailable;
    }
  }

  /** Busca CPF somente em cadastro e jamais usa a existência como prova de
   * posse ou autorização de acesso. Não retorna PII ao modelo nem ao chat. */
  /** CPF e CNPJ (somente dígitos para a consulta IXC). */
  async lookupDocument(document: string): Promise<{ status: 'FOUND' | 'NOT_FOUND' | 'UNAVAILABLE'; customerId?: string; connectionId?: string }> {
    const digits = normalizeSubscriberDocument(document);
    if (!isValidSubscriberDocument(digits)) return { status: 'NOT_FOUND' };
    const providers = (await this.repository.findAll({ providerKey: 'ixc', status: 'ACTIVE' }))
      .filter((provider) => provider.is_active);
    if (providers.length !== 1) return { status: 'UNAVAILABLE' };
    try {
      const data = rows(await this.connections.execute(providers[0].id, 'cliente.dados', { cpf: digits }));
      if (data.length !== 1 || !/^\d+$/.test(String(data[0]['id'] ?? ''))) {
        return { status: 'NOT_FOUND' };
      }
      return { status: 'FOUND', customerId: String(data[0]['id']), connectionId: providers[0].id };
    } catch (error) {
      this.logger.warn(`Consulta CPF/CNPJ não concluída: ${(error as Error).message}`);
      return { status: 'UNAVAILABLE' };
    }
  }

  /**
   * Consulta FINANCEIRA de leitura, sempre pelo ID de cliente do vínculo
   * ACTIVE/CUSTOMER emitido pelo ConnectChat. Nenhum CPF informado ao modelo
   * é aceito como seletor, e nenhuma ferramenta de escrita é disponibilizada.
   */
  async billingForVerifiedConversation(conversation: ConnectchatConversation): Promise<{
    available: boolean;
    invoices: Record<string, unknown>[];
    total: number;
  }> {
    if (conversation.businessContact?.status !== 'CUSTOMER'
      || conversation.businessContact.linkStatus !== 'ACTIVE') {
      return { available: false, invoices: [], total: 0 };
    }
    const match = /^ixc:([0-9a-f-]{36}):([1-9]\d*)$/i.exec(conversation.customerRef ?? '');
    if (!match) return { available: false, invoices: [], total: 0 };
    const [, connectionId, customerId] = match;
    const provider = await this.repository.findById(connectionId);
    if (!provider || provider.provider_key !== 'ixc'
      || provider.status !== 'ACTIVE' || !provider.is_active) {
      return { available: false, invoices: [], total: 0 };
    }
    try {
      const records = rows(await this.connections.execute(connectionId, 'ixc.listar', {
        tabela: 'fn_areceber',
        rp: '50',
        sortname: 'fn_areceber.data_vencimento',
        grid_param: [
          { TB: 'fn_areceber.id_cliente', OP: '=', P: customerId },
          { TB: 'fn_areceber.liberado', OP: '=', P: 'S' },
          { TB: 'fn_areceber.status', OP: '!=', P: 'C' },
          { TB: 'fn_areceber.status', OP: '!=', P: 'R' },
        ],
      }));
      const scoped = scopeVerifiedInvoices(records, customerId);
      if (!scoped) {
        this.logger.error('IXC devolveu títulos fora do escopo do cliente; resposta financeira bloqueada.');
        return { available: false, invoices: [], total: 0 };
      }
      const safe = scoped.map((item) => projectBoleto(item));
      return { available: true, invoices: limitBoletos(safe, 5), total: safe.length };
    } catch (error) {
      this.logger.warn(`Consulta financeira do vínculo não concluída: ${(error as Error).message}`);
      return { available: false, invoices: [], total: 0 };
    }
  }

  async byVerifiedConversation(conversation: ConnectchatConversation): Promise<VerifiedSupportContext> {
    const empty: VerifiedSupportContext = {
      available: false, openOs: [], recentOs: [], recentTickets: [], openTickets: [], incidents: [], uncertainTickets: false,
      recurrentWithin48h: false, recurrenceEvidence: [], contracts: [], connections: [], blockedContracts: 0, technology: null, technologyByContract: {},
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
    const incidentLogins: string[] = [];
    let blockedContracts = 0;
    let technology: 'FIBRA' | 'RADIO' | null = null;
    const technologyByContract: Record<string, 'FIBRA' | 'RADIO'> = {};
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
        const known: 'FIBRA' | 'RADIO' | null = /^(FIBRA|FIBRA OPTICA|FTTH|GPON)$/.test(raw) ? 'FIBRA'
          : /^(RADIO|RÁDIO|WIRELESS)$/.test(raw) ? 'RADIO' : null;
        if (known && /^[1-9]\d*$/.test(String(row['id'] ?? ''))) {
          technologyByContract[String(row['id'])] = known;
        }
        return known;
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
      for (const row of active) {
        const login = typeof row['login'] === 'string' ? row['login'] : '';
        if (login) incidentLogins.push(login);
      }
    } catch (error) {
      this.logger.warn(`Consulta de acessos não concluída: ${(error as Error).message}`);
    }

    let incidents: IncidentInfo[] = [];
    try {
      incidents = await this.incidentLookup.activeForMany([...new Set(incidentLogins)].slice(0, 8));
    } catch (error) {
      this.logger.warn(`Consulta de incidentes não concluída: ${(error as Error).message}`);
    }

    // Histórico complementar: falha não apaga a evidência de OS em andamento.
    const [os, tickets] = await Promise.all([
      this.connections.execute(connectionId, 'os.listar_recentes',
        { id_cliente: customerId }).then(rows).then((v) => v.slice(0, 5).map(projectOrdemServico)).catch(() => []),
      this.connections.execute(connectionId, 'atendimento.listar_chamados_recentes',
        { id_cliente: customerId }).then(rows).then((v) => v.slice(0, 5).map(projectChamado)).catch(() => []),
    ]);

    // Estados conhecidos do ticket; situações não classificadas exigem revisão
    // humana antes da criação de outro atendimento.
    const openStatuses = new Set(['A', 'ABERTO', 'P', 'PENDENTE', 'EM ANDAMENTO', 'ANDAMENTO']);
    const closedStatuses = new Set(['F', 'FINALIZADO', 'C', 'CANCELADO', 'ENCERRADO', 'FECHADO', 'RESOLVIDO']);
    const openTickets = tickets.filter((t) => openStatuses.has(
      String(t['situacao_interna'] ?? t['status'] ?? '').trim().toUpperCase(),
    ));
    const uncertainTickets = tickets.some((t) => {
      const value = String(t['situacao_interna'] ?? t['status'] ?? '').trim().toUpperCase();
      const closed = t['encerrado_em'];
      if (closed && Number.isFinite(Date.parse(String(closed)))) return false;
      const opened = Date.parse(String(t['aberto_em'] ?? ''));
      const recent = Number.isFinite(opened) && opened <= Date.now()
        && Date.now() - opened <= 48 * 3600000;
      // Situação desconhecida só impede novo chamado se o registro pode
      // estar realmente ativo; não bloquear diagnósticos por ticket antigo.
      return recent && !openStatuses.has(value) && !closedStatuses.has(value);
    });

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
      openTickets, uncertainTickets, incidents,
      recurrentWithin48h: evidence.length > 0, recurrenceEvidence: evidence.slice(0, 5),
      contracts, connections, blockedContracts, technology, technologyByContract,
    };
  }
}
