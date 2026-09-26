import { pool } from './db.js';

export async function migrateClientPortal(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_portal_access (
      id BIGSERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      public_id TEXT NOT NULL UNIQUE,
      phone_normalized TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(account_id, client_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_portal_sessions (
      id BIGSERIAL PRIMARY KEY,
      portal_access_id BIGINT NOT NULL REFERENCES client_portal_access(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_portal_events (
      id BIGSERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      quote_id BIGINT REFERENCES quotes(id) ON DELETE SET NULL,
      order_id TEXT REFERENCES orders(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS client_portal_access_login_idx ON client_portal_access(public_id,phone_normalized) WHERE active=TRUE');
  await pool.query('CREATE INDEX IF NOT EXISTS client_portal_sessions_token_idx ON client_portal_sessions(token_hash) WHERE revoked_at IS NULL');
  await pool.query('CREATE INDEX IF NOT EXISTS client_portal_events_client_idx ON client_portal_events(account_id,client_id,created_at DESC)');
}
