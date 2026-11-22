import { createHash, randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  AiDiagnosticExperimentKind,
  AiDiagnosticExperimentStatus,
  AiDiagnosticHypothesisState,
  AiTechnicalActionStatus,
  AiTechnicalCaseStatus,
  AiTechnicalEvidenceStatus,
  Prisma,
} from '@prisma/client';
import { ConnectchatInboxService } from '../../comm/connectchat/connectchat-inbox.service';
import { redactSubscriberDocuments } from './subscriber-document';
import { ConnectchatSupportContextService } from './connectchat-support-context.service';
import { TechnicalHistoryAnalysis } from './technical-history-analysis';
import {
  ActiveDiagnosticExperiment,
  decideTechnicalTurn,
  TechnicalDecision,
  TechnicalObservation,
} from './technical-case-reasoning';
import { TechnicalCaseRepository } from './technical-case.repository';
import {
  decideTechnicalScopeTransition,
  restoreTechnicalObservationScope,
} from './technical-case-governance';

export interface HandleTechnicalTurnInput {
  conversationId: string;
  customerScopeRef: string;
  connectionId: string;
  customerId: string;
  authenticatedScope: boolean;
  reportedProblem: string;
  currentMessage: string;
  recentCustomerMessages: string[];
  customerSequence: string;
  observation: TechnicalObservation;
  selectedContractRef?: string | null;
  selectedAccessRef?: string | null;
}

export interface RecordVerifiedInvestigationInput {
  conversationId: string;
  customerScopeRef: string;
  connectionId: string;
  customerId: string;
  reportedProblem: string;
  customerSequence: string;
  sourceStatus: Record<string, string>;
  openOs: Record<string, unknown>[];
  recentOs: Record<string, unknown>[];
  recentTickets: Record<string, unknown>[];
  incidents: Array<Record<string, unknown>>;
  contracts: Record<string, unknown>[];
  connections: Record<string, unknown>[];
  blockedContracts: number;
  historyAnalysis: TechnicalHistoryAnalysis;
  selectedContractRef?: string | null;
  selectedAccessRef?: string | null;
}

@Injectable()
export class TechnicalCaseService {
  private readonly logger = new Logger(TechnicalCaseService.name);
  private observing = false;

  constructor(
    private readonly repository: TechnicalCaseRepository,
    private readonly support: ConnectchatSupportContextService,
    private readonly inbox: ConnectchatInboxService,
  ) {}

  async cancelConversation(conversationId: string, reason: string): Promise<void> {
    const technicalCase = await this.repository.findActiveCase(conversationId);
    if (technicalCase) await this.repository.cancelCase(technicalCase.id, reason);
  }

  async handleTurn(input: HandleTechnicalTurnInput): Promise<TechnicalDecision | null> {
    const technicalCase = await this.ensureCase({
      conversationId: input.conversationId,
      customerScopeRef: input.customerScopeRef,
      connectionId: input.connectionId,
      customerId: input.customerId,
      authenticatedScope: input.authenticatedScope,
      reportedProblem: input.reportedProblem || input.currentMessage,
      customerSequence: input.customerSequence,
      selectedContractRef: input.selectedContractRef,
      selectedAccessRef: input.selectedAccessRef,
    });

    await this.recordObservation(technicalCase.id, input.customerSequence, input.observation);
    const experiment = await this.repository.findActiveExperiment(technicalCase.id);
    const decision = decideTechnicalTurn({
      currentMessage: input.currentMessage,
      recentCustomerMessages: input.recentCustomerMessages,
      observation: input.observation,
      activeExperiment: experiment ? this.experimentForReasoning(experiment) : null,
    });
    if (!decision) return null;

    await this.applyDecision(technicalCase.id, experiment, input, decision);
    return decision;
  }

  async recordVerifiedInvestigation(input: RecordVerifiedInvestigationInput): Promise<string> {
    const technicalCase = await this.ensureCase({
      conversationId: input.conversationId,
      customerScopeRef: input.customerScopeRef,
      connectionId: input.connectionId,
      customerId: input.customerId,
      authenticatedScope: true,
      reportedProblem: input.reportedProblem,
      customerSequence: input.customerSequence,
    });
    const observedAt = new Date();
    const sourceState = (key: string) => input.sourceStatus[key] === 'AVAILABLE'
      ? AiTechnicalEvidenceStatus.OBSERVED : AiTechnicalEvidenceStatus.UNAVAILABLE;
    const sourceEvidence: Array<{
      key: string; kind: string; source: string; payload: unknown;
    }> = [
      {
        key: 'open-os', kind: 'OPEN_SERVICE_ORDERS', source: 'IXC_OS',
        payload: input.openOs.map((item) => ({
          reference: item['protocolo'] ?? item['id'] ?? null,
          status: item['status'] ?? null,
        })),
      },
      {
        key: 'recent-os', kind: 'SERVICE_ORDER_HISTORY', source: 'IXC_OS',
        payload: input.historyAnalysis.similarCases.filter((item) => item.kind === 'SERVICE_ORDER'),
      },
      {
        key: 'recent-tickets', kind: 'SUPPORT_HISTORY', source: 'IXC_TICKETS',
        payload: input.historyAnalysis,
      },
      {
        key: 'contracts', kind: 'ACTIVE_CONTRACTS', source: 'IXC_CONTRACTS',
        payload: input.contracts.map((item) => ({
          reference: item['id'] ?? null,
          state: item['status'] ?? null,
          internetState: item['status_internet'] ?? null,
        })),
      },
      {
        key: 'accesses', kind: 'ACTIVE_ACCESSES', source: 'IXC_ACCESSES',
        payload: input.connections.map((item) => ({
          contractRef: item['id_contrato'] ?? null,
          online: item['online'] ?? null,
          state: item['status'] ?? null,
          reference: item['referencia'] ?? null,
          accessScopeKey: typeof item['access_ref'] === 'string'
            ? this.scopeKey(`access:${item['access_ref']}`) : null,
        })),
      },
      {
        key: 'incidents', kind: 'ACTIVE_INCIDENTS', source: 'IA_STUDIO_INCIDENTS',
        payload: input.incidents.map((item) => ({
          reference: item['incident_id'] ?? null,
          suppressOs: item['suppress_os'] === true,
          forecastAllowed: item['inform_forecast'] === true,
        })),
      },
    ];
    const sourceKey: Record<string, string> = {
      'open-os': 'openOs', 'recent-os': 'recentOs', 'recent-tickets': 'recentTickets',
      contracts: 'contracts', accesses: 'accesses', incidents: 'incidents',
    };
    await Promise.all(sourceEvidence.map((item) => this.repository.upsertEvidence({
      case_id: technicalCase.id,
      correlation_key: `investigation:${item.key}:${input.customerSequence}`,
      kind: item.kind,
      source: item.source,
      status: sourceState(sourceKey[item.key]),
      confidence: sourceState(sourceKey[item.key]) === AiTechnicalEvidenceStatus.OBSERVED ? 'HIGH' : 'LOW',
      payload: this.safeJson(item.payload),
      error: sourceState(sourceKey[item.key]) === AiTechnicalEvidenceStatus.UNAVAILABLE
        ? 'Fonte indisponível; ausência de registro não foi inferida.' : undefined,
      observed_at: observedAt,
      expires_at: new Date(observedAt.getTime() + 2 * 60 * 1000),
    })));

    const hypothesisWrites: Array<Promise<unknown>> = [];
    if (input.blockedContracts > 0) {
      hypothesisWrites.push(this.repository.upsertHypothesis({
        case_id: technicalCase.id,
        code: 'ADMINISTRATIVE_RESTRICTION',
        label: 'Restrição administrativa pertinente ao acesso',
        state: AiDiagnosticHypothesisState.SUPPORTED,
        rationale: 'O IXC registrou estado de internet diferente de ativo em contrato vigente.',
      }));
    }
    if (input.incidents.length > 0) {
      hypothesisWrites.push(this.repository.upsertHypothesis({
        case_id: technicalCase.id,
        code: 'NETWORK_INCIDENT',
        label: 'Incidente de rede aplicável ao acesso',
        state: AiDiagnosticHypothesisState.SUPPORTED,
        rationale: 'Há incidente ativo correlacionado a um dos acessos consultados.',
      }));
    }
    if (input.historyAnalysis.recurrent) {
      hypothesisWrites.push(this.repository.upsertHypothesis({
        case_id: technicalCase.id,
        code: 'RECURRENT_FAILURE',
        label: 'Possível reincidência do mesmo sintoma',
        state: AiDiagnosticHypothesisState.SUPPORTED,
        rationale: `Há ${input.historyAnalysis.similarCases.length} registro(s) recente(s) com categoria ou termos técnicos correlacionados.`,
      }));
    }
    await Promise.all(hypothesisWrites);
    await this.repository.updateCase(technicalCase.id, {
      problem_category: input.historyAnalysis.currentCategories.join(','),
      selected_contract_ref: input.selectedContractRef ?? undefined,
      selected_access_ref: input.selectedAccessRef ?? undefined,
      last_observed_at: observedAt,
      last_activity_at: observedAt,
    });
    return technicalCase.id;
  }

  async recordGovernedAction(
    conversationId: string,
    actionType: string,
    caseStatus: AiTechnicalCaseStatus,
    nextAction: string | null,
    details: Record<string, unknown>,
  ): Promise<void> {
    const technicalCase = await this.repository.findActiveCase(conversationId);
    if (!technicalCase) return;
    await this.repository.updateCase(technicalCase.id, {
      status: caseStatus,
      next_recommended_action: nextAction,
      pending_question: typeof details['pendingQuestion'] === 'string'
        ? details['pendingQuestion'] : null,
      last_activity_at: new Date(),
    });
    await this.repository.createAction({
      case_id: technicalCase.id,
      action_type: actionType,
      status: caseStatus === AiTechnicalCaseStatus.RESOLVED
        ? AiTechnicalActionStatus.COMPLETED : AiTechnicalActionStatus.RECOMMENDED,
      rationale: nextAction,
      trace_id: randomUUID(),
      details: this.safeJson(details),
      requested_at: new Date(),
    });
  }

  async interruptForTopicChange(conversationId: string, topic: string): Promise<void> {
    const technicalCase = await this.repository.findActiveCase(conversationId);
    if (!technicalCase) return;
    const experiment = await this.repository.findActiveExperiment(technicalCase.id);
    if (experiment) {
      await this.repository.updateExperiment(experiment.id, {
        status: AiDiagnosticExperimentStatus.CANCELLED,
        completed_at: new Date(),
        result: `Experimento interrompido porque o cliente mudou de assunto: ${topic}.`,
      });
    }
    await this.repository.updateCase(technicalCase.id, {
      status: AiTechnicalCaseStatus.INVESTIGATING,
      next_recommended_action: 'Retomar o diagnóstico técnico quando o cliente voltar ao assunto.',
      pending_question: null,
      last_activity_at: new Date(),
    });
  }

  async recordChannelClosure(
    conversationId: string,
    success: boolean,
    error?: string,
  ): Promise<void> {
    const technicalCase = await this.repository.findLatestCase(conversationId);
    if (!technicalCase) return;
    await this.repository.updateCase(technicalCase.id, {
      channel_closed_at: success ? new Date() : null,
      channel_close_error: success ? null : (error || 'Fechamento do canal não confirmado.').slice(0, 500),
    });
    await this.repository.createAction({
      case_id: technicalCase.id,
      action_type: 'CLOSE_CONNECTCHAT_CONVERSATION',
      status: success ? AiTechnicalActionStatus.COMPLETED : AiTechnicalActionStatus.FAILED,
      rationale: success
        ? 'Caso resolvido com confirmação do cliente; conversa remota encerrada.'
        : 'Caso técnico resolvido, mas fechamento remoto não confirmado.',
      trace_id: randomUUID(),
      error: success ? null : (error || 'Fechamento não confirmado.').slice(0, 500),
      requested_at: new Date(),
      completed_at: new Date(),
    });
  }

  private async ensureCase(input: {
    conversationId: string;
    customerScopeRef: string;
    connectionId: string;
    customerId: string;
    authenticatedScope: boolean;
    reportedProblem: string;
    customerSequence: string;
    selectedContractRef?: string | null;
    selectedAccessRef?: string | null;
  }) {
    const scopeKey = this.scopeKey(input.customerScopeRef);
    let technicalCase = await this.repository.findActiveCase(input.conversationId);
    if (technicalCase && decideTechnicalScopeTransition(
      technicalCase.customer_scope_key, scopeKey) === 'CANCEL_AND_REOPEN') {
      await this.repository.cancelCase(technicalCase.id, 'O cadastro atendido na conversa foi alterado.');
      technicalCase = null;
    }
    if (!technicalCase) {
      return this.repository.createCase({
        conversation_id: input.conversationId,
        customer_scope_key: scopeKey,
        connection_id: input.connectionId,
        customer_id: input.customerId,
        authenticated_scope: input.authenticatedScope,
        reported_problem: redactSubscriberDocuments(input.reportedProblem).slice(0, 1000),
        status: AiTechnicalCaseStatus.INVESTIGATING,
        last_customer_sequence: input.customerSequence,
        last_activity_at: new Date(),
        selected_contract_ref: input.selectedContractRef ?? undefined,
        selected_access_ref: input.selectedAccessRef
          ? this.scopeKey(`access:${input.selectedAccessRef}`) : undefined,
      });
    }
    return this.repository.updateCase(technicalCase.id, {
      authenticated_scope: technicalCase.authenticated_scope || input.authenticatedScope,
      connection_id: input.connectionId,
      customer_id: input.customerId,
      last_customer_sequence: input.customerSequence,
      last_activity_at: new Date(),
      selected_contract_ref: input.selectedContractRef ?? undefined,
      selected_access_ref: input.selectedAccessRef
        ? this.scopeKey(`access:${input.selectedAccessRef}`) : undefined,
    });
  }

  private safeJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(redactSubscriberDocuments(JSON.stringify(value))) as Prisma.InputJsonValue;
  }

  private async applyDecision(
    caseId: string,
    experiment: Awaited<ReturnType<TechnicalCaseRepository['findActiveExperiment']>>,
    input: HandleTechnicalTurnInput,
    decision: TechnicalDecision,
  ): Promise<void> {
    let experimentId = experiment?.id;
    if (decision.kind === 'REQUEST_POWER_OFF') {
      await this.recordCustomerEvidence(caseId, input.customerSequence, {
        symptom: 'NO_NAVIGATION_MULTIPLE_DEVICES',
        statement: redactSubscriberDocuments(input.currentMessage).slice(0, 300),
      });
      await Promise.all([
        this.repository.upsertHypothesis({
          case_id: caseId,
          code: 'ISOLATED_DEVICE_FAILURE',
          label: 'Falha isolada em um aparelho',
          state: AiDiagnosticHypothesisState.CONTRADICTED,
          rationale: 'O cliente relatou falha em vários aparelhos.',
        }),
        this.repository.upsertHypothesis({
          case_id: caseId,
          code: 'SHARED_LOCAL_NETWORK_FAILURE',
          label: 'Falha no equipamento ou na rede compartilhada',
          state: AiDiagnosticHypothesisState.SUPPORTED,
          rationale: 'Vários aparelhos falham enquanto a sessão registrada permanece online.',
        }),
        this.repository.upsertHypothesis({
          case_id: caseId,
          code: 'SESSION_WITHOUT_NAVIGATION',
          label: 'Sessão lógica ativa sem navegação funcional',
          state: AiDiagnosticHypothesisState.POSSIBLE,
          rationale: 'O estado online do IXC não comprova navegação.',
        }),
      ]);
      const created = await this.repository.createExperiment({
        case_id: caseId,
        kind: AiDiagnosticExperimentKind.ROUTER_RESTART,
        status: AiDiagnosticExperimentStatus.WAITING_CUSTOMER_OFF,
        target_kind: 'CUSTOMER_IDENTIFIED_ROUTER',
        target_ref: input.selectedAccessRef ?? undefined,
        baseline_online: input.observation.online,
        expires_at: new Date(Date.now() + 20 * 60 * 1000),
        last_customer_sequence: input.customerSequence,
      });
      experimentId = created.id;
    } else if (experiment) {
      if (decision.kind === 'OBSERVE_POWER_OFF') {
        await this.repository.updateExperiment(experiment.id, {
          status: AiDiagnosticExperimentStatus.WAITING_CUSTOMER_ON,
          customer_confirmed_at: new Date(),
          last_observed_online: input.observation.online,
          observation_attempts: { increment: 1 },
          last_customer_sequence: input.customerSequence,
          result: input.observation.online === false
            ? 'A sessão ficou offline após o desligamento informado.'
            : input.observation.online === true
              ? 'A sessão permaneceu online após o desligamento informado.'
              : 'A leitura após o desligamento ficou indisponível.',
        });
        await this.updateRestartHypotheses(caseId, input.observation.online);
      } else if (decision.kind === 'WAIT_POWER_ON_TELEMETRY') {
        await this.repository.updateExperiment(experiment.id, {
          status: AiDiagnosticExperimentStatus.WAITING_TELEMETRY_ON,
          customer_confirmed_at: new Date(),
          observe_after: new Date(Date.now() + 20_000),
          last_customer_sequence: input.customerSequence,
        });
      } else if (decision.kind === 'RESOLVE_CASE') {
        await this.repository.updateExperiment(experiment.id, {
          status: AiDiagnosticExperimentStatus.COMPLETED,
          completed_at: new Date(),
          result: 'Cliente confirmou que a navegação voltou.',
        });
      } else if (decision.kind === 'ESCALATE_CASE') {
        await this.repository.updateExperiment(experiment.id, {
          status: AiDiagnosticExperimentStatus.COMPLETED,
          completed_at: new Date(),
          result: 'Sessão retornou, mas o cliente confirmou ausência de navegação.',
        });
      } else if (decision.kind === 'EXPERIMENT_TIMED_OUT') {
        await this.repository.updateExperiment(experiment.id, {
          status: AiDiagnosticExperimentStatus.TIMED_OUT,
          completed_at: new Date(),
          result: 'O teste expirou sem confirmação suficiente do cliente.',
        });
      }
    }

    await this.repository.updateCase(caseId, {
      status: decision.caseStatus as AiTechnicalCaseStatus,
      next_recommended_action: decision.nextAction,
      last_customer_sequence: input.customerSequence,
      resolved_at: decision.kind === 'RESOLVE_CASE' ? new Date() : undefined,
      resolution_summary: decision.kind === 'RESOLVE_CASE'
        ? 'Navegação restabelecida após reinicialização assistida e confirmação do cliente.'
        : decision.kind === 'ESCALATE_CASE'
          ? 'Reinicialização assistida concluída sem restabelecer a navegação.' : undefined,
    });
    await this.repository.createAction({
      case_id: caseId,
      experiment_id: experimentId,
      action_type: decision.kind,
      status: decision.kind === 'RESOLVE_CASE' ? AiTechnicalActionStatus.COMPLETED
        : decision.kind === 'ESCALATE_CASE' ? AiTechnicalActionStatus.FAILED
          : AiTechnicalActionStatus.REQUESTED,
      rationale: decision.nextAction,
      trace_id: randomUUID(),
      sequence: input.customerSequence,
      details: decision.facts as Prisma.InputJsonValue,
      requested_at: new Date(),
      completed_at: ['RESOLVE_CASE', 'ESCALATE_CASE'].includes(decision.kind) ? new Date() : undefined,
    });
  }

  private async recordObservation(caseId: string, sequence: string, observation: TechnicalObservation): Promise<void> {
    const observedAt = new Date();
    await this.repository.upsertEvidence({
      case_id: caseId,
      correlation_key: `operational:${sequence}`,
      kind: 'OPERATIONAL_SNAPSHOT',
      source: 'IXC_AND_LOCAL_INCIDENTS',
      status: observation.status === 'READY'
        ? AiTechnicalEvidenceStatus.OBSERVED : AiTechnicalEvidenceStatus.UNAVAILABLE,
      confidence: observation.status === 'READY' ? 'HIGH' : 'LOW',
      payload: {
        online: observation.online,
        hasOpenOs: observation.hasOpenOs,
        hasOpenTicket: observation.hasOpenTicket,
        incident: observation.incident,
        blocked: observation.blocked,
        multipleAccesses: observation.multipleAccesses,
        contractCount: observation.contractCount,
        accessCount: observation.accessCount,
      },
      error: observation.status === 'UNAVAILABLE' ? 'Uma ou mais fontes operacionais não responderam.' : undefined,
      observed_at: observedAt,
      expires_at: new Date(observedAt.getTime() + 2 * 60 * 1000),
    });
    await Promise.all(Object.entries(observation.sourceStatus).map(([source, state]) =>
      this.repository.upsertEvidence({
        case_id: caseId,
        correlation_key: `source:${source}:${sequence}`,
        kind: 'SOURCE_AVAILABILITY',
        source,
        status: state === 'UNAVAILABLE'
          ? AiTechnicalEvidenceStatus.UNAVAILABLE : AiTechnicalEvidenceStatus.OBSERVED,
        confidence: state === 'UNAVAILABLE' ? 'LOW' : 'HIGH',
        payload: { state },
        error: state === 'UNAVAILABLE' ? 'Consulta não concluída; ausência de registros não foi inferida.' : undefined,
        observed_at: observedAt,
      })));
  }

  private recordCustomerEvidence(caseId: string, sequence: string, payload: Record<string, unknown>) {
    return this.repository.upsertEvidence({
      case_id: caseId,
      correlation_key: `customer:${sequence}`,
      kind: 'CUSTOMER_REPORTED_SYMPTOM',
      source: 'CONNECTCHAT_CUSTOMER',
      status: AiTechnicalEvidenceStatus.OBSERVED,
      confidence: 'REPORTED',
      payload: payload as Prisma.InputJsonValue,
      observed_at: new Date(),
    });
  }

  private async updateRestartHypotheses(caseId: string, online: boolean | null): Promise<void> {
    if (online === false) {
      await this.repository.upsertHypothesis({
        case_id: caseId,
        code: 'TARGET_AFFECTS_SESSION',
        label: 'O equipamento desligado participa do caminho da sessão',
        state: AiDiagnosticHypothesisState.SUPPORTED,
        rationale: 'A sessão ficou offline após a ação confirmada pelo cliente.',
      });
      return;
    }
    await this.repository.upsertHypothesis({
      case_id: caseId,
      code: 'TARGET_AFFECTS_SESSION',
      label: 'O equipamento desligado participa do caminho da sessão',
      state: online === true
        ? AiDiagnosticHypothesisState.CONTRADICTED : AiDiagnosticHypothesisState.INCONCLUSIVE,
      rationale: online === true
        ? 'A sessão permaneceu online; roteador e equipamento de autenticação podem ser distintos, ou a leitura pode estar atrasada.'
        : 'A fonte operacional não respondeu após o desligamento.',
    });
  }

  private experimentForReasoning(experiment: {
    id: string;
    status: AiDiagnosticExperimentStatus;
    baseline_online: boolean | null;
    expires_at: Date;
  }): ActiveDiagnosticExperiment {
    return {
      id: experiment.id,
      status: experiment.status as ActiveDiagnosticExperiment['status'],
      baselineOnline: experiment.baseline_online,
      expiresAt: experiment.expires_at,
    };
  }

  private scopeKey(customerScopeRef: string): string {
    return createHash('sha256').update(customerScopeRef.toLowerCase()).digest('hex');
  }

  @Interval(15_000)
  async observeDueExperiments(): Promise<void> {
    if (this.observing) return;
    this.observing = true;
    try {
      const expired = await this.repository.findExpiredExperiments(new Date());
      for (const experiment of expired) {
        const claimToken = randomUUID();
        try {
          if (!await this.repository.claimExpiry(experiment.id, claimToken, new Date())) continue;
          const transitioned = await this.repository.updateClaimedTelemetry(
            experiment.id, claimToken, experiment.status, {
              status: AiDiagnosticExperimentStatus.TIMED_OUT,
              completed_at: new Date(),
              result: 'O cliente ou a telemetria não concluíram o experimento dentro do prazo.',
            });
          if (!transitioned) continue;
          await this.repository.updateCaseIfStatus(
            experiment.technical_case.id, experiment.technical_case.status, {
              status: AiTechnicalCaseStatus.INVESTIGATING,
              next_recommended_action: 'Retomar do estado atual sem considerar o silêncio como resolução.',
              pending_question: null,
              last_activity_at: new Date(),
            });
          await this.repository.createAction({
            case_id: experiment.technical_case.id,
            experiment_id: experiment.id,
            action_type: 'EXPERIMENT_TIMED_OUT',
            status: AiTechnicalActionStatus.CANCELLED,
            rationale: 'Silêncio ou telemetria insuficiente não resolvem o caso.',
            trace_id: randomUUID(),
            requested_at: new Date(),
            completed_at: new Date(),
          });
        } catch (error) {
          this.logger.warn(`Expiração ${experiment.id}: ${(error as Error).message}`);
        } finally {
          await this.repository.releaseTelemetry(experiment.id, claimToken).catch(() => undefined);
        }
      }
      const due = await this.repository.findDueTelemetry(new Date());
      for (const experiment of due) {
        const claimToken = randomUUID();
        try {
          if (!await this.repository.claimTelemetry(experiment.id, claimToken, new Date())) continue;
          await this.observeExperiment(experiment, claimToken);
        } catch (error) {
          this.logger.warn(`Experimento ${experiment.id}: ${(error as Error).message}`);
        } finally {
          await this.repository.releaseTelemetry(experiment.id, claimToken).catch((error: unknown) => {
            this.logger.warn(`Experimento ${experiment.id}: falha ao liberar observação: ${(error as Error).message}`);
          });
        }
      }
    } finally {
      this.observing = false;
    }
  }

  private async observeExperiment(
    experiment: Awaited<ReturnType<TechnicalCaseRepository['findDueTelemetry']>>[number],
    claimToken: string,
  ): Promise<void> {
    const technicalCase = experiment.technical_case;
    if (!technicalCase.connection_id || !technicalCase.customer_id) {
      await this.repository.cancelCase(technicalCase.id, 'Escopo operacional do experimento ficou indisponível.');
      return;
    }
    if (experiment.expires_at <= new Date()) {
      const expired = await this.repository.updateClaimedTelemetry(
        experiment.id, claimToken, experiment.status, {
          status: AiDiagnosticExperimentStatus.TIMED_OUT,
          completed_at: new Date(),
          result: 'Tempo máximo de observação atingido.',
        });
      if (!expired) return;
      await this.repository.updateCaseIfStatus(
        technicalCase.id, AiTechnicalCaseStatus.WAITING_TELEMETRY, {
          status: AiTechnicalCaseStatus.INVESTIGATING,
          next_recommended_action: 'Retomar o diagnóstico com o cliente.',
        });
      return;
    }

    const context = await this.inbox.contextForAgentPreview(technicalCase.conversation_id);
    if (context.conversation.status !== 'OPEN') {
      await this.repository.cancelCase(technicalCase.id, 'A conversa foi encerrada durante o experimento.');
      return;
    }
    if (technicalCase.authenticated_scope && !context.verified) {
      await this.repository.cancelCase(
        technicalCase.id, 'O vínculo autenticado deixou de estar ativo durante o experimento.');
      return;
    }
    if (context.verified && this.scopeKey(context.conversation.customerRef || '') !== technicalCase.customer_scope_key) {
      await this.repository.cancelCase(technicalCase.id, 'O cadastro da conversa mudou durante o experimento.');
      return;
    }

    const snapshot = await this.support.triageIdentifiedCustomer(
      technicalCase.connection_id,
      technicalCase.customer_id,
      restoreTechnicalObservationScope(
        technicalCase.selected_contract_ref,
        experiment.target_ref,
      ),
    );
    const observation = this.support.observationFromIdentified(snapshot);
    const sequence = context.conversation.lastSequence;
    await this.recordObservation(technicalCase.id, `observer-${experiment.id}-${experiment.observation_attempts + 1}`, observation);

    if (experiment.status === AiDiagnosticExperimentStatus.WAITING_TELEMETRY_OFF) {
      const transitioned = await this.repository.updateClaimedTelemetry(
        experiment.id, claimToken, experiment.status, {
          status: AiDiagnosticExperimentStatus.WAITING_CUSTOMER_ON,
          last_observed_online: observation.online,
          observation_attempts: { increment: 1 },
          observe_after: null,
        });
      if (!transitioned) return;
      await this.updateRestartHypotheses(technicalCase.id, observation.online);
      const caseTransitioned = await this.repository.updateCaseIfStatus(
        technicalCase.id, AiTechnicalCaseStatus.WAITING_TELEMETRY, {
          status: AiTechnicalCaseStatus.WAITING_CUSTOMER,
          next_recommended_action: 'Aguardar o cliente ligar novamente o equipamento.',
        });
      if (!caseTransitioned) return;
      await this.inbox.sendAgentMessage(
        technicalCase.conversation_id,
        observation.online === false
          ? 'A sessão ficou offline após o desligamento. Pode ligar o equipamento novamente? Vou acompanhar o retorno.'
          : 'A leitura não confirmou a queda da sessão. Pode ligar o equipamento novamente? Vou continuar o teste sem inventar um resultado.',
        `nete-exp-${experiment.id}-off-${experiment.observation_attempts + 1}`,
      );
      return;
    }

    const attempts = experiment.observation_attempts + 1;
    if (observation.online === true) {
      const transitioned = await this.repository.updateClaimedTelemetry(
        experiment.id, claimToken, experiment.status, {
          status: AiDiagnosticExperimentStatus.WAITING_CUSTOMER_VALIDATION,
          last_observed_online: true,
          observation_attempts: attempts,
          observe_after: null,
          result: 'A sessão voltou a aparecer online após o religamento.',
        });
      if (!transitioned) return;
      const caseTransitioned = await this.repository.updateCaseIfStatus(
        technicalCase.id, AiTechnicalCaseStatus.WAITING_TELEMETRY, {
          status: AiTechnicalCaseStatus.WAITING_CUSTOMER,
          next_recommended_action: 'Confirmar navegação em mais de um aparelho.',
          last_customer_sequence: sequence,
        });
      if (!caseTransitioned) return;
      await this.inbox.sendAgentMessage(
        technicalCase.conversation_id,
        'A sessão voltou a aparecer ativa. Teste a navegação em dois aparelhos, se puder, e me diga se voltou ou se continua sem acesso.',
        `nete-exp-${experiment.id}-online`,
      );
      return;
    }

    if (attempts < 3) {
      await this.repository.updateClaimedTelemetry(
        experiment.id, claimToken, experiment.status, {
          last_observed_online: observation.online,
          observation_attempts: attempts,
          observe_after: new Date(Date.now() + 20_000),
        });
      return;
    }

    const transitioned = await this.repository.updateClaimedTelemetry(
      experiment.id, claimToken, experiment.status, {
        status: AiDiagnosticExperimentStatus.COMPLETED,
        last_observed_online: observation.online,
        observation_attempts: attempts,
        completed_at: new Date(),
        observe_after: null,
        result: observation.online === false
          ? 'A sessão não retornou após três observações.'
          : 'A telemetria permaneceu indisponível após três observações.',
      });
    if (!transitioned) return;
    const caseTransitioned = await this.repository.updateCaseIfStatus(
      technicalCase.id, AiTechnicalCaseStatus.WAITING_TELEMETRY, {
        status: AiTechnicalCaseStatus.ESCALATED,
        next_recommended_action: 'Encaminhar o caso com as observações realizadas e avaliar OS.',
        resolution_summary: 'Reinicialização assistida sem restabelecimento confirmado da sessão.',
      });
    if (!caseTransitioned) return;
    await this.inbox.sendAgentMessage(
      technicalCase.conversation_id,
      observation.online === false
        ? 'A sessão ainda não retornou após as observações. Registrei o resultado deste teste no caso; a próxima ação indicada é verificar a abertura de uma ordem de serviço.'
        : 'Não consegui confirmar o retorno da sessão pela telemetria. Registrei essa limitação no caso, sem afirmar que a conexão voltou; a próxima ação indicada é a avaliação técnica.',
      `nete-exp-${experiment.id}-escalated`,
    );
  }
}

