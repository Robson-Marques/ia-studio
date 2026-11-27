import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { analyzeLinkHistory, parseIxcDate } from './connectchat-link-history';
import { buildRecentHistory } from './connectchat-recent-history';

test('preserva o nome da equipe técnica do último fechamento da OS', () => {
  const history = buildRecentHistory([
    {
      assunto: 'Instabilidade',
      status: 'F',
      concluida_em: '27/11/2026 12:00:00',
      parecer: 'Troca de equipamento',
      equipe_tecnica: 'Equipe Fibra Norte',
    },
  ], []);

  assert.equal(history.driver?.equipeTecnica, 'Equipe Fibra Norte');
});

test('interpreta datas ISO e brasileiras do IXC no fuso de São Paulo', () => {
  assert.equal(
    parseIxcDate('2026-11-27 12:00:00'),
    Date.parse('2026-11-27T12:00:00-03:00'),
  );
  assert.equal(
    parseIxcDate('27/11/2026 12:00:00'),
    Date.parse('2026-11-27T12:00:00-03:00'),
  );
});

test('detecta quedas nas janelas de 24h, 48h e 7 dias', () => {
  const now = new Date('2026-11-27T15:00:00-03:00');
  const result = analyzeLinkHistory([
    { inicio: '2026-11-27 10:00:00', fim: '2026-11-27 10:01:00', duracao_seg: '60' },
    { inicio: '2026-11-26 15:00:00', fim: '2026-11-26 15:02:00', duracao_seg: '120' },
    { inicio: '2026-11-25 15:00:00', fim: '2026-11-25 15:02:00', duracao_seg: '120' },
    { inicio: '2026-11-22 12:00:00', fim: '2026-11-22 12:02:00', duracao_seg: '120' },
  ], now);

  assert.equal(result.quedas24h, 2);
  assert.equal(result.quedas48h, 3);
  assert.equal(result.quedas7d, 4);
  assert.equal(result.sessoesCurtas24h, 2);
  assert.equal(result.anomalia, false);
});

test('marca flapping com três sessões curtas no último dia', () => {
  const now = new Date('2026-11-27T15:00:00-03:00');
  const result = analyzeLinkHistory([
    { inicio: '2026-11-27 14:00:00', fim: '2026-11-27 14:01:00', duracao_seg: '60', motivo: 'Lost-Carrier' },
    { inicio: '2026-11-27 13:00:00', fim: '2026-11-27 13:02:00', duracao_seg: '120' },
    { inicio: '2026-11-27 12:00:00', fim: '2026-11-27 12:03:00', duracao_seg: '180' },
  ], now);

  assert.equal(result.quedas24h, 3);
  assert.equal(result.sessoesCurtas24h, 3);
  assert.equal(result.anomalia, true);
  assert.equal(result.ultimoMotivo, 'Lost-Carrier');
});
