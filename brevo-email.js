const fs = require('node:fs');
const path = require('node:path');
const { request: httpsRequest } = require('node:https');

const BREVO_API_URL = (process.env.BREVO_API_URL || 'https://api.brevo.com').replace(/\/+$/, '');
const BREVO_API_KEY = String(process.env.BREVO_API_KEY || '').trim();
const BREVO_SENDER_EMAIL = String(process.env.BREVO_SENDER_EMAIL || '').trim();
const BREVO_SENDER_NAME = String(process.env.BREVO_SENDER_NAME || 'Academia Gaviões').trim();
const BREVO_REPLY_TO = String(process.env.BREVO_REPLY_TO || BREVO_SENDER_EMAIL).trim();
const SUPPORT_URL = String(process.env.BREVO_SUPPORT_URL || 'https://wa.me/5511922214270').trim();
const TEMPLATE_PATH = path.join(__dirname, 'pagamento-confirmado.html');

function configured() {
  return Boolean(BREVO_API_KEY && BREVO_SENDER_EMAIL);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function formatAmount(valueCents) {
  return (Number(valueCents || 0) / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

function renderTemplate(order) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const values = {
    customer_name: escapeHtml(order.name),
    unit_name: escapeHtml(order.unit_name),
    plan_name: escapeHtml(order.plan_name),
    confirmed_at: escapeHtml(formatDate(order.paid_at)),
    amount_paid: escapeHtml(formatAmount(order.value_cents)),
    transaction_id: escapeHtml(order.charge_id || order.id),
    support_url: escapeHtml(SUPPORT_URL),
  };
  return template.replace(/\{\{([a-z_]+)\}\}/g, (_, key) => values[key] ?? '');
}

function brevoRequest(payload) {
  return new Promise((resolve, reject) => {
    let target;
    try { target = new URL('/v3/smtp/email', `${BREVO_API_URL}/`); }
    catch { reject(new Error('BREVO_API_URL inválida.')); return; }
    const body = JSON.stringify(payload);
    const request = httpsRequest(target, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      },
      timeout: 15_000,
    }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => {
        let data = {};
        try { data = JSON.parse(text || '{}'); } catch {}
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(data.message || `Brevo respondeu HTTP ${response.statusCode}.`);
          error.status = response.statusCode;
          error.code = 'BREVO_RESPONSE';
          reject(error);
          return;
        }
        resolve(data);
      });
    });
    request.on('timeout', () => request.destroy(Object.assign(new Error('Tempo esgotado na API da Brevo.'), { code: 'ETIMEDOUT' })));
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function sendPaymentConfirmation(order) {
  if (!configured()) {
    throw Object.assign(new Error('Brevo não configurado. Defina BREVO_API_KEY e BREVO_SENDER_EMAIL.'), { code: 'BREVO_NOT_CONFIGURED' });
  }
  if (!order?.email) throw Object.assign(new Error('Pedido sem e-mail de destinatário.'), { code: 'BREVO_RECIPIENT_MISSING' });
  const payload = {
    sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
    to: [{ email: order.email, name: order.name }],
    replyTo: { email: BREVO_REPLY_TO, name: BREVO_SENDER_NAME },
    subject: 'Pagamento confirmado | Academia Gaviões',
    htmlContent: renderTemplate(order),
    tags: ['gavioes', 'pagamento-confirmado'],
  };
  return brevoRequest(payload);
}

module.exports = { configured, sendPaymentConfirmation };
