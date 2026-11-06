const PLAN_CATALOG = Object.freeze({
  start_monthly: Object.freeze({ name: 'START RECORRENTE MENSAL', valueCents: 11990 }),
  plus_monthly: Object.freeze({ name: 'PLUS MENSAL', valueCents: 14900 }),
  start_annual: Object.freeze({ name: 'START RECORRENTE ANUAL', valueCents: 13900 }),
  plus_annual: Object.freeze({ name: 'PLUS RECORRENTE ANUAL', valueCents: 15900 }),
  day_pass: Object.freeze({ name: '1 ACESSO AVULSO', valueCents: 3000 }),
  bioimpedance_monthly: Object.freeze({ name: 'BIOIMPEDÂNCIA RECORRENTE 1X/MÊS', valueCents: 1990 }),
});

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

module.exports = { PLAN_CATALOG, digits, isValidCpf, normalizeProviderStatus };
