const crypto = require('node:crypto');
const { request: httpsRequest } = require('node:https');
const database = require('./database');
const adminApi = require('./admin-api');
const { getPlanCatalog, digits, isValidCpf, normalizeProviderStatus } = require('./payment-rules');
const { configured: brevoConfigured, sendPaymentConfirmation } = require('./brevo-email');

const PUSHINPAY_API = (process.env.PUSHINPAY_API_URL || 'https://api.pushinpay.com.br').replace(/\/+$/, '');
const PUSHINPAY_TOKEN = process.env.PUSHINPAY_TOKEN || '';
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
const MAX_BODY = 100_000;
const TERMS_VERSION = 'checkout-2026-11-06-premium-v1';

function json(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(data),
  });
  res.end(data);
}

function readJson(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    return Promise.reject(Object.assign(new Error('Envie os dados em JSON.'), { status: 415 }));
  }
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY) {
        reject(Object.assign(new Error('Payload muito grande.'), { status: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(Object.assign(new Error('JSON inválido.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function publicWebhookUrl() {
  if (!PUBLIC_BASE_URL) return '';
  try {
    const base = new URL(PUBLIC_BASE_URL);
    if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) return '';
    return new URL('/api/payments/pix/webhook', base).toString();
  } catch {
    return '';
  }
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return req.headers['sec-fetch-site'] !== 'cross-site';
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwarded || (req.socket.encrypted ? 'https' : 'http');
  try { return new URL(origin).origin.toLowerCase() === `${protocol}://${String(req.headers.host || '').toLowerCase()}`; }
  catch { return false; }
}

function requestIpHash(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(value => value.trim()).filter(Boolean);
  const ip = forwarded.at(-1) || req.socket.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex');
}

async function allowPaymentRequest(req) {
  const key = requestIpHash(req);
  const result = await database.query(`
    INSERT INTO payment_request_limits (ip_hash, attempts, window_started_at)
    VALUES ($1, 1, NOW())
    ON CONFLICT (ip_hash) DO UPDATE SET
      attempts = CASE
        WHEN payment_request_limits.window_started_at < NOW() - INTERVAL '10 minutes' THEN 1
        ELSE payment_request_limits.attempts + 1
      END,
      window_started_at = CASE
        WHEN payment_request_limits.window_started_at < NOW() - INTERVAL '10 minutes' THEN NOW()
        ELSE payment_request_limits.window_started_at
      END
    RETURNING attempts
  `, [key]);
  return Number(result.rows[0]?.attempts || 0) <= 60;
}

function validCustomer(body) {
  const customer = body.customer && typeof body.customer === 'object' ? body.customer : {};
  const name = String(customer.name || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  const email = String(customer.email || '').trim().toLowerCase().slice(0, 254);
  const cpf = digits(customer.cpf);
  let phone = digits(customer.phone);
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith('55')) phone = phone.slice(2);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  if (name.split(' ').filter(Boolean).length < 2) return { error: 'Informe nome e sobrenome.' };
  if (!validEmail) return { error: 'Informe um e-mail válido.' };
  if (!isValidCpf(cpf)) return { error: 'Informe um CPF válido.' };
  if (phone.length !== 10 && phone.length !== 11) return { error: 'Informe um celular com DDD.' };
  return { name, email, cpf, phone };
}

async function providerRequest(pathname, options = {}) {
  if (!PUSHINPAY_TOKEN) {
    throw Object.assign(new Error('PushinPay não configurado.'), { status: 503, code: 'PUSHINPAY_NOT_CONFIGURED' });
  }
  return new Promise((resolve, reject) => {
    let target;
    try { target = new URL(pathname, `${PUSHINPAY_API}/`); }
    catch { reject(Object.assign(new Error('Configuração de API inválida.'), { status: 503 })); return; }
    const body = options.body || '';
    const request = httpsRequest(target, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${PUSHINPAY_TOKEN}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
      timeout: 15_000,
    }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => {
        let data;
        try { data = JSON.parse(text); } catch { data = {}; }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(Object.assign(new Error('Falha na API de pagamentos.'), { status: response.statusCode, code: 'PUSHINPAY_RESPONSE' }));
          return;
        }
        resolve(data);
      });
    });
    request.on('timeout', () => request.destroy(Object.assign(new Error('Tempo esgotado na API de pagamentos.'), { code: 'ETIMEDOUT' })));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function getProviderTransaction(chargeId) {
  const encoded = encodeURIComponent(chargeId);
  const paths = [`/api/transactions/${encoded}`, `/api/transaction/${encoded}`, `/transaction/${encoded}`];
  let lastError;
  for (let index = 0; index < paths.length; index += 1) {
    try {
      return await providerRequest(paths[index]);
    } catch (error) {
      lastError = error;
      if (![404, 405].includes(Number(error.status)) || index === paths.length - 1) throw error;
    }
  }
  throw lastError || new Error('Transação não encontrada.');
}

function asChargeResponse(row) {
  return {
    id: row.charge_id,
    status: row.status === 'pending' ? 'created' : row.status,
    value: Number(row.value_cents),
    qr_code: row.pix_code,
    qr_code_base64: row.qr_code_base64,
  };
}

function matchesOrder(row, input, unitId, unitName, planId) {
  return row.name === input.name && row.email === input.email && row.cpf === input.cpf &&
    row.phone === input.phone && row.unit_id === unitId && row.unit_name === unitName && row.plan_id === planId;
}

async function existingCharge(res, row, input, unitId, unitName, planId) {
  if (!matchesOrder(row, input, unitId, unitName, planId)) {
    return json(res, 409, { error: 'Esta tentativa já está vinculada a outro pedido. Atualize a página e tente novamente.' });
  }
  if (row.charge_id && row.pix_code) return json(res, 200, asChargeResponse(row));
  return json(res, 409, { error: 'A cobrança já está sendo processada. Aguarde alguns instantes antes de tentar novamente.' });
}

async function createPix(req, res) {
  if (!sameOrigin(req)) return json(res, 403, { error: 'Origem da solicitação não permitida.' });
  if (!database.isReady()) return json(res, 503, { error: 'Banco PostgreSQL não está conectado.' });
  if (!await allowPaymentRequest(req)) return json(res, 429, { error: 'Muitas solicitações. Aguarde alguns minutos e tente novamente.' });
  if (!PUSHINPAY_TOKEN) return json(res, 503, { error: 'Configure PUSHINPAY_TOKEN no servidor.' });
  const webhookUrl = publicWebhookUrl();
  if (!webhookUrl) return json(res, 503, { error: 'Configure PUBLIC_BASE_URL com o domínio HTTPS do site.' });

  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'Dados de cobrança inválidos.' });
  if (body.paymentMethod !== 'pix') return json(res, 422, { error: 'No momento, o checkout aceita somente Pix.' });
  if (body.reviewed !== true || body.contractAccepted !== true) {
    return json(res, 422, { error: 'Confirme os dados e aceite o termo antes de gerar o Pix.' });
  }
  const planId = String(body.planId || '');
  const customer = validCustomer(body);
  if (customer.error) return json(res, 422, { error: customer.error });
  const unitId = String(body.unitId || '').trim().slice(0, 120);
  const unitName = String(body.unitName || '').trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(unitId) || !unitName) return json(res, 422, { error: 'Unidade inválida.' });
  const catalog = getPlanCatalog(unitId, unitName);
  if (!catalog) return json(res, 422, { error: 'A unidade informada não confere com o cadastro.' });
  const plan = catalog[planId];
  if (!plan) return json(res, 422, { error: 'Esta opção não está disponível para a unidade escolhida.' });
  const requestId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId || '')
    ? String(body.requestId).toLowerCase()
    : crypto.randomUUID();

  const byRequest = await database.query('SELECT * FROM admin_orders WHERE request_id = $1', [requestId]);
  if (byRequest.rowCount) return existingCharge(res, byRequest.rows[0], customer, unitId, unitName, planId);

  const active = await database.query(`
    SELECT * FROM admin_orders
    WHERE cpf = $1 AND email = $2 AND phone = $3 AND unit_id = $4 AND plan_id = $5
      AND (
        (status = 'pending' AND created_at > NOW() - INTERVAL '30 minutes') OR
        (status = 'creating' AND created_at > NOW() - INTERVAL '24 hours') OR
        (status = 'paid' AND created_at > NOW() - INTERVAL '24 hours')
      )
    ORDER BY created_at DESC LIMIT 1
  `, [customer.cpf, customer.email, customer.phone, unitId, planId]);
  if (active.rowCount) return existingCharge(res, active.rows[0], customer, unitId, unitName, planId);

  const orderId = crypto.randomUUID();
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 400);
  try {
    await database.query(`
      INSERT INTO admin_orders (
        id, request_id, status, name, email, cpf, phone, unit_id, unit_name,
        plan_id, plan_name, value_cents, device, accepted_terms_at, terms_version
      ) VALUES ($1, $2, 'creating', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13)
    `, [orderId, requestId, customer.name, customer.email, customer.cpf, customer.phone,
      unitId, unitName, planId, plan.name, plan.valueCents, userAgent, TERMS_VERSION]);
  } catch (error) {
    if (error.code === '23505') return json(res, 409, { error: 'Já existe uma tentativa igual sendo processada. Aguarde e tente novamente.' });
    throw error;
  }

  let charge;
  try {
    const description = `Contratação ${plan.name} - ${unitName}`.slice(0, 255);
    charge = await providerRequest('/api/pix/cashIn', {
      method: 'POST',
      body: JSON.stringify({ value: plan.valueCents, description, webhook_url: webhookUrl, split_rules: [] }),
    });
    const chargeId = String(charge.id || '');
    const qrCode = String(charge.qr_code || '');
    const qrBase64 = String(charge.qr_code_base64 || '');
    const providerValue = charge.value == null ? plan.valueCents : Number(charge.value);
    if (!chargeId || !qrCode || !qrBase64 || providerValue !== plan.valueCents) {
      throw Object.assign(new Error('Resposta inválida do provedor.'), { code: 'INVALID_PAYMENT_RESPONSE' });
    }
    const status = normalizeProviderStatus(charge.status) || 'pending';
    await database.query(`
      UPDATE admin_orders
      SET charge_id = $1, status = $2, pix_code = $3, qr_code_base64 = $4,
          paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE paid_at END, updated_at = NOW()
      WHERE id = $5
    `, [chargeId, status, qrCode, qrBase64, orderId]);
    adminApi.publishOrder(orderId, 'new_order').catch(error => console.warn('[Admin order] evento não enviado:', error.code || error.name || 'erro'));
    if (status === 'paid') {
      adminApi.publishOrder(orderId, 'payment_confirmed').catch(() => {});
      sendConfirmationEmailIfNeeded(orderId).catch(() => {});
    }
    return json(res, 200, {
      id: chargeId,
      status: charge.status || 'created',
      value: plan.valueCents,
      qr_code: qrCode,
      qr_code_base64: qrBase64,
    });
  } catch (error) {
    const definitiveRejection = Number(error.status) >= 400 && Number(error.status) < 500;
    if (definitiveRejection) {
      await database.query("UPDATE admin_orders SET status = 'failed', updated_at = NOW() WHERE id = $1", [orderId]).catch(() => {});
      adminApi.publishOrder(orderId).catch(() => {});
    }
    const status = Number(error.status) === 429 ? 503 : 502;
    return json(res, status, { error: 'Não foi possível criar o Pix agora. Confira a configuração do provedor ou tente novamente.' });
  }
}

async function verifyProviderCharge(chargeId, order) {
  const transaction = await getProviderTransaction(chargeId);
  if (transaction.id && String(transaction.id) !== chargeId) {
    throw Object.assign(new Error('Identificador de cobrança não confere.'), { status: 502 });
  }
  if (transaction.value != null && Number(transaction.value) !== Number(order.value_cents)) {
    throw Object.assign(new Error('Valor da cobrança não confere.'), { status: 409 });
  }
  return transaction;
}

async function sendConfirmationEmailIfNeeded(orderId) {
  if (!brevoConfigured()) {
    console.warn('[Brevo] confirmação não enviada: defina BREVO_API_KEY e BREVO_SENDER_EMAIL.');
    return;
  }
  const claimed = await database.query(`
    UPDATE admin_orders
    SET confirmation_email_sending_at = NOW()
    WHERE id = $1
      AND status = 'paid'
      AND confirmation_email_sent_at IS NULL
      AND (confirmation_email_sending_at IS NULL OR confirmation_email_sending_at < NOW() - INTERVAL '15 minutes')
    RETURNING *
  `, [orderId]);
  if (!claimed.rowCount) return;
  const order = claimed.rows[0];
  try {
    const result = await sendPaymentConfirmation(order);
    await database.query(`
      UPDATE admin_orders
      SET confirmation_email_sent_at = NOW(), confirmation_email_sending_at = NULL, updated_at = NOW()
      WHERE id = $1
    `, [order.id]);
    console.log('[Brevo] confirmação enviada:', order.email, result.messageId || 'ok');
  } catch (error) {
    await database.query('UPDATE admin_orders SET confirmation_email_sending_at = NULL WHERE id = $1', [order.id]).catch(() => {});
    console.warn('[Brevo] confirmação não enviada:', error.code || error.message || 'erro');
  }
}

async function checkPix(req, res, chargeId) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(chargeId)) return json(res, 400, { error: 'ID de cobrança inválido.' });
  if (!database.isReady()) return json(res, 503, { error: 'Banco PostgreSQL não está conectado.' });
  const found = await database.query(`
    SELECT id, status, value_cents, last_provider_check_at AS "lastProviderCheckAt"
    FROM admin_orders WHERE charge_id = $1
  `, [chargeId]);
  if (!found.rowCount) return json(res, 404, { error: 'Cobrança não encontrada.' });
  const order = found.rows[0];
  if (order.status === 'paid' || order.status === 'failed') return json(res, 200, { id: chargeId, status: order.status });

  const claimed = await database.query(`
    UPDATE admin_orders SET last_provider_check_at = NOW()
    WHERE charge_id = $1 AND status NOT IN ('paid', 'failed')
      AND (last_provider_check_at IS NULL OR last_provider_check_at < NOW() - INTERVAL '5 seconds')
    RETURNING id
  `, [chargeId]);
  if (!claimed.rowCount) return json(res, 200, { id: chargeId, status: order.status });

  try {
    const transaction = await verifyProviderCharge(chargeId, order);
    const updated = await adminApi.transitionChargeOrder(chargeId, transaction.status);
    if (updated?.status === 'paid') sendConfirmationEmailIfNeeded(updated.id).catch(() => {});
    return json(res, 200, { id: chargeId, status: updated?.status || normalizeProviderStatus(transaction.status) || 'pending' });
  } catch (error) {
    const status = Number(error.status) === 429 ? 503 : 502;
    return json(res, status, { error: 'Não foi possível consultar o pagamento agora.' });
  }
}

async function paymentWebhook(req, res) {
  if (!database.isReady()) return json(res, 503, { error: 'Banco PostgreSQL não está conectado.' });
  let body;
  try { body = await readJson(req); }
  catch { return json(res, 400, { error: 'Notificação inválida.' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'Notificação inválida.' });
  const chargeId = String(body.id || body.transaction_id || body.transactionId || body.data?.id || body.transaction?.id || '');
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(chargeId)) return json(res, 400, { error: 'ID de cobrança ausente ou inválido.' });
  const found = await database.query('SELECT id, status, value_cents FROM admin_orders WHERE charge_id = $1', [chargeId]);
  if (!found.rowCount) return json(res, 404, { error: 'Cobrança não encontrada.' });

  try {
    const transaction = await verifyProviderCharge(chargeId, found.rows[0]);
    const updated = await adminApi.transitionChargeOrder(chargeId, transaction.status);
    if (updated?.status === 'paid') sendConfirmationEmailIfNeeded(updated.id).catch(() => {});
    return json(res, 200, { received: true });
  } catch {
    return json(res, 502, { error: 'Não foi possível validar a notificação com o provedor.' });
  }
}

async function handlePayment(req, res, pathname) {
  if (req.method === 'POST' && pathname === '/api/payments/pix') return createPix(req, res);
  if (req.method === 'POST' && pathname === '/api/payments/pix/webhook') return paymentWebhook(req, res);
  if (req.method === 'GET' && pathname === '/api/payments/pix/webhook') return json(res, 200, { ok: true, endpoint: 'pushinpay-webhook' });
  const match = req.method === 'GET' && pathname.match(/^\/api\/payments\/pix\/([^/]+)$/);
  if (match) return checkPix(req, res, decodeURIComponent(match[1]));
  return false;
}

module.exports = { handlePayment };
