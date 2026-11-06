const PLAN_CATALOG = Object.freeze({
  start_monthly: Object.freeze({ name: 'START RECORRENTE MENSAL', valueCents: 8990 }),
  plus_monthly: Object.freeze({ name: 'PLUS MENSAL', valueCents: 14900 }),
  start_annual: Object.freeze({ name: 'START RECORRENTE ANUAL', valueCents: 13900 }),
  plus_annual: Object.freeze({ name: 'PLUS RECORRENTE ANUAL', valueCents: 15900 }),
  day_pass: Object.freeze({ name: '1 ACESSO AVULSO', valueCents: 3000 }),
  bioimpedance_monthly: Object.freeze({ name: 'BIOIMPEDÂNCIA RECORRENTE 1X/MÊS', valueCents: 1990 }),
});

const PREMIUM_PLAN_CATALOG = Object.freeze({
  premium_start_annual: Object.freeze({ name: 'START PREMIUM · ANUAL', valueCents: 24900, monthlyCents: 24900 }),
  premium_start_recurring: Object.freeze({ name: 'START PREMIUM · RECORRENTE MENSAL', valueCents: 25900, monthlyCents: 25900 }),
  premium_plus_annual: Object.freeze({ name: 'PLUS PREMIUM · ANUAL', valueCents: 19900, monthlyCents: 28900 }),
  premium_plus_recurring: Object.freeze({ name: 'PLUS PREMIUM · RECORRENTE MENSAL', valueCents: 30900, monthlyCents: 30900 }),
  premium_day_pass: Object.freeze({ name: 'DIÁRIA · 1 ACESSO AVULSO', valueCents: 6000 }),
  premium_bioimpedance: Object.freeze({ name: 'BIOIMPEDÂNCIA AVULSA', valueCents: 8000 }),
});

const PREMIUM_UNIT_KEYS = Object.freeze({
  spvilaolimpia: 'vilaolimpia',
  sppinheiros: 'pinheiros',
});

function normalizeUnitKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function getPlanCatalog(unitId, unitName) {
  const id = String(unitId ?? '').trim().toLowerCase();
  const unitKey = normalizeUnitKey(unitName);
  const expectedUnitKey = PREMIUM_UNIT_KEYS[id];
  if (expectedUnitKey) return unitKey === expectedUnitKey ? PREMIUM_PLAN_CATALOG : null;
  if (Object.values(PREMIUM_UNIT_KEYS).includes(unitKey)) return null;
  return PLAN_CATALOG;
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function isValidCpf(value) {
  const cpf = digits(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const checkDigit = length => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(cpf[index]) * (length + 1 - index);
    }
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return checkDigit(9) === Number(cpf[9]) && checkDigit(10) === Number(cpf[10]);
}

function normalizeProviderStatus(value) {
  const status = String(value || '').toLowerCase();
  if (status === 'paid') return 'paid';
  if (status === 'created' || status === 'pending') return 'pending';
  if (status === 'canceled' || status === 'cancelled' || status === 'expired') return 'expired';
  if (status === 'failed' || status === 'refunded') return 'failed';
  return null;
}

module.exports = {
  PLAN_CATALOG,
  PREMIUM_PLAN_CATALOG,
  PREMIUM_UNIT_KEYS,
  getPlanCatalog,
  digits,
  isValidCpf,
  normalizeProviderStatus,
};
