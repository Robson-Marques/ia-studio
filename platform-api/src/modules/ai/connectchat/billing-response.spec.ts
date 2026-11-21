import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatVerifiedInvoices } from './billing-response';

test('título válido expõe somente vencimento, valor e linha digitável', () => {
  const line = '12345678901234567890123456789012345678901234567';
  const text = formatVerifiedInvoices([{
    id: '99', vencimento: '2026-11-25', valor_aberto: '109.90', linha_digitavel: line,
    descricao: 'NÃO PUBLICAR A DESCRIÇÃO', senha: 'SEGREDO',
  }], 1);
  assert.match(text, /25\/11\/2026/);
  assert.match(text, /R\$ 109.90/);
  assert.ok(text.includes(line));
  assert.ok(!text.includes('SEGREDO'));
  assert.ok(!text.includes('NÃO PUBLICAR'));
});

test('link HTTPS válido é permitido; javascript/http/credenciais são bloqueados', () => {
  const text = formatVerifiedInvoices([
    { link_boleto: 'https://pagamentos.example.org/boleto/1' },
    { link_boleto: 'javascript:alert(1)' },
    { link_boleto: 'http://site.example.org/boleto' },
    { link_boleto: 'https://nome:senha@site.example.org/boleto' },
  ], 4);
  assert.ok(text.includes('https://pagamentos.example.org/boleto/1'));
  assert.ok(!text.includes('javascript:'));
  assert.ok(!text.includes('http://site'));
  assert.ok(!text.includes('senha@'));
});

test('não expõe código de pagamento com formato inválido', () => {
  const text = formatVerifiedInvoices([{ linha_digitavel: 'ABC123', valor: '<script>' }], 1);
  assert.ok(!text.includes('ABC123'));
  assert.ok(!text.includes('<script>'));
});

test('limita cinco títulos e informa que existem mais', () => {
  const text = formatVerifiedInvoices(Array.from({ length: 7 }, () => ({ valor: '10.00' })), 7);
  assert.ok(text.includes('mais 2 títulos'));
  assert.ok(!text.includes('6. Título'));
});

test('sem títulos não inventa faturas', () => {
  assert.match(formatVerifiedInvoices([], 0), /Não encontrei títulos em aberto/);
});
