import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateTechnicalPlan } from './technical-case-planner';

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
