const test = require('node:test');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {
  PLAN_CATALOG,
  PREMIUM_PLAN_CATALOG,
  getPlanCatalog,
  isValidCpf,
  normalizeProviderStatus,
} = require('./payment-rules');
const { allowedPushEndpoint } = require('./admin-api');

function frontendPlans(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(start, -1, `marcador ausente: ${startMarker}`);
  assert.notEqual(end, -1, `marcador ausente: ${endMarker}`);
  return source.slice(start, end);
}

function assertPriceParity(block, catalog, expectedIds) {
  const ids = [...block.matchAll(/\bid:'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(ids, expectedIds);
  for (const id of ids) {
    const start = block.indexOf(`id:'${id}'`);
    const next = block.indexOf('\n    },', start);
    const object = block.slice(start, next === -1 ? block.length : next);
    const value = Number(object.match(/\bvalue:([0-9.]+)/)?.[1]);
    assert.ok(Number.isFinite(value), `valor ausente para ${id}`);
    assert.equal(Math.round(value * 100), catalog[id].valueCents, `preço divergente para ${id}`);
  }
}

test('os seis produtos regulares mantêm os preços oficiais do catálogo em centavos', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(PLAN_CATALOG).map(([id, plan]) => [id, plan.valueCents])), {
    start_monthly: 8990,
    plus_monthly: 14900,
    start_annual: 13900,
    plus_annual: 15900,
    day_pass: 3000,
    bioimpedance_monthly: 1990,
  });
  assert.equal(PLAN_CATALOG.unknown, undefined);
});

test('unidades Premium usam os seis valores informados e o PLUS anual cobra R$ 199 no primeiro Pix', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(PREMIUM_PLAN_CATALOG).map(([id, plan]) => [id, plan.valueCents])), {
    premium_start_annual: 24900,
    premium_start_recurring: 25900,
    premium_plus_annual: 19900,
    premium_plus_recurring: 30900,
    premium_day_pass: 6000,
    premium_bioimpedance: 8000,
  });
  assert.equal(PREMIUM_PLAN_CATALOG.premium_plus_annual.monthlyCents, 28900);
  assert.equal(PREMIUM_PLAN_CATALOG.unknown, undefined);
});

test('Vila Olímpia e Pinheiros recebem somente o catálogo Premium; demais unidades ficam no catálogo regular', () => {
  assert.equal(getPlanCatalog('spvilaolimpia', 'Vila Olímpia'), PREMIUM_PLAN_CATALOG);
  assert.equal(getPlanCatalog('spvilaolimpia', 'Vilaolimpia'), PREMIUM_PLAN_CATALOG);
  assert.equal(getPlanCatalog('sppinheiros', 'Pinheiros'), PREMIUM_PLAN_CATALOG);
  assert.equal(getPlanCatalog('spitaim', 'Itaim'), PLAN_CATALOG);
  assert.equal(getPlanCatalog('spvilaolimpia', 'Pinheiros'), null);
  assert.equal(getPlanCatalog('sppinheiros', 'Vila Olímpia'), null);
  assert.equal(getPlanCatalog('spoutro', 'Pinheiros'), null);
});

test('cards do checkout correspondem aos dois catálogos server-side e destacam START Premium', () => {
  const source = fs.readFileSync(require.resolve('./matricula.js'), 'utf8');
  const regular = frontendPlans(source, 'const standardPlans = [', 'const premiumPlansForUnit');
  const premium = frontendPlans(source, 'const premiumPlansForUnit', 'const params =');
  assertPriceParity(regular, PLAN_CATALOG, [
    'start_monthly', 'plus_monthly', 'start_annual', 'plus_annual', 'day_pass', 'bioimpedance_monthly',
  ]);
  assertPriceParity(premium, PREMIUM_PLAN_CATALOG, [
    'premium_start_recurring', 'premium_start_annual', 'premium_plus_recurring',
    'premium_plus_annual', 'premium_day_pass', 'premium_bioimpedance',
  ]);
  assert.match(premium, /id:'premium_start_recurring'.*featured:true/s);
  assert.match(premium, /1º mês: R\$ 199,00/);
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
