const PLAN_CATALOG = Object.freeze({
  essential: Object.freeze({ name: 'Gaviões Essential', valueCents: 8990 }),
  performance: Object.freeze({ name: 'Gaviões Performance', valueCents: 11990 }),
  black: Object.freeze({ name: 'Gaviões Black', valueCents: 14990 }),
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
