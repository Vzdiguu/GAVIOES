CREATE TABLE IF NOT EXISTS admin_orders (
  id UUID PRIMARY KEY,
  request_id UUID NOT NULL UNIQUE,
  charge_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('creating', 'pending', 'paid', 'expired', 'failed')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  cpf TEXT NOT NULL,
  phone TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  unit_name TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  value_cents INTEGER NOT NULL CHECK (value_cents >= 50),
  pix_code TEXT,
  qr_code_base64 TEXT,
  device TEXT NOT NULL DEFAULT '',
  contacted BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT NOT NULL DEFAULT '',
  accepted_terms_at TIMESTAMPTZ NOT NULL,
  terms_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  confirmation_email_sent_at TIMESTAMPTZ,
  confirmation_email_sending_at TIMESTAMPTZ,
  last_provider_check_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE admin_orders ADD COLUMN IF NOT EXISTS last_provider_check_at TIMESTAMPTZ;
ALTER TABLE admin_orders ADD COLUMN IF NOT EXISTS confirmation_email_sent_at TIMESTAMPTZ;
ALTER TABLE admin_orders ADD COLUMN IF NOT EXISTS confirmation_email_sending_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS admin_orders_created_at_idx ON admin_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_orders_status_created_at_idx ON admin_orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_orders_unit_created_at_idx ON admin_orders (unit_name, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_orders_cpf_status_idx ON admin_orders (cpf, status);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  password_digest CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_sessions_expires_at_idx ON admin_sessions (expires_at);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  ip_hash CHAR(64) PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_login_attempts_window_idx ON admin_login_attempts (window_started_at);

CREATE TABLE IF NOT EXISTS payment_request_limits (
  ip_hash CHAR(64) PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS payment_request_limits_window_idx ON payment_request_limits (window_started_at);

CREATE TABLE IF NOT EXISTS admin_push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  subscription JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
