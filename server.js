const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { request: httpsRequest } = require('node:https');
const database = require('./database');
const adminApi = require('./admin-api');
const paymentApi = require('./payment-api');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const MAX_BODY = 100_000;


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

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return req.headers['sec-fetch-site'] !== 'cross-site';
  const forwarded = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwarded || (req.socket.encrypted ? 'https' : 'http');
  try { return new URL(origin).origin.toLowerCase() === `${protocol}://${String(req.headers.host || '').toLowerCase()}`; }
  catch { return false; }
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
      request.on('error', () => {
        json(res, 502, { error: 'Falha ao consultar unidades.' });
        resolve();
      });
      request.write(body);
      request.end();
    } catch (error) {
      json(res, error.status || 502, { error: error.status ? error.message : 'Falha ao consultar unidades.' });
      resolve();
    }
  });
}

const PRIVATE_STATIC_FILES = new Set([
  'server.js', 'database.js', 'admin-api.js', 'payment-api.js', 'payment-rules.js',
  'package.json', 'package-lock.json', 'agenda-capture.json',
]);

function isPrivateStaticPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return true; }
  const parts = decoded.split('/').filter(Boolean).map(part => part.toLowerCase());
  if (parts.some(part => part === '.git' || part === 'node_modules' || part === 'backend' || part === 'test' || part === 'tests')) return true;
  if (parts.some(part => part.startsWith('.env') || (part.startsWith('.') && part !== '.well-known'))) return true;
  const basename = parts.at(-1) || '';
  if (PRIVATE_STATIC_FILES.has(basename)) return true;
  if (/\.(sql|lock|log|map)$/i.test(basename)) return true;
  return false;
}

function safeFilePath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = path.resolve(ROOT, relative);
  if (candidate !== ROOT && !candidate.startsWith(`${ROOT}${path.sep}`)) return null;
  return candidate;
}

function resolveStaticFile(pathname) {
  if (isPrivateStaticPath(pathname)) return null;
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
  const ext = path.extname(filename).toLowerCase();
  let body = fs.readFileSync(filename);
  if (ext === '.html') {
    let html = body.toString('utf8');
    if (!html.includes('site-input-no-auto-zoom')) {
      const style = '<style id="site-input-no-auto-zoom">input,select,textarea{font-size:16px!important}</style>';
      html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${style}\n</head>`) : `${style}\n${html}`;
      body = Buffer.from(html, 'utf8');
    }
  }
  const status = filename.endsWith('404.html') && !resolveStaticFile(pathname) ? 404 : 200;
  const noCache = ext === '.html' || pathname === '/painel' || pathname.startsWith('/painel/');
  res.writeHead(status, {
    'content-type': MIME_TYPES[ext] || 'application/octet-stream',
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
      if (process.env.ENABLE_AGENDA_CAPTURE !== 'true' || !sameOrigin(req)) return json(res, 404, { error: 'Endpoint não encontrado.' });
      const body = await readBody(req);
      fs.writeFileSync(path.join(ROOT, 'agenda-capture.json'), body);
      return res.writeHead(204).end();
    }
    if (req.method === 'POST' && pathname === '/api/locations') {
      if (!sameOrigin(req)) return json(res, 403, { error: 'Origem da solicitação não permitida.' });
      return proxyLocations(req, res);
    }
    if (pathname === '/api/admin' || pathname.startsWith('/api/admin/')) {
      await adminApi.handle(req, res, pathname);
      return;
    }
    if (pathname.startsWith('/api/')) {
      const handled = await paymentApi.handlePayment(req, res, pathname);
      if (handled !== false) return handled;
      return json(res, 404, { error: 'Endpoint não encontrado.' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Método não permitido.' });
    return serveStatic(req, res, pathname);
  } catch (error) {
    console.error('[HTTP]', error.code || error.name || 'erro');
    return json(res, error.status || 500, { error: error.status ? error.message : 'Erro interno do servidor.' });
  }
});

async function startServer() {
  if (process.env.DATABASE_URL) {
    await database.initialize();
    console.log('[Database] PostgreSQL conectado e esquema administrativo aplicado.');
  } else {
    console.warn('[Database] DATABASE_URL ausente; painel e pagamentos permanecem indisponíveis.');
  }
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Site Gaviões em 0.0.0.0:${PORT}`);
  });
}

startServer().catch(error => {
  console.error('[Startup] Falha ao conectar/inicializar PostgreSQL:', error.code || error.name || 'erro');
  process.exit(1);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    adminApi.closeStreams();
    server.close(async () => {
      await database.close().catch(() => {});
      process.exit(0);
    });
  });
}
