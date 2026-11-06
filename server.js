const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { request: httpsRequest } = require('node:https');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const PUSHINPAY_API = process.env.PUSHINPAY_API_URL || 'https://api.pushinpay.com.br';
const PUSHINPAY_TOKEN = process.env.PUSHINPAY_TOKEN;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
const MAX_BODY = 100_000;

if (!PUSHINPAY_TOKEN) {
  console.warn('[PushinPay] Defina PUSHINPAY_TOKEN antes de usar pagamentos reais.');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
};

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(data);
}

function readBody(req) {
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
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw Object.assign(new Error('JSON inválido.'), { status: 400 });
  }
}

function pushinpay(pathname, options = {}) {
  if (!PUSHINPAY_TOKEN) {
    throw Object.assign(new Error('PUSHINPAY_TOKEN não configurado no backend.'), { status: 503 });
  }

  return new Promise((resolve, reject) => {
    const target = new URL(pathname, PUSHINPAY_API);
    const body = options.body || '';
    const request = httpsRequest(target, {
      method: options.method || 'GET',
      headers: {
        Authorization: `Bearer ${PUSHINPAY_TOKEN}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...(options.headers || {}),
      },
      timeout: 15_000,
    }, response => {
      let text = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { text += chunk; });
      response.on('end', () => {
        let data;
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(Object.assign(new Error(`PushinPay ${response.statusCode}`), {
            status: response.statusCode,
            data,
          }));
          return;
        }
        resolve(data);
      });
    });
    request.on('timeout', () => request.destroy(new Error('Tempo esgotado na PushinPay.')));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

async function handlePayment(req, res, pathname) {
  if (req.method === 'POST' && pathname === '/api/payments/pix') {
    const body = await readJson(req);
    const cents = Math.round(Number(body.value) * 100);
    if (!Number.isInteger(cents) || cents < 50) {
      return json(res, 422, { error: 'Valor Pix inválido.' });
    }
    const charge = await pushinpay('/api/pix/cashIn', {
      method: 'POST',
      body: JSON.stringify({
        value: cents,
        description: String(body.description || 'Matrícula Academia Gaviões').slice(0, 255),
        webhook_url: PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL.replace(/\/$/, '')}/api/payments/pix/webhook` : null,
        split_rules: [],
      }),
    });
    return json(res, 200, {
      id: charge.id,
      status: charge.status,
      qr_code: charge.qr_code,
      qr_code_base64: charge.qr_code_base64,
    });
  }

  // A PushinPay envia eventos por POST, mas o painel pode validar a URL por GET.
  if (req.method === 'GET' && pathname === '/api/payments/pix/webhook') {
    return json(res, 200, { ok: true, endpoint: 'pushinpay-webhook' });
  }

  if (req.method === 'GET' && pathname.startsWith('/api/payments/pix/')) {
    const id = pathname.split('/').pop();
    if (!/^[a-f0-9-]{20,}$/i.test(id)) {
      return json(res, 400, { error: 'ID de cobrança inválido.' });
    }
    const transaction = await pushinpay(`/api/transactions/${encodeURIComponent(id)}`);
    return json(res, 200, { id: transaction.id, status: transaction.status });
  }

  if (req.method === 'POST' && pathname === '/api/payments/pix/webhook') {
    // A validação do painel pode enviar POST vazio ou sem JSON. Isso não é erro
    // do webhook: respondemos 200 para a PushinPay e processamos JSON quando vier.
    const rawBody = await readBody(req);
    let body = {};
    if (rawBody.trim()) {
      try { body = JSON.parse(rawBody); } catch { body = { raw: rawBody }; }
    }
    console.log('[PushinPay webhook]', JSON.stringify({ id: body.id, status: body.status }));
    return json(res, 200, { received: true });
  }

  return false;
}

function proxyLocations(req, res) {
  return new Promise(async resolve => {
    try {
      const body = await readBody(req);
      const target = new URL('https://www.academiagavioes.com.br/location');
      const request = httpsRequest(target, {
        method: 'POST',
        headers: {
          'Content-Type': req.headers['content-type'] || 'application/x-www-form-urlencoded',
          'User-Agent': 'Gavioes-Units-Proxy/1.0',
          Accept: 'application/json, text/plain, */*',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 15_000,
      }, upstream => {
        const chunks = [];
        upstream.on('data', chunk => chunks.push(chunk));
        upstream.on('end', () => {
          const data = Buffer.concat(chunks);
          res.writeHead(upstream.statusCode || 502, {
            'content-type': upstream.headers['content-type'] || 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'content-length': data.length,
          });
          res.end(data);
          resolve();
        });
      });
      request.on('timeout', () => request.destroy(new Error('Tempo esgotado na busca de unidades.')));
      request.on('error', error => {
        json(res, 502, { error: `Location proxy failed: ${error.message}` });
        resolve();
      });
      request.write(body);
      request.end();
    } catch (error) {
      json(res, error.status || 502, { error: error.message });
      resolve();
    }
  });
}

function safeFilePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = path.resolve(ROOT, relative);
  if (candidate !== ROOT && !candidate.startsWith(`${ROOT}${path.sep}`)) return null;
  return candidate;
}

function resolveStaticFile(pathname) {
  let candidate = safeFilePath(pathname);
  if (!candidate) return null;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  if (!path.extname(candidate)) {
    const indexCandidate = path.join(candidate, 'index.html');
    const htmlCandidate = `${candidate}.html`;
    if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) return indexCandidate;
    if (fs.existsSync(htmlCandidate) && fs.statSync(htmlCandidate).isFile()) return htmlCandidate;
  }
  return null;
}

function serveStatic(req, res, pathname) {
  const filename = resolveStaticFile(pathname) || path.join(ROOT, '404.html');
  if (!fs.existsSync(filename)) return json(res, 404, { error: 'Página não encontrada.' });
  const body = fs.readFileSync(filename);
  const status = filename.endsWith('404.html') && !resolveStaticFile(pathname) ? 404 : 200;
  const noCache = pathname === '/painel' || pathname.startsWith('/painel/');
  res.writeHead(status, {
    'content-type': MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream',
    'content-length': body.length,
    ...(noCache ? { 'cache-control': 'no-cache, max-age=0, must-revalidate' } : {}),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-methods': 'POST,GET,OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      return res.end();
    }
    if (req.method === 'POST' && pathname === '/api/capture-agenda') {
      const body = await readBody(req);
      fs.writeFileSync(path.join(ROOT, 'agenda-capture.json'), body);
      return res.writeHead(204).end();
    }
    if (req.method === 'POST' && pathname === '/api/locations') return proxyLocations(req, res);
    if (pathname.startsWith('/api/')) {
      const handled = await handlePayment(req, res, pathname);
      if (handled !== false) return handled;
      return json(res, 404, { error: 'Endpoint não encontrado.' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Método não permitido.' });
    return serveStatic(req, res, pathname);
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, { error: error.message, data: error.data || null });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Site + Pix Gaviões em http://0.0.0.0:${PORT}`);
});
