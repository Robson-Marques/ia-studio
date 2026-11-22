import assert from 'node:assert/strict';
import test from 'node:test';
import {
  greetingForNewnet,
  habitualCustomerConfirmed,
  habitualCustomerQuestion,
} from './customer-dialogue';

test('cumprimenta no horário local da Newnet', () => {
  assert.equal(greetingForNewnet(new Date('2026-11-22T12:00:00Z')), 'Bom dia');
  assert.equal(greetingForNewnet(new Date('2026-11-22T18:00:00Z')), 'Boa tarde');
  assert.equal(greetingForNewnet(new Date('2026-11-22T22:30:00Z')), 'Boa noite');
});

test('saúda e se apresenta antes de confirmar o cliente habitual', () => {
  assert.equal(
    habitualCustomerQuestion('Edimarcia Medeiros da Rocha', 'Oi', new Date('2026-11-22T22:30:00Z')),
    'Boa noite! Eu sou a Nete, da Newnet. Antes de começarmos, é sobre a assinatura de Edimarcia Medeiros da Rocha?',
  );
});

test('acolhe o problema já informado antes da confirmação', () => {
  assert.match(
    habitualCustomerQuestion('Edimarcia Medeiros da Rocha', 'Estou sem conexão'),
    /^Entendi\. Vou cuidar disso com você\./,
  );
});

test('confirma de forma acolhedora e não reclassifica o sim como nova intenção', () => {
  assert.equal(
    habitualCustomerConfirmed('Edimarcia Medeiros da Rocha'),
    'Perfeito, Edimarcia. Obrigada por confirmar. Como posso ajudar você hoje?',
  );
});
