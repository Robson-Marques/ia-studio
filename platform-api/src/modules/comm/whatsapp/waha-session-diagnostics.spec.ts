import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyWahaCause, extractWahaReason, shouldAutoRecover, wahaDownDetail,
} from './waha-session-diagnostics';

test('extrai reason de objeto em payload.data.reason', () => {
  const diag = extractWahaReason({ data: { reason: { event: 'ConnectFailure', message: 'socket closed', code: 428 } } });
  assert.equal(diag.event, 'ConnectFailure');
  assert.equal(diag.message, 'socket closed');
  assert.equal(diag.code, '428');
});

test('extrai reason de string e de payload.reason direto', () => {
  assert.equal(extractWahaReason({ reason: 'LoggedOut' }).event, 'LoggedOut');
  assert.equal(extractWahaReason({ data: {} }).reason, null);
});

test('diferencia as causas (item 7)', () => {
  assert.equal(classifyWahaCause({ event: 'ConnectFailure', message: null, reason: null }), 'ConnectFailure');
  assert.equal(classifyWahaCause({ event: 'StreamReplaced', message: null, reason: null }), 'StreamReplaced');
  assert.equal(classifyWahaCause({ event: 'ClientOutdated', message: null, reason: null }), 'ClientOutdated');
  assert.equal(classifyWahaCause({ event: 'LoggedOut', message: null, reason: null }), 'LoggedOut');
  assert.equal(classifyWahaCause({ event: 'TemporaryBan', message: null, reason: null }), 'TemporaryBan');
  assert.equal(classifyWahaCause({ event: null, message: null, reason: null }), null);
});

test('recuperação automática só em causas reconectáveis (item 5)', () => {
  assert.equal(shouldAutoRecover('ConnectFailure'), true);
  assert.equal(shouldAutoRecover('StreamReplaced'), true);
  assert.equal(shouldAutoRecover(null), true);
  assert.equal(shouldAutoRecover('LoggedOut'), false);
  assert.equal(shouldAutoRecover('TemporaryBan'), false);
  assert.equal(shouldAutoRecover('ClientOutdated'), false);
});

test('status detalhado nunca é o genérico "offline" (item 6)', () => {
  for (const cause of ['ConnectFailure', 'StreamReplaced', 'ClientOutdated', 'LoggedOut', 'TemporaryBan'] as const) {
    const text = wahaDownDetail(cause, null, 'FAILED');
    assert.ok(!/^offline$/i.test(text.trim()));
    assert.ok(text.length > 10);
  }
  assert.match(wahaDownDetail(null, 'motivo x', 'STOPPED'), /STOPPED/);
});
