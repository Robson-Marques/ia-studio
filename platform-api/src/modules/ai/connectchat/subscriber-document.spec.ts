import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractSubscriberDocument,
  isValidSubscriberDocument,
  normalizeSubscriberDocument,
} from './subscriber-document';

test('CPF válido, com e sem máscara', () => {
  assert.equal(isValidSubscriberDocument('529.982.247-25'), true);
  assert.equal(isValidSubscriberDocument('52998224725'), true);
  assert.equal(normalizeSubscriberDocument('529.982.247-25'), '52998224725');
});

test('CPF inválido ou repetido não consulta IXC', () => {
  assert.equal(isValidSubscriberDocument('529.982.247-26'), false);
  assert.equal(isValidSubscriberDocument('11111111111'), false);
});

test('CNPJ numérico continua compatível', () => {
  assert.equal(isValidSubscriberDocument('04.252.011/0001-10'), true);
  assert.equal(isValidSubscriberDocument('04252011000110'), true);
  assert.equal(isValidSubscriberDocument('04252011000111'), false);
});

test('CNPJ alfanumérico emitido desde 2026 (ASCII-48)', () => {
  assert.equal(isValidSubscriberDocument('12.ABC.345/01DE-35'), true);
  assert.equal(isValidSubscriberDocument('12ABC34501DE35'), true);
  assert.equal(isValidSubscriberDocument('12ABC34501DE36'), false);
});

test('extrai CPF e CNPJ de texto, sem capturar documento parcial', () => {
  assert.equal(extractSubscriberDocument('Meu CPF é 529.982.247-25.'), '529.982.247-25');
  assert.equal(extractSubscriberDocument('CNPJ: 12.ABC.345/01DE-35'), '12.ABC.345/01DE-35');
  assert.equal(extractSubscriberDocument('CNPJ: 12ABC34501DE35'), '12ABC34501DE35');
  assert.equal(extractSubscriberDocument('Não há documento.'), null);
  assert.equal(extractSubscriberDocument('PrefixoX12ABC34501DE35Sufixo'), null);
});
