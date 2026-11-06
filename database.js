const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
let pool = null;
let ready = false;

if (connectionString) {
  let sslMode = process.env.PGSSLMODE || '';
  try {
    sslMode ||= new URL(connectionString).searchParams.get('sslmode') || '';
  } catch {
    // The driver will report a malformed connection string without logging it.
  }

  pool = new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 7000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    ...(sslMode === 'require' ? { ssl: { rejectUnauthorized: false } } : {}),
  });
}

async function initialize() {
  if (!pool) return false;
  await pool.query('SELECT 1');
  const schema = fs.readFileSync(path.join(__dirname, 'admin-schema.sql'), 'utf8');
  await pool.query(schema);
  ready = true;
  return true;
}

function isReady() {
  return Boolean(pool && ready);
}

async function query(sql, params = []) {
  if (!isReady()) {
    const error = new Error('Banco de dados indisponível.');
    error.status = 503;
    error.code = 'DATABASE_UNAVAILABLE';
    throw error;
  }
  return pool.query(sql, params);
}

async function close() {
  ready = false;
  if (pool) await pool.end();
}

module.exports = { initialize, isReady, query, close };
