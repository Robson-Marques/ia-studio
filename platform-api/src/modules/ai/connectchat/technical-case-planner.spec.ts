import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  communicateTechnicalPlan,
  fallbackTechnicalPlan,
  hasReportedDeviceScope,
  validateTechnicalPlan,
} from './technical-case-planner';

test('aceita ação estruturada com mensagem compatível', () => {
  const plan = validateTechnicalPlan({
    action: 'ASK_DEVICE_SCOPE',
    reasoning: 'Falta saber o alcance do sintoma.',
    customerMessage: 'Isso acontece em todos os aparelhos ou apenas em um deles?',
    symptoms: ['sem_navegacao'],
  });
  assert.equal(plan?.action, 'ASK_DEVICE_SCOPE');
  assert.equal(plan?.modelSelected, true);
});

test('rejeita ação ou afirmação fora do catálogo', () => {
  assert.equal(validateTechnicalPlan({
    action: 'RESET_OLT', reasoning: 'Executar reset.',
    customerMessage: 'Reiniciei a OLT e resolveu.', symptoms: [],
  }), null);
});

test('rejeita mensagem que não preserva a ação escolhida', () => {
  assert.equal(validateTechnicalPlan({
    action: 'ESCALATE_WITH_EVIDENCE', reasoning: 'Sem telemetria suficiente.',
    customerMessage: 'Está tudo resolvido.', symptoms: [],
  }), null);
});

test('comunica a investigação confirmada antes da pergunta técnica', () => {
  const message = communicateTechnicalPlan({
    action: 'ASK_DEVICE_SCOPE',
    reasoning: 'Falta conhecer o alcance.',
    customerMessage: 'A falha acontece em todos os aparelhos ou somente em um?',
    symptoms: ['sem_navegacao'],
    modelSelected: false,
  }, {
    status: 'READY', online: true, hasOpenOs: false, hasOpenTicket: false,
    incident: false,
    sourceStatus: {
      openOs: 'AVAILABLE', recentTickets: 'AVAILABLE', incidents: 'AVAILABLE',
      contracts: 'AVAILABLE', accesses: 'AVAILABLE',
    },
  });
  assert.match(message, /^Consultei sua conexão:/);
  assert.match(message, /online no sistema/i);
  assert.match(message, /não comprova/i);
  assert.match(message, /todos os aparelhos/i);
});

test('não repete pergunta de alcance respondida anteriormente no caso', () => {
  const messages = [
    'Estou sem conexão',
    'Acontece em todos os aparelhos aqui de casa',
    ...Array.from({ length: 20 }, (_, index) => `mensagem de acompanhamento ${index + 1}`),
  ];
  assert.equal(hasReportedDeviceScope(messages), true);
});

test('transforma "em todos" em avanço explicado do diagnóstico, sem ecoar o cliente', () => {
  const plan = fallbackTechnicalPlan({
    customerMessages: ['Estou sem conexão', 'Em todos'],
    assistantMessages: ['A falha acontece em todos os aparelhos ou somente em um?'],
  });
  assert.equal(plan.action, 'ASK_CONNECTION_STATE');
  const message = communicateTechnicalPlan(plan, {
    status: 'READY', online: true, hasOpenOs: false, hasOpenTicket: false,
    incident: false,
    sourceStatus: {
      openOs: 'AVAILABLE', recentTickets: 'AVAILABLE', incidents: 'AVAILABLE',
      contracts: 'AVAILABLE', accesses: 'AVAILABLE',
    },
  });
  assert.match(message, /falha atinge os aparelhos/i);
  assert.match(message, /separar uma dificuldade no Wi-Fi/i);
  assert.match(message, /entram no Wi-Fi/i);
  assert.doesNotMatch(message, /^Entendi\. Todos os aparelhos/i);
});
