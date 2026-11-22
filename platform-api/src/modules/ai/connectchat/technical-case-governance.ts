import type { TechnicalSourceState } from './technical-case-reasoning';

export type TechnicalGovernanceAction =
  | 'SOURCE_UNAVAILABLE'
  | 'MONITOR_EXISTING_OS'
  | 'MONITOR_EXISTING_TICKET'
  | 'MONITOR_NETWORK_INCIDENT'
  | 'ROUTE_ADMINISTRATIVE_RESTRICTION'
  | 'REQUEST_CONTRACT_SELECTION'
  | 'REQUEST_ACCESS_SELECTION'
  | 'ESCALATE_RECURRENT_FAILURE'
  | 'OPEN_OS_FOR_OFFLINE_ACCESS'
  | 'CONTINUE_DIAGNOSIS';

export interface TechnicalGovernanceInput {
  sourceStatus: Record<string, TechnicalSourceState>;
  openOs: number;
  openTickets: number;
  uncertainTickets: boolean;
  suppressingIncidents: number;
  blockedContracts: number;
  contractCount: number;
  accessCount: number;
  contractSelected: boolean;
  accessSelected: boolean;
  selectedAccessOnline: boolean | null;
  recurrentWithin48h: boolean;
  documentedPriorResolution: boolean;
}

export interface TechnicalGovernanceDecision {
  action: TechnicalGovernanceAction;
  blocksServiceOrder: boolean;
  reason: string;
}

export function decideTechnicalScopeTransition(
  currentScopeKey: string | null | undefined,
  nextScopeKey: string,
): 'KEEP' | 'CANCEL_AND_REOPEN' {
  return currentScopeKey && currentScopeKey !== nextScopeKey
    ? 'CANCEL_AND_REOPEN' : 'KEEP';
}

export function shouldInterruptTechnicalExperiment(intent: string): boolean {
  return intent === 'GENERAL' || intent === 'FINANCE';
}

export function restoreTechnicalObservationScope(
  selectedContractRef: string | null | undefined,
  experimentTargetRef: string | null | undefined,
): { contractRef?: string; accessRef?: string } {
  return {
    ...(selectedContractRef ? { contractRef: selectedContractRef } : {}),
    ...(experimentTargetRef ? { accessRef: experimentTargetRef } : {}),
  };
}

export function decideTechnicalGovernance(input: TechnicalGovernanceInput): TechnicalGovernanceDecision {
  if (input.openOs > 0) {
    return { action: 'MONITOR_EXISTING_OS', blocksServiceOrder: true, reason: 'Já existe OS aberta.' };
  }
  if (input.suppressingIncidents > 0) {
    return { action: 'MONITOR_NETWORK_INCIDENT', blocksServiceOrder: true, reason: 'Incidente ativo suprime OS individual.' };
  }
  if (input.openTickets > 0 || input.uncertainTickets) {
    return { action: 'MONITOR_EXISTING_TICKET', blocksServiceOrder: true, reason: 'Chamado existente ou estado do histórico incerto.' };
  }
  const required = ['openOs', 'recentTickets', 'incidents', 'contracts', 'accesses'];
  if (required.some((source) => input.sourceStatus[source] !== 'AVAILABLE')) {
    return { action: 'SOURCE_UNAVAILABLE', blocksServiceOrder: true, reason: 'Uma fonte obrigatória não respondeu.' };
  }
  if (input.contractCount > 1 && !input.contractSelected) {
    return { action: 'REQUEST_CONTRACT_SELECTION', blocksServiceOrder: true, reason: 'Há mais de um contrato ativo.' };
  }
  if (input.accessCount > 1 && !input.accessSelected) {
    return { action: 'REQUEST_ACCESS_SELECTION', blocksServiceOrder: true, reason: 'Há mais de um acesso no escopo selecionado.' };
  }
  if (input.blockedContracts > 0) {
    return { action: 'ROUTE_ADMINISTRATIVE_RESTRICTION', blocksServiceOrder: true, reason: 'Restrição administrativa precisa ser tratada antes do diagnóstico técnico.' };
  }
  if (input.recurrentWithin48h && input.documentedPriorResolution) {
    return { action: 'ESCALATE_RECURRENT_FAILURE', blocksServiceOrder: false, reason: 'Sintoma correlacionado retornou após solução documentada.' };
  }
  if (input.selectedAccessOnline === false) {
    return { action: 'OPEN_OS_FOR_OFFLINE_ACCESS', blocksServiceOrder: false, reason: 'Acesso selecionado está offline sem bloqueadores.' };
  }
  return { action: 'CONTINUE_DIAGNOSIS', blocksServiceOrder: false, reason: 'Não há bloqueador; investigação pode prosseguir.' };
}

