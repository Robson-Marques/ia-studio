import * as assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeTechnicalHistory } from './technical-history-analysis';

test('não chama qualquer atendimento recente de reincidência', () => {
  const result = analyzeTechnicalHistory(
    'Estou sem internet em todos os aparelhos',
    [{ id: '1', relato: 'Mudança de endereço', concluida_em: '2026-11-20T10:00:00Z' }],
    [],
    { recentOsAvailable: true, recentTicketsAvailable: true, now: new Date('2026-11-21T10:00:00Z') },
  );
  assert.equal(result.recurrent, false);
});

test('correlaciona motivo e solução anterior documentada', () => {
  const result = analyzeTechnicalHistory(
    'Internet oscilando e caindo várias vezes',
    [{
      protocolo: 'OS-10', relato: 'Cliente relata conexão instável e quedas',
      parecer: 'Fonte do roteador substituída', concluida_em: '2026-11-20T10:00:00Z',
    }],
    [],
    { recentOsAvailable: true, recentTicketsAvailable: true, now: new Date('2026-11-21T10:00:00Z') },
  );
  assert.equal(result.recurrentWithin48h, true);
  assert.deepEqual(result.previousResolutionHints, ['Fonte do roteador substituída']);
});

test('mantém indisponibilidade de histórico explícita', () => {
  const result = analyzeTechnicalHistory('Sem internet', [], [], {
    recentOsAvailable: false, recentTicketsAvailable: true,
  });
  assert.equal(result.unavailable, true);
});
