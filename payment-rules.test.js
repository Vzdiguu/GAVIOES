const test = require('node:test');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PLAN_CATALOG, isValidCpf, normalizeProviderStatus } = require('./payment-rules');
const { allowedPushEndpoint } = require('./admin-api');

test('os seis produtos usam os preços oficiais do catálogo no servidor em centavos', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(PLAN_CATALOG).map(([id,plan])=>[id,plan.valueCents])), {
    start_monthly:11990, plus_monthly:14900, start_annual:13900,
    plus_annual:15900, day_pass:3000, bioimpedance_monthly:1990,
  });
  assert.equal(PLAN_CATALOG.unknown, undefined);
});

test('checkout e backend mantêm preços, ordem e destaque inicial sincronizados', () => {
  const source = fs.readFileSync(require.resolve('./matricula.js'), 'utf8');
  const start = source.indexOf('  const plans = [');
  const end = source.indexOf('  const params =', start);
  const plans = source.slice(start, end);
  const ids = [...plans.matchAll(/\bid:'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(ids, ['start_monthly','plus_monthly','start_annual','plus_annual','day_pass','bioimpedance_monthly']);
  for (const id of ids) {
    const tail = plans.slice(plans.indexOf(`id:'${id}'`));
    const object = tail.slice(0, tail.indexOf('\n    },'));
    const cents = Math.round(Number(object.match(/value:([0-9.]+)/)[1]) * 100);
    assert.equal(cents, PLAN_CATALOG[id].valueCents, `preço divergente para ${id}`);
  }
  assert.match(plans, /id:'start_monthly'[^}]*featured:true/s);
  assert.match(source, /const defaultPlan=plans\[0\]/);
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
