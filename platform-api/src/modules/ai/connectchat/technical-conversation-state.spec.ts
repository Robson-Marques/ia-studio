import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { fallbackTechnicalPlan } from './technical-case-planner';
import { analyzeTechnicalConversation } from './technical-conversation-state';

test('sem conexão em todos avança para distinguir associação de navegação', () => {
  const plan = fallbackTechnicalPlan({ customerMessages: ['Estou sem conexão', 'Em todos os aparelhos'] });
  assert.equal(plan.action, 'ASK_CONNECTION_STATE');
});

test('sem navegação com luzes normais conclui coleta anterior ao reinício', () => {
  const state = analyzeTechnicalConversation([
    'Estou sem internet em todos os aparelhos',
    'Eles conectam no Wi-Fi, mas ficam sem internet',
    'As luzes estão normais e não tem luz vermelha',
  ]);
  assert.equal(state.connectionState, 'WIFI_WITHOUT_INTERNET');
  assert.equal(state.equipmentLights, 'NORMAL');
});

test('LOS vermelha escala com evidência e não recomenda reinício genérico', () => {
  const plan = fallbackTechnicalPlan({
    customerMessages: [
      'Sem internet em todos os aparelhos',
      'Conecta no Wi-Fi sem navegar',
      'A luz LOS está piscando vermelha',
    ],
  });
  assert.equal(plan.action, 'ESCALATE_WITH_EVIDENCE');
  assert.match(plan.reasoning, /sinal físico de falha/i);
});

test('lentidão coleta meio e depois medição', () => {
  assert.equal(fallbackTechnicalPlan({
    customerMessages: ['A internet está lenta em todos os aparelhos'],
  }).action, 'ASK_PERFORMANCE_MEDIUM');
  assert.equal(fallbackTechnicalPlan({
    customerMessages: ['A internet está lenta em todos', 'Também fica lenta no cabo'],
  }).action, 'REQUEST_SPEED_TEST');
});

test('medição de velocidade encerra perguntas repetidas e escala evidências', () => {
  const plan = fallbackTechnicalPlan({
    customerMessages: ['Está lenta em todos', 'Também no cabo', 'O teste deu 18 Mbps'],
  });
  assert.equal(plan.action, 'ESCALATE_WITH_EVIDENCE');
});

test('intermitência coleta padrão antes das luzes', () => {
  const first = fallbackTechnicalPlan({
    customerMessages: ['A conexão cai em todos os aparelhos'],
  });
  assert.equal(first.action, 'ASK_INTERMITTENCE_PATTERN');
  const second = fallbackTechnicalPlan({
    customerMessages: ['A conexão cai em todos', 'Cai 5 vezes por dia, mais à noite'],
  });
  assert.equal(second.action, 'ASK_EQUIPMENT_LIGHTS');
});

test('teste local respondido não é solicitado novamente no aparelho isolado', () => {
  const plan = fallbackTechnicalPlan({
    customerMessages: ['Só no celular', 'Já fiz e continua sem internet'],
    assistantMessages: ['Desligue e ligue o Wi-Fi e conecte novamente à rede.'],
  });
  assert.notEqual(plan.action, 'REQUEST_SINGLE_DEVICE_CHECK');
});

test('problema de cobertura usa comparação perto do roteador', () => {
  const plan = fallbackTechnicalPlan({
    customerMessages: ['O sinal não pega no quarto em todos os celulares'],
  });
  assert.equal(plan.action, 'REQUEST_WIFI_PROXIMITY_CHECK');
});
