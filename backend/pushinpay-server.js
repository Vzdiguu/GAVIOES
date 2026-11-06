const http = require('node:http');
const crypto = require('node:crypto');

const PORT = Number(process.env.PORT || 8787);
const PUSHINPAY_API = process.env.PUSHINPAY_API_URL || 'https://api.pushinpay.com.br';
const PUSHINPAY_TOKEN = process.env.PUSHINPAY_TOKEN;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';

if (!PUSHINPAY_TOKEN) console.warn('[PushinPay] Defina PUSHINPAY_TOKEN antes de usar pagamentos reais.');

const json = (res, status, body) => {
  const data = JSON.stringify(body);
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','access-control-allow-origin':'*','cache-control':'no-store'});
  res.end(data);
};
const readBody = req => new Promise((resolve, reject) => {
  let body = ''; req.on('data', chunk => { body += chunk; if (body.length > 100000) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); } });
  req.on('error', reject);
});
const pushinpay = async (path, options = {}) => {
  if (!PUSHINPAY_TOKEN) throw new Error('PUSHINPAY_TOKEN não configurado no backend');
  const response = await fetch(`${PUSHINPAY_API}${path}`, { ...options, headers: {'Authorization': `Bearer ${PUSHINPAY_TOKEN}`, 'Accept':'application/json', 'Content-Type':'application/json', ...(options.headers || {})} });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = {raw:text}; }
  if (!response.ok) { const error = new Error(`PushinPay ${response.status}`); error.status = response.status; error.data = data; throw error; }
  return data;
};
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, {'access-control-allow-origin':'*','access-control-allow-methods':'POST,GET,OPTIONS','access-control-allow-headers':'content-type'}); return res.end(); }
  try {
    if (req.method === 'POST' && req.url === '/api/payments/pix') {
      const body = await readBody(req);
      const cents = Math.round(Number(body.value) * 100);
      if (!Number.isInteger(cents) || cents < 50) return json(res, 422, {error:'Valor Pix inválido.'});
      const charge = await pushinpay('/api/pix/cashIn', {method:'POST', body:JSON.stringify({value:cents, description:String(body.description || 'Matrícula Academia Gaviões').slice(0,255), webhook_url:PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/api/payments/pix/webhook` : null, split_rules:[]})});
      return json(res, 200, {id:charge.id,status:charge.status,qr_code:charge.qr_code,qr_code_base64:charge.qr_code_base64});
    }
    if (req.method === 'GET' && req.url.startsWith('/api/payments/pix/')) {
      const id = req.url.split('/').pop();
      if (!/^[a-f0-9-]{20,}$/i.test(id)) return json(res, 400, {error:'ID de cobrança inválido.'});
      const transaction = await pushinpay(`/api/transactions/${encodeURIComponent(id)}`, {method:'GET'});
      return json(res, 200, {id:transaction.id,status:transaction.status});
    }
    if (req.method === 'POST' && req.url === '/api/payments/pix/webhook') {
      const body = await readBody(req);
      // Persistir/validar o evento no seu banco antes de liberar a matrícula.
      console.log('[PushinPay webhook]', JSON.stringify({id:body.id,status:body.status}));
      return json(res, 200, {received:true});
    }
    json(res, 404, {error:'Endpoint não encontrado.'});
  } catch (error) { console.error(error); json(res, error.status || 500, {error:error.message,data:error.data || null}); }
});
server.listen(PORT, () => console.log(`PushinPay backend em http://localhost:${PORT}`));
