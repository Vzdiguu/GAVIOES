const crypto = require('node:crypto');
const webpush = require('web-push');
const database = require('./database');
const { normalizeProviderStatus } = require('./payment-rules');

const COOKIE_NAME = 'gavioes_admin';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 8;
const MAX_ORDERS = 10000;
const sseClients = new Set();
let vapidConfigured = false;

const ORDER_SELECT = `
  SELECT id::text AS id, charge_id AS "chargeId", status, name, email, cpf, phone,
         unit_id AS "unitId", unit_name AS "unitName", plan_id AS "planId",
         plan_name AS plan, value_cents, device, contacted, note,
         created_at AS "createdAt", paid_at AS "paidAt"
  FROM admin_orders
`;

function json(res, status, payload) {
  if (res.headersSent) return;
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(data),
  });
  res.end(data);
}

async function readJson(req) {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('application/json')) {
    throw Object.assign(new Error('Envie os dados em JSON.'), { status: 415 });
  }
  const chunks = [];
  let size = 0;
  await new Promise((resolve, reject) => {
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 50_000) {
        reject(Object.assign(new Error('Dados enviados excedem o limite.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', resolve);
    req.on('error', reject);
  });
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('JSON inválido.'), { status: 400 });
  }
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function cookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const split = part.indexOf('=');
    if (split < 0) continue;
    const name = part.slice(0, split).trim();
    const value = part.slice(split + 1).trim();
    if (name) result[name] = value;
  }
  return result;
}

function tokenFromRequest(req) {
  const token = cookies(req)[COOKIE_NAME] || '';
  return /^[A-Za-z0-9_-]{40,64}$/.test(token) ? token : '';
}

function passwordDigest() {
  const password = process.env.ADMIN_PASSWORD;
  return password ? hash(password) : '';
}

function requestOrigin(req) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwarded || (req.socket.encrypted ? 'https' : 'http');
  const host = String(req.headers.host || '').toLowerCase();
  return host ? `${protocol}://${host}` : '';
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return req.headers['sec-fetch-site'] !== 'cross-site';
  try {
    return new URL(origin).origin.toLowerCase() === requestOrigin(req);
  } catch {
    return false;
  }
}

function setSessionCookie(req, res, token, maxAge) {
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const secure = req.socket.encrypted || forwarded === 'https';
  const value = token
    ? `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
    : `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
  res.setHeader('set-cookie', value);
}

function clientIpHash(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  const ip = forwarded.at(-1) || req.socket.remoteAddress || 'unknown';
  return hash(ip);
}

async function checkLoginLimit(ipHash) {
  const result = await database.query(
    'SELECT attempts, window_started_at FROM admin_login_attempts WHERE ip_hash = $1',
    [ipHash],
  );
  if (!result.rowCount) return true;
  const row = result.rows[0];
  const started = new Date(row.window_started_at).getTime();
  return Date.now() - started >= LOGIN_WINDOW_MS || Number(row.attempts) < MAX_LOGIN_ATTEMPTS;
}

async function recordFailedLogin(ipHash) {
  await database.query(`
    INSERT INTO admin_login_attempts (ip_hash, attempts, window_started_at)
    VALUES ($1, 1, NOW())
    ON CONFLICT (ip_hash) DO UPDATE SET
      attempts = CASE
        WHEN admin_login_attempts.window_started_at < NOW() - INTERVAL '15 minutes' THEN 1
        ELSE admin_login_attempts.attempts + 1
      END,
      window_started_at = CASE
        WHEN admin_login_attempts.window_started_at < NOW() - INTERVAL '15 minutes' THEN NOW()
        ELSE admin_login_attempts.window_started_at
      END
  `, [ipHash]);
}

async function login(req, res) {
  if (!sameOrigin(req)) return json(res, 403, { error: 'Origem da solicitação não permitida.' });
  if (!process.env.ADMIN_PASSWORD) return json(res, 503, { error: 'Configure ADMIN_PASSWORD no ambiente do servidor.' });
  if (!database.isReady()) return json(res, 503, { error: 'Banco PostgreSQL não está conectado.' });

  const ipHash = clientIpHash(req);
  if (!await checkLoginLimit(ipHash)) return json(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' });

  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'Dados de login inválidos.' });
  const supplied = String(body.password || '').slice(0, 1024);
  const suppliedDigest = Buffer.from(hash(supplied), 'hex');
  const expectedDigest = Buffer.from(passwordDigest(), 'hex');
  const valid = supplied.length > 0 && crypto.timingSafeEqual(suppliedDigest, expectedDigest);
  if (!valid) {
    await recordFailedLogin(ipHash);
    return json(res, 401, { error: '401' });
  }

  await database.query('DELETE FROM admin_login_attempts WHERE ip_hash = $1', [ipHash]);
  await database.query('DELETE FROM admin_sessions WHERE expires_at <= NOW()');
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await database.query(
    'INSERT INTO admin_sessions (token_hash, password_digest, expires_at) VALUES ($1, $2, $3)',
    [hash(token), passwordDigest(), expiresAt],
  );
  setSessionCookie(req, res, token, Math.floor(SESSION_TTL_MS / 1000));
  return json(res, 200, { ok: true });
}

async function authenticate(req, res) {
  if (!database.isReady() || !process.env.ADMIN_PASSWORD) {
    json(res, 503, { error: 'Autenticação administrativa não está configurada.' });
    return false;
  }
  const token = tokenFromRequest(req);
  if (!token) {
    json(res, 401, { error: '401' });
    return false;
  }
  const result = await database.query(`
    UPDATE admin_sessions SET last_seen_at = NOW()
    WHERE token_hash = $1 AND password_digest = $2 AND expires_at > NOW()
    RETURNING token_hash
  `, [hash(token), passwordDigest()]);
  if (!result.rowCount) {
    setSessionCookie(req, res, '', 0);
    json(res, 401, { error: '401' });
    return false;
  }
  return true;
}

function panelOrder(row) {
  return {
    id: String(row.id),
    chargeId: String(row.chargeId || ''),
    status: row.status,
    name: row.name || '',
    email: row.email || '',
    cpf: row.cpf || '',
    phone: row.phone || '',
    unitId: row.unitId || '',
    unitName: row.unitName || '',
    planId: row.planId || '',
    plan: row.plan || '',
    value: Number(row.value_cents || 0) / 100,
    device: row.device || '',
    contacted: Boolean(row.contacted),
    note: row.note || '',
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    paidAt: row.paidAt ? (row.paidAt instanceof Date ? row.paidAt.toISOString() : row.paidAt) : null,
  };
}

async function loadOrderById(id) {
  const result = await database.query(`${ORDER_SELECT} WHERE id = $1`, [id]);
  return result.rowCount ? panelOrder(result.rows[0]) : null;
}

function broadcast(eventName, payload) {
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const response of sseClients) {
    try {
      response.write(data);
    } catch {
      sseClients.delete(response);
    }
  }
}

function vapidPublicKey() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return '';
  try {
    if (!vapidConfigured) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      vapidConfigured = true;
    }
    return publicKey;
  } catch {
    return '';
  }
}

function allowedPushEndpoint(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    const providers = [
      'fcm.googleapis.com',
      'push.services.mozilla.com',
      'updates.push.services.mozilla.com',
      'web.push.apple.com',
      'notify.windows.com',
    ];
    return providers.some(provider => host === provider || host.endsWith(`.${provider}`));
  } catch {
    return false;
  }
}

async function sendPush(eventType, order) {
  if (!vapidPublicKey()) return;
  const result = await database.query('SELECT subscription FROM admin_push_subscriptions');
  const notification = eventType === 'payment_confirmed'
    ? { eventId: `${order.id}:payment_confirmed`, type: 'payment_confirmed', title: 'Pagamento confirmado', body: 'Matrícula confirmada', url: '/painel/#matriculas', tag: `${order.id}:paid` }
    : { eventId: `${order.id}:new_order`, type: 'new_order', title: 'Pix gerado', body: 'Matrícula pendente', url: '/painel/#matriculas', tag: `${order.id}:new` };
  const payload = JSON.stringify(notification);
  await Promise.allSettled(result.rows.map(async row => {
    const subscription = row.subscription;
    if (!subscription || !allowedPushEndpoint(subscription.endpoint)) return;
    try {
      await webpush.sendNotification(subscription, payload, { TTL: 60, urgency: 'high' });
    } catch (error) {
      const status = Number(error.statusCode || 0);
      if (status === 404 || status === 410) {
        await database.query('DELETE FROM admin_push_subscriptions WHERE endpoint = $1', [subscription.endpoint]);
      } else {
        console.warn('[WebPush] entrega falhou:', status || 'erro');
      }
    }
  }));
}

async function publishOrder(orderId, pushEvent = '') {
  const order = await loadOrderById(orderId);
  if (!order) return null;
  broadcast('order', order);
  if (pushEvent === 'new_order' || pushEvent === 'payment_confirmed') {
    sendPush(pushEvent, order).catch(error => console.warn('[WebPush] falha:', error.code || error.name || 'erro'));
  }
  return order;
}

async function publishDelete(orderId) {
  broadcast('delete', { id: String(orderId) });
}

async function transitionChargeOrder(chargeId, providerStatus) {
  const status = normalizeProviderStatus(providerStatus);
  if (!status) return null;
  const existing = await database.query(
    'SELECT id, status FROM admin_orders WHERE charge_id = $1',
    [chargeId],
  );
  if (!existing.rowCount) return null;
  const current = existing.rows[0];
  if (current.status === 'paid' || current.status === 'failed') return loadOrderById(current.id);
  if (current.status === 'expired' && status === 'pending') return loadOrderById(current.id);
  if (current.status === status) return loadOrderById(current.id);

  const changed = await database.query(`
    UPDATE admin_orders
    SET status = $1,
        paid_at = CASE WHEN $1 = 'paid' AND paid_at IS NULL THEN NOW() ELSE paid_at END,
        updated_at = NOW()
    WHERE id = $2 AND status <> 'paid' AND status <> $1
    RETURNING id
  `, [status, current.id]);
  if (!changed.rowCount) return loadOrderById(current.id);
  return publishOrder(current.id, status === 'paid' ? 'payment_confirmed' : '');
}

async function orders(req, res) {
  const result = await database.query(`${ORDER_SELECT} WHERE status <> 'creating' ORDER BY created_at DESC LIMIT $1`, [MAX_ORDERS]);
  return json(res, 200, { orders: result.rows.map(panelOrder) });
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s]*[=+@\-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function exportCsv(res) {
  const result = await database.query(`${ORDER_SELECT} WHERE status <> 'creating' ORDER BY created_at DESC`);
  const columns = [
    ['ID', 'id'], ['ID Pix', 'chargeId'], ['Status', 'status'], ['Nome', 'name'],
    ['E-mail', 'email'], ['CPF', 'cpf'], ['Telefone', 'phone'], ['Unidade', 'unitName'],
    ['Plano', 'plan'], ['Valor', 'value_cents'], ['Criado em', 'createdAt'],
    ['Pago em', 'paidAt'], ['Contatado', 'contacted'], ['Observação', 'note'], ['Dispositivo', 'device'],
  ];
  const rows = [columns.map(([label]) => csvCell(label)).join(';')];
  for (const row of result.rows) {
    rows.push(columns.map(([, key]) => csvCell(key === 'value_cents' ? (Number(row.value_cents) / 100).toFixed(2) : row[key])).join(';'));
  }
  const data = `\uFEFF${rows.join('\r\n')}`;
  res.writeHead(200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': 'attachment; filename="matriculas-gavioes.csv"',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(data),
  });
  res.end(data);
}

function closeStreams() {
  for (const response of sseClients) {
    try { response.end(); } catch {}
  }
  sseClients.clear();
}

function stream(req, res) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write('retry: 5000\n: conectado\n\n');
  sseClients.add(res);
  const heartbeat = setInterval(() => {
    try { res.write(': keepalive\n\n'); } catch { cleanup(); }
  }, 25000);
  heartbeat.unref?.();
  const cleanup = () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  };
  req.on('close', cleanup);
  res.on('close', cleanup);
}

async function pushSubscription(req, res) {
  if (!sameOrigin(req)) return json(res, 403, { error: 'Origem da solicitação não permitida.' });
  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'Dados de notificação inválidos.' });
  const action = String(body.action || '');
  if (action === 'unsubscribe') {
    const endpoint = String(body.endpoint || '');
    if (!allowedPushEndpoint(endpoint)) return json(res, 422, { error: 'Endpoint de notificação inválido.' });
    await database.query('DELETE FROM admin_push_subscriptions WHERE endpoint = $1', [endpoint]);
    return json(res, 200, { ok: true });
  }
  if (action !== 'subscribe') return json(res, 400, { error: 'Ação de notificação inválida.' });
  const subscription = body.subscription;
  const endpoint = String(subscription?.endpoint || '');
  const p256dh = String(subscription?.keys?.p256dh || '');
  const auth = String(subscription?.keys?.auth || '');
  if (!allowedPushEndpoint(endpoint) || p256dh.length < 20 || p256dh.length > 256 || auth.length < 8 || auth.length > 128) {
    return json(res, 422, { error: 'Inscrição de notificação inválida.' });
  }
  await database.query(`
    INSERT INTO admin_push_subscriptions (endpoint, subscription)
    VALUES ($1, $2::jsonb)
    ON CONFLICT (endpoint) DO UPDATE SET subscription = EXCLUDED.subscription, updated_at = NOW()
  `, [endpoint, JSON.stringify({ endpoint, keys: { p256dh, auth } })]);
  return json(res, 200, { ok: true });
}

async function updateOrder(req, res, orderId, deleteAction) {
  if (!sameOrigin(req)) return json(res, 403, { error: 'Origem da solicitação não permitida.' });
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json(res, 404, { error: 'Matrícula não encontrada.' });
  if (deleteAction) {
    const found = await database.query('SELECT status FROM admin_orders WHERE id = $1', [orderId]);
    if (!found.rowCount) return json(res, 404, { error: 'Matrícula não encontrada.' });
    if (found.rows[0].status === 'paid') return json(res, 409, { error: 'Matrículas pagas não podem ser excluídas pelo painel.' });
    await database.query('DELETE FROM admin_orders WHERE id = $1', [orderId]);
    await publishDelete(orderId);
    return json(res, 200, { ok: true });
  }

  const body = await readJson(req);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'Dados de alteração inválidos.' });
  const sets = [];
  const values = [];
  if (Object.hasOwn(body, 'contacted')) {
    if (typeof body.contacted !== 'boolean') return json(res, 422, { error: 'O campo contato precisa ser verdadeiro ou falso.' });
    values.push(body.contacted);
    sets.push(`contacted = $${values.length}`);
  }
  if (Object.hasOwn(body, 'note')) {
    if (typeof body.note !== 'string' || body.note.length > 2000) return json(res, 422, { error: 'A observação pode ter até 2.000 caracteres.' });
    values.push(body.note.trim());
    sets.push(`note = $${values.length}`);
  }
  if (!sets.length) return json(res, 400, { error: 'Nenhuma alteração enviada.' });
  values.push(orderId);
  const result = await database.query(
    `UPDATE admin_orders SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length} AND status <> 'creating' RETURNING id`,
    values,
  );
  if (!result.rowCount) return json(res, 404, { error: 'Matrícula não encontrada.' });
  const order = await publishOrder(orderId);
  return json(res, 200, { ok: true, order });
}

async function handle(req, res, pathname) {
  if (!pathname.startsWith('/api/admin')) return false;
  try {
    if (pathname === '/api/admin/login' && req.method === 'POST') return await login(req, res);
    if (pathname === '/api/admin/logout' && req.method === 'POST') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Origem da solicitação não permitida.' });
      const token = tokenFromRequest(req);
      if (token && database.isReady()) await database.query('DELETE FROM admin_sessions WHERE token_hash = $1', [hash(token)]);
      setSessionCookie(req, res, '', 0);
      return json(res, 200, { ok: true });
    }

    if (!await authenticate(req, res)) return true;
    if (pathname === '/api/admin/orders' && req.method === 'GET') return await orders(req, res);
    if (pathname === '/api/admin/stream' && req.method === 'GET') return stream(req, res);
    if (pathname === '/api/admin/export.csv' && req.method === 'GET') return await exportCsv(res);
    if (pathname === '/api/admin/push/vapid-public-key' && req.method === 'GET') {
      const publicKey = vapidPublicKey();
      if (!publicKey) return json(res, 503, { error: 'Configure VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT no servidor.' });
      return json(res, 200, { publicKey });
    }
    if (pathname === '/api/admin/push/subscriptions' && req.method === 'POST') return await pushSubscription(req, res);

    const orderRoute = pathname.match(/^\/api\/admin\/orders\/([0-9a-f-]{36})(\/delete)?$/i);
    if (orderRoute && req.method === 'POST') return await updateOrder(req, res, orderRoute[1], Boolean(orderRoute[2]));
    return json(res, 404, { error: 'Endpoint administrativo não encontrado.' });
  } catch (error) {
    console.error('[Admin API]', error.code || error.name || 'erro');
    const status = Number(error.status) >= 400 && Number(error.status) < 500 ? Number(error.status) : (error.status === 503 ? 503 : 500);
    const message = error.status ? error.message : 'Erro interno do painel.';
    return json(res, status, { error: message });
  }
}

module.exports = {
  handle,
  publishOrder,
  publishDelete,
  closeStreams,
  transitionChargeOrder,
  panelOrder,
  allowedPushEndpoint,
};
