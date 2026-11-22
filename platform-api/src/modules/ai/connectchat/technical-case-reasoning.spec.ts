import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ActiveDiagnosticExperiment,
  decideTechnicalTurn,
  TechnicalObservation,
} from './technical-case-reasoning';

const readyOnline: TechnicalObservation = {
  status: 'READY',
  online: true,
  hasOpenOs: false,
  hasOpenTicket: false,
  incident: false,
  blocked: false,
  multipleAccesses: false,
  contractCount: 1,
  accessCount: 1,
  sourceStatus: {
    openOs: 'AVAILABLE', recentTickets: 'AVAILABLE', incidents: 'AVAILABLE',
    contracts: 'AVAILABLE', accesses: 'AVAILABLE',
  },
};

function experiment(status: ActiveDiagnosticExperiment['status'], baselineOnline: boolean | null = true): ActiveDiagnosticExperiment {
  return { id: 'exp-1', status, baselineOnline, expiresAt: new Date('2026-11-21T15:20:00Z') };
}

test('inicia reinicializacao quando todos os aparelhos falham e a sessao segue online', () => {
  const result = decideTechnicalTurn({
    currentMessage: 'As luzes estão normais e não tem luz vermelha.',
    recentCustomerMessages: ['Estou sem internet em todos os aparelhos', 'Conecta no Wi-Fi, mas fica sem internet'],
    observation: readyOnline,
    activeExperiment: null,
    now: new Date('2026-11-21T15:00:00Z'),
  });
  assert.equal(result?.kind, 'REQUEST_POWER_OFF');
});

test('nao inicia experimento se consulta de chamados falhou', () => {
  const result = decideTechnicalTurn({
    currentMessage: 'As luzes estão normais.',
    recentCustomerMessages: ['Sem internet em todos', 'Conecta no Wi-Fi sem internet'],
    observation: {
      ...readyOnline,
      hasOpenTicket: null,
      sourceStatus: { ...readyOnline.sourceStatus, recentTickets: 'UNAVAILABLE' },
    },
    activeExperiment: null,
  });
  assert.equal(result, null);
});

test('nao reinicia antes de conhecer associacao e luzes do equipamento', () => {
  const result = decideTechnicalTurn({
    currentMessage: 'Em todos os aparelhos',
    recentCustomerMessages: ['Estou sem internet'],
    observation: readyOnline,
    activeExperiment: null,
  });
  assert.equal(result, null);
});

test('lentidao nao entra no experimento de indisponibilidade', () => {
  const result = decideTechnicalTurn({
    currentMessage: 'As luzes estão normais',
    recentCustomerMessages: ['A internet está lenta em todos', 'Acontece no Wi-Fi'],
    observation: readyOnline,
    activeExperiment: null,
  });
  assert.equal(result, null);
});

test('observa novamente quando cliente confirma que desligou', () => {
  const result = decideTechnicalTurn({
    currentMessage: 'Desliguei',
    recentCustomerMessages: [],
    observation: { ...readyOnline, online: false },
    activeExperiment: experiment('WAITING_CUSTOMER_OFF'),
    now: new Date('2026-11-21T15:01:00Z'),
  });
  assert.equal(result?.kind, 'OBSERVE_POWER_OFF');
  assert.equal(result?.facts.estado_observado_online, false);
});

test('nao inventa queda quando a sessao permanece online depois do desligamento', () => {
  const result = decideTechnicalTurn({
    currentMessage: 'Pronto, desligado',
    recentCustomerMessages: [],
    observation: readyOnline,
    activeExperiment: experiment('WAITING_CUSTOMER_OFF'),
    now: new Date('2026-11-21T15:01:00Z'),
  });
  assert.equal(result?.kind, 'OBSERVE_POWER_OFF');
  assert.match(result?.fallback ?? '', /continua online/i);
});

test('agenda observacao sem exigir nova mensagem quando cliente religa', () => {
  const result = decideTechnicalTurn({
    currentMessage: 'Liguei novamente',
    recentCustomerMessages: [],
    observation: { ...readyOnline, online: false },
    activeExperiment: experiment('WAITING_CUSTOMER_ON'),
    now: new Date('2026-11-21T15:02:00Z'),
  });
  assert.equal(result?.kind, 'WAIT_POWER_ON_TELEMETRY');
  assert.match(result?.fallback ?? '', /não precisa enviar outra mensagem/i);
});

test('resolve somente depois que o cliente confirma navegacao', () => {
  const result = decideTechnicalTurn({
    currentMessage: 'Voltou, está funcionando nos dois aparelhos',
    recentCustomerMessages: [],
    observation: readyOnline,
    activeExperiment: experiment('WAITING_CUSTOMER_VALIDATION'),
    now: new Date('2026-11-21T15:03:00Z'),
  });
  assert.equal(result?.kind, 'RESOLVE_CASE');
  assert.equal(result?.caseStatus, 'RESOLVED');
});

test('encaminha com evidencias quando a sessao volta mas a navegacao nao', () => {
  const result = decideTechnicalTurn({
    currentMessage: 'Não voltou, continua sem internet',
    recentCustomerMessages: [],
    observation: readyOnline,
    activeExperiment: experiment('WAITING_CUSTOMER_VALIDATION'),
    now: new Date('2026-11-21T15:03:00Z'),
  });
  assert.equal(result?.kind, 'ESCALATE_CASE');
  assert.equal(result?.caseStatus, 'ESCALATED');
});

test('expira experimento sem tratar silencio como resolucao', () => {
  const result = decideTechnicalTurn({
    currentMessage: 'Oi',
    recentCustomerMessages: [],
    observation: readyOnline,
    activeExperiment: experiment('WAITING_CUSTOMER_OFF'),
    now: new Date('2026-11-21T15:21:00Z'),
  });
  assert.equal(result?.kind, 'EXPERIMENT_TIMED_OUT');
  assert.notEqual(result?.caseStatus, 'RESOLVED');
});

