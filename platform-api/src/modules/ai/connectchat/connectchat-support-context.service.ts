import { Injectable, Logger } from '@nestjs/common';
import { ConnectchatConversation } from '../../../shared/integration/connectchat.client';
import { ConnectionsRepository } from '../../integration/connections/connections.repository';
import { ConnectionsService } from '../../integration/connections/connections.service';
import { rows, projectChamado, projectOrdemServico, projectContrato, projectConexao, projectBoleto, limitBoletos } from '../../isp/isp-projections';
import { IncidentLookupService, IncidentInfo } from '../../isp/incident-lookup.service';
import { isValidSubscriberDocument, normalizeSubscriberDocument } from './subscriber-document';
import { scopeVerifiedInvoices } from './billing-response';
import { TechnicalObservation, TechnicalSourceState } from './technical-case-reasoning';
import { analyzeTechnicalHistory, TechnicalHistoryAnalysis } from './technical-history-analysis';

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
  sourceStatus: Record<string, TechnicalSourceState>;
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
  sourceStatus: Record<string, TechnicalSourceState>;
  historyAnalysis: TechnicalHistoryAnalysis;
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
  async triageIdentifiedCustomer(
    connectionId: string,
    customerId: string,
    selected?: { contractRef?: string | null; accessRef?: string | null },
  ): Promise<IdentifiedOperationalSnapshot> {
    const unavailable: IdentifiedOperationalSnapshot = {
      status: 'UNAVAILABLE', hasOpenOs: null, hasOpenTicket: null,
      incident: null, online: null, blocked: null, multipleAccesses: false,
      sourceStatus: {
        openOs: 'UNAVAILABLE', contracts: 'UNAVAILABLE', accesses: 'UNAVAILABLE',
        recentTickets: 'UNAVAILABLE', incidents: 'UNAVAILABLE',
      },
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
        String(c['status'] ?? '').toUpperCase() === 'A'
        && (!selected?.contractRef || String(c['id'] ?? '') === selected.contractRef));
      const blocked = activeContracts.length === 0 ? null
        : activeContracts.some((c) => {
          const state = String(c['status_internet'] ?? '').toUpperCase().trim();
          return !!state && state !== 'A';
        });
      const activeAccess = accesses.map(projectConexao).filter((a) => a['ativo'] === true
        && (!selected?.contractRef || String(a['id_contrato'] ?? '') === selected.contractRef)
        && (!selected?.accessRef || String(a['login'] ?? '').toLowerCase()
          === selected.accessRef.toLowerCase()));
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
        online: activeAccess.length === 1
          ? (() => {
            const raw = accesses.find((row) => String(row['login'] ?? '') === String(activeAccess[0]['login'] ?? ''));
            const status = raw?.['online'];
            if (status === true || /^(S|SIM|ONLINE)$/i.test(String(status ?? '').trim())) return true;
            if (status === false || /^(N|NAO|NÃO|OFFLINE)$/i.test(String(status ?? '').trim())) return false;
            return null;
          })() : null,
        blocked,
        multipleAccesses: activeAccess.length > 1,
        sourceStatus: {
          openOs: 'AVAILABLE', contracts: 'AVAILABLE', accesses: 'AVAILABLE',
          recentTickets: recent === null ? 'UNAVAILABLE' : 'AVAILABLE', incidents: 'AVAILABLE',
        },
      };
    } catch (error) {
      this.logger.warn(`Triagem de cadastro identificado indisponível: ${(error as Error).message}`);
      return unavailable;
    }
  }

  observationFromIdentified(snapshot: IdentifiedOperationalSnapshot): TechnicalObservation {
    return {
      status: snapshot.status,
      online: snapshot.online,
      hasOpenOs: snapshot.hasOpenOs,
      hasOpenTicket: snapshot.hasOpenTicket,
      incident: snapshot.incident !== null,
      blocked: snapshot.blocked,
      multipleAccesses: snapshot.multipleAccesses,
      contractCount: null,
      accessCount: snapshot.multipleAccesses ? 2 : snapshot.online === null ? null : 1,
      sourceStatus: snapshot.sourceStatus,
    };
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

  async byVerifiedConversation(
    conversation: ConnectchatConversation,
    reportedProblem = '',
  ): Promise<VerifiedSupportContext> {
    const emptyHistory = analyzeTechnicalHistory(reportedProblem, [], [], {
      recentOsAvailable: false, recentTicketsAvailable: false,
    });
    const empty: VerifiedSupportContext = {
      available: false, openOs: [], recentOs: [], recentTickets: [], openTickets: [], incidents: [], uncertainTickets: false,
      recurrentWithin48h: false, recurrenceEvidence: [], contracts: [], connections: [], blockedContracts: 0, technology: null, technologyByContract: {},
      sourceStatus: {
        openOs: 'UNAVAILABLE', contracts: 'UNAVAILABLE', accesses: 'UNAVAILABLE',
        incidents: 'UNAVAILABLE', recentOs: 'UNAVAILABLE', recentTickets: 'UNAVAILABLE',
      },
      historyAnalysis: emptyHistory,
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
    const sourceStatus: Record<string, TechnicalSourceState> = { ...empty.sourceStatus };
    try {
      openOs = rows(await this.connections.execute(connectionId, 'os.listar_abertas',
        { id_cliente: customerId })).slice(0, 10).map(projectOrdemServico);
      sourceStatus.openOs = 'AVAILABLE';
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
      sourceStatus.contracts = 'AVAILABLE';
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
      connections = active.slice(0, 8).map((row) => {
        const original = records.find((raw) => String(raw['login'] ?? '') === String(row['login'] ?? ''));
        const onlineRaw = original?.['online'];
        const known = onlineRaw === true || onlineRaw === false
          || /^(S|N|SIM|NAO|NÃO|ONLINE|OFFLINE)$/i.test(String(onlineRaw ?? '').trim());
        return {
          id_contrato: row['id_contrato'], online: known ? row['online'] : null,
          status: row['status'], referencia: row['referencia'], access_ref: row['login'],
          connected_since: row['conectado_desde'] ?? null,
          disconnected_at: row['desconectado_em'] ?? null,
          disconnect_reason: row['motivo_desconexao'] ?? null,
          ip_present: typeof row['ip'] === 'string' && row['ip'].length > 0,
          mac_present: typeof row['mac'] === 'string' && row['mac'].length > 0,
        };
      });
      for (const row of active) {
        const login = typeof row['login'] === 'string' ? row['login'] : '';
        if (login) incidentLogins.push(login);
      }
      sourceStatus.accesses = 'AVAILABLE';
    } catch (error) {
      this.logger.warn(`Consulta de acessos não concluída: ${(error as Error).message}`);
    }

    let incidents: IncidentInfo[] = [];
    try {
      incidents = await this.incidentLookup.activeForMany([...new Set(incidentLogins)].slice(0, 8));
      sourceStatus.incidents = 'AVAILABLE';
    } catch (error) {
      this.logger.warn(`Consulta de incidentes não concluída: ${(error as Error).message}`);
    }

    // Histórico complementar: falha não apaga a evidência de OS em andamento.
    const [osResult, ticketsResult] = await Promise.all([
      this.connections.execute(connectionId, 'os.listar_recentes',
        { id_cliente: customerId }).then(rows).then((value) => ({
          available: true as const, rows: value.slice(0, 5).map(projectOrdemServico),
        })).catch(() => ({ available: false as const, rows: [] as Record<string, unknown>[] })),
      this.connections.execute(connectionId, 'atendimento.listar_chamados_recentes',
        { id_cliente: customerId }).then(rows).then((value) => ({
          available: true as const, rows: value.slice(0, 5).map(projectChamado),
        })).catch(() => ({ available: false as const, rows: [] as Record<string, unknown>[] })),
    ]);
    const os = osResult.rows;
    const tickets = ticketsResult.rows;
    sourceStatus.recentOs = osResult.available ? 'AVAILABLE' : 'UNAVAILABLE';
    sourceStatus.recentTickets = ticketsResult.available ? 'AVAILABLE' : 'UNAVAILABLE';

    // Estados conhecidos do ticket; situações não classificadas exigem revisão
    // humana antes da criação de outro atendimento.
    const openStatuses = new Set(['A', 'ABERTO', 'P', 'PENDENTE', 'EM ANDAMENTO', 'ANDAMENTO']);
    const closedStatuses = new Set(['F', 'FINALIZADO', 'C', 'CANCELADO', 'ENCERRADO', 'FECHADO', 'RESOLVIDO']);
    const openTickets = tickets.filter((t) => openStatuses.has(
      String(t['situacao_interna'] ?? t['status'] ?? '').trim().toUpperCase(),
    ));
    const uncertainTickets = !ticketsResult.available || tickets.some((t) => {
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

    const historyAnalysis = analyzeTechnicalHistory(reportedProblem, os, tickets, {
      recentOsAvailable: osResult.available,
      recentTicketsAvailable: ticketsResult.available,
    });
    return {
      available: true, openOs, recentOs: os, recentTickets: tickets,
      openTickets, uncertainTickets, incidents,
      recurrentWithin48h: historyAnalysis.recurrentWithin48h,
      recurrenceEvidence: historyAnalysis.similarCases.map((item) =>
        `${item.kind}:${item.reference}:${item.similarityReasons.join('|')}`).slice(0, 5),
      contracts, connections, blockedContracts, technology, technologyByContract,
      sourceStatus, historyAnalysis,
    };
  }

  async incidentsForSelectedAccess(accessRef: string): Promise<{
    available: boolean;
    incidents: IncidentInfo[];
  }> {
    if (!accessRef.trim()) return { available: false, incidents: [] };
    try {
      const incident = await this.incidentLookup.activeFor(accessRef);
      return { available: true, incidents: incident ? [incident] : [] };
    } catch (error) {
      this.logger.warn(`Consulta de incidente do acesso selecionado não concluída: ${(error as Error).message}`);
      return { available: false, incidents: [] };
    }
  }

  observationFromVerified(context: VerifiedSupportContext): TechnicalObservation {
    const online = context.connections.length === 1
      ? context.connections[0]?.['online'] === true ? true
        : context.connections[0]?.['online'] === false ? false : null
      : null;
    return {
      status: context.available ? 'READY' : 'UNAVAILABLE',
      online,
      hasOpenOs: context.sourceStatus.openOs === 'AVAILABLE' ? context.openOs.length > 0 : null,
      hasOpenTicket: context.sourceStatus.recentTickets === 'AVAILABLE'
        ? context.openTickets.length > 0 : null,
      incident: context.incidents.length > 0,
      blocked: context.sourceStatus.contracts === 'AVAILABLE'
        ? context.blockedContracts > 0 : null,
      multipleAccesses: context.connections.length > 1,
      contractCount: context.sourceStatus.contracts === 'AVAILABLE' ? context.contracts.length : null,
      accessCount: context.sourceStatus.accesses === 'AVAILABLE' ? context.connections.length : null,
      session: context.connections.length === 1 ? {
        connectedSince: typeof context.connections[0]?.['connected_since'] === 'string'
          ? context.connections[0]['connected_since'] as string : null,
        disconnectedAt: typeof context.connections[0]?.['disconnected_at'] === 'string'
          ? context.connections[0]['disconnected_at'] as string : null,
        disconnectReason: typeof context.connections[0]?.['disconnect_reason'] === 'string'
          ? String(context.connections[0]['disconnect_reason']).slice(0, 180) : null,
      } : null,
      sourceStatus: context.sourceStatus,
    };
  }
}
