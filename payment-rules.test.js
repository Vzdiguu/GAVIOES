const test = require('node:test');
const assert = require('node:assert/strict');
const { PLAN_CATALOG, isValidCpf, normalizeProviderStatus } = require('./payment-rules');
const { allowedPushEndpoint } = require('./admin-api');

test('os preços Pix são definidos no servidor em centavos', () => {
  assert.equal(PLAN_CATALOG.essential.valueCents, 8990);
  assert.equal(PLAN_CATALOG.performance.valueCents, 11990);
  assert.equal(PLAN_CATALOG.black.valueCents, 14990);
  assert.equal(PLAN_CATALOG.unknown, undefined);
});

test('valida CPF antes de gravar uma matrícula', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCpf('123'), false);
});

test('normaliza estados da PushinPay para os estados do painel', () => {
  assert.equal(normalizeProviderStatus('created'), 'pending');
  assert.equal(normalizeProviderStatus('paid'), 'paid');
  assert.equal(normalizeProviderStatus('canceled'), 'expired');
  assert.equal(normalizeProviderStatus('processing'), null);
});

test('aceita endpoints HTTPS de provedores de push conhecidos e bloqueia destinos arbitrários', () => {
  assert.equal(allowedPushEndpoint('https://fcm.googleapis.com/fcm/send/example'), true);
  assert.equal(allowedPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/example'), true);
  assert.equal(allowedPushEndpoint('http://fcm.googleapis.com/send/example'), false);
  assert.equal(allowedPushEndpoint('https://127.0.0.1/internal'), false);
  assert.equal(allowedPushEndpoint('https://attacker.example/endpoint'), false);
});
