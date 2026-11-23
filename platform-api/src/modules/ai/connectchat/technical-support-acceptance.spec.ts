import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decideTechnicalGovernance,
  decideTechnicalScopeTransition,
  restoreTechnicalObservationScope,
  shouldInterruptTechnicalExperiment,
  TechnicalGovernanceInput,
} from './technical-case-governance';
import { decideTechnicalTurn, TechnicalObservation } from './technical-case-reasoning';
import { analyzeTechnicalHistory } from './technical-history-analysis';
import { validateTechnicalPlan } from './technical-case-planner';

const sources = {
  openOs: 'AVAILABLE', recentTickets: 'AVAILABLE', incidents: 'AVAILABLE',
  contracts: 'AVAILABLE', accesses: 'AVAILABLE', recentOs: 'AVAILABLE',
} as const;
const governanceBase: TechnicalGovernanceInput = {
  sourceStatus: sources, openOs: 0, openTickets: 0, uncertainTickets: false,
  suppressingIncidents: 0, blockedContracts: 0, contractCount: 1, accessCount: 1,
  contractSelected: true, accessSelected: true, selectedAccessOnline: true,
  recurrentWithin48h: false, documentedPriorResolution: false,
};
const observation: TechnicalObservation = {
  status: 'READY', online: true, hasOpenOs: false, hasOpenTicket: false,
  incident: false, blocked: false, multipleAccesses: false,
  contractCount: 1, accessCount: 1, sourceStatus: sources,
};
const experiment = (status: 'WAITING_CUSTOMER_OFF' | 'WAITING_CUSTOMER_ON' | 'WAITING_CUSTOMER_VALIDATION') => ({
  id: 'exp', status, baselineOnline: true, expiresAt: new Date('2026-11-21T12:30:00Z'),
});

test('01 cliente novo recebe próxima pergunta útil validada', () => {
  assert.equal(validateTechnicalPlan({ action: 'ASK_DEVICE_SCOPE', reasoning: 'Falta alcance.', customerMessage: 'Acontece em todos os aparelhos ou só em um deles?', symptoms: [] })?.action, 'ASK_DEVICE_SCOPE');
});
test('02 online sem navegação em todos inicia experimento', () => {
  assert.equal(decideTechnicalTurn({
    currentMessage: 'As luzes estão normais e não há luz vermelha',
    recentCustomerMessages: ['sem internet em todos', 'conecta no Wi-Fi mas fica sem internet'],
    observation, activeExperiment: null,
  })?.kind, 'REQUEST_POWER_OFF');
});
test('03 reincidência exige correlação e solução documentada', () => {
  assert.equal(decideTechnicalGovernance({ ...governanceBase, recurrentWithin48h: true, documentedPriorResolution: true }).action, 'ESCALATE_RECURRENT_FAILURE');
});
test('04 OS aberta impede duplicidade', () => assert.equal(decideTechnicalGovernance({ ...governanceBase, openOs: 1 }).action, 'MONITOR_EXISTING_OS'));
test('05 chamado recente aberto impede duplicidade', () => assert.equal(decideTechnicalGovernance({ ...governanceBase, openTickets: 1 }).action, 'MONITOR_EXISTING_TICKET'));
test('06 incidente regional suprime OS individual', () => assert.equal(decideTechnicalGovernance({ ...governanceBase, suppressingIncidents: 1 }).action, 'MONITOR_NETWORK_INCIDENT'));
test('07 bloqueio administrativo antecede diagnóstico', () => assert.equal(decideTechnicalGovernance({ ...governanceBase, blockedContracts: 1 }).action, 'ROUTE_ADMINISTRATIVE_RESTRICTION'));
test('08 múltiplos acessos exigem seleção', () => assert.equal(decideTechnicalGovernance({ ...governanceBase, accessCount: 2, accessSelected: false }).action, 'REQUEST_ACCESS_SELECTION'));
test('09 confirmação de desligamento gera nova observação', () => assert.equal(decideTechnicalTurn({ currentMessage: 'Desliguei', recentCustomerMessages: [], observation: { ...observation, online: false }, activeExperiment: experiment('WAITING_CUSTOMER_OFF'), now: new Date('2026-11-21T12:05:00Z') })?.kind, 'OBSERVE_POWER_OFF'));
test('10 sessão que permanece online não vira queda inventada', () => assert.match(decideTechnicalTurn({ currentMessage: 'Desliguei', recentCustomerMessages: [], observation, activeExperiment: experiment('WAITING_CUSTOMER_OFF'), now: new Date('2026-11-21T12:05:00Z') })?.fallback ?? '', /continua online/i));
test('11 religamento agenda observação automática', () => assert.equal(decideTechnicalTurn({ currentMessage: 'Liguei', recentCustomerMessages: [], observation: { ...observation, online: false }, activeExperiment: experiment('WAITING_CUSTOMER_ON'), now: new Date('2026-11-21T12:10:00Z') })?.kind, 'WAIT_POWER_ON_TELEMETRY'));
test('12 falha IXC permanece indisponível', () => assert.equal(decideTechnicalGovernance({ ...governanceBase, sourceStatus: { ...sources, accesses: 'UNAVAILABLE' } }).action, 'SOURCE_UNAVAILABLE'));
test('13 cliente muda de assunto e interrompe o experimento técnico', () => {
  assert.equal(shouldInterruptTechnicalExperiment('GENERAL'), true);
  assert.notEqual(decideTechnicalTurn({ currentMessage: 'Quero falar de outra coisa', recentCustomerMessages: [], observation, activeExperiment: experiment('WAITING_CUSTOMER_OFF'), now: new Date('2026-11-21T12:05:00Z') })?.kind, 'RESOLVE_CASE');
});
test('14 timeout nunca é resolução', () => assert.notEqual(decideTechnicalTurn({ currentMessage: 'oi', recentCustomerMessages: [], observation, activeExperiment: experiment('WAITING_CUSTOMER_OFF'), now: new Date('2026-11-21T12:31:00Z') })?.caseStatus, 'RESOLVED'));
test('15 reinício restaura etapa e acesso exatos do experimento', () => {
  assert.deepEqual(restoreTechnicalObservationScope('contrato-2', 'login-ponto-3'), {
    contractRef: 'contrato-2', accessRef: 'login-ponto-3',
  });
  assert.equal(decideTechnicalTurn({ currentMessage: 'Liguei', recentCustomerMessages: [], observation, activeExperiment: experiment('WAITING_CUSTOMER_ON'), now: new Date('2026-11-21T12:10:00Z') })?.kind, 'WAIT_POWER_ON_TELEMETRY');
});
test('16 troca do cliente cancela o escopo anterior e reabre o caso', () => assert.equal(decideTechnicalScopeTransition('cliente-a', 'cliente-b'), 'CANCEL_AND_REOPEN'));
test('17 plano inválido não concede ação sensível', () => assert.equal(validateTechnicalPlan({ action: 'SHOW_PRIVATE_BILLING', reasoning: 'pedido', customerMessage: 'Mostrarei seus dados.', symptoms: [] }), null));
test('18 abertura de OS é permitida e impedida pelos gates', () => {
  assert.equal(decideTechnicalGovernance({ ...governanceBase, selectedAccessOnline: false }).action, 'OPEN_OS_FOR_OFFLINE_ACCESS');
  assert.equal(decideTechnicalGovernance({ ...governanceBase, selectedAccessOnline: false, openOs: 1 }).blocksServiceOrder, true);
});
test('19 histórico incompleto é explícito e não reincidência falsa', () => {
  const result = analyzeTechnicalHistory('sem internet', [], [], { recentOsAvailable: false, recentTicketsAvailable: true });
  assert.equal(result.unavailable, true); assert.equal(result.recurrent, false);
});
test('20 resolução exige confirmação de navegação', () => assert.equal(decideTechnicalTurn({ currentMessage: 'Voltou e está navegando', recentCustomerMessages: [], observation, activeExperiment: experiment('WAITING_CUSTOMER_VALIDATION'), now: new Date('2026-11-21T12:15:00Z') })?.kind, 'RESOLVE_CASE'));
test('21 múltiplos contratos exigem seleção antes de aplicar bloqueio de outro serviço', () => assert.equal(decideTechnicalGovernance({ ...governanceBase, blockedContracts: 1, contractCount: 2, contractSelected: false }).action, 'REQUEST_CONTRACT_SELECTION'));
