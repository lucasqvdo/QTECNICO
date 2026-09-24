import fs from 'fs';
import { INITIAL_PLAN_CATALOG } from './planCatalog.js';
import pkg from 'pg';
import { MockPgPool } from './mockDb.js';

const { Pool } = pkg;

// Carrega .env se existir e sobrescreve placeholders
if (fs.existsSync('.env')) {
  try {
    const envContent = fs.readFileSync('.env', 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key] || process.env[key]?.includes('@host:') || process.env[key]?.includes('usuario:senha')) {
          process.env[key] = val;
        }
      }
    }
  } catch (err: any) {
    console.warn('Notice loading .env:', err.message);
  }
}

const isConfigured = Boolean(
  process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes('@host:') &&
  !process.env.DATABASE_URL.includes('usuario:senha') &&
  !process.env.DATABASE_URL.includes('nome_do_banco')
);

export const mockPoolInstance = new MockPgPool();
const useMockDb = process.env.USE_MOCK_DB === 'true';
let realPoolInstance: any = null;
let useRealDb = false;

if (!useMockDb && isConfigured) {
  try {
    realPoolInstance = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_URL?.includes('sslmode=') ? { rejectUnauthorized: false } : undefined,
    });
    realPoolInstance.on('error', (err: any) => console.error('❌ Pool error:', err.message));
  } catch (err: any) {
    console.error('❌ Erro ao criar pool Postgres:', err.message);
  }
}

function databaseUnavailableError(): Error {
  return new Error(
    useMockDb
      ? 'Banco de dados mock não está disponível.'
      : 'Banco PostgreSQL não está configurado ou disponível.'
  );
}

export const pool = {
  on(event: string, cb: any) {
    if (useRealDb && realPoolInstance) realPoolInstance.on(event, cb);
    return this;
  },
  async connect() {
    if (useMockDb) return mockPoolInstance.connect();
    if (!useRealDb || !realPoolInstance) throw databaseUnavailableError();
    return realPoolInstance.connect();
  },
  async query(text: string, params?: any[]) {
    if (useMockDb) return mockPoolInstance.query(text, params);
    if (!useRealDb || !realPoolInstance) throw databaseUnavailableError();
    return realPoolInstance.query(text, params);
  },
  async end() {
    if (useRealDb && realPoolInstance && typeof realPoolInstance.end === 'function') {
      await realPoolInstance.end();
    }
  },
};

async function reconcileWebAuthnSchema() {
  const tableCheck = await pool.query(`SELECT to_regclass('public.webauthn_challenges') AS table_name`);
  if (tableCheck.rows[0]?.table_name) {
    await pool.query(`ALTER TABLE webauthn_challenges ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'authentication'`);
    // Multiple Render instances can boot against the same database at once.
    // PostgreSQL does not support ADD CONSTRAINT IF NOT EXISTS, so handle
    // the duplicate-object race at the application level.
    try {
      await pool.query(`ALTER TABLE webauthn_challenges
        ADD CONSTRAINT webauthn_challenges_type_check
        CHECK (type IN ('registration', 'authentication'))`);
    } catch (err: any) {
      if (err?.code !== '42710') throw err;
    }
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS webauthn_auth_challenges (challenge TEXT PRIMARY KEY, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS webauthn_auth_challenges_expires_at_idx ON webauthn_auth_challenges (expires_at)`);
  await pool.query(`DELETE FROM webauthn_auth_challenges WHERE expires_at <= NOW()`);
  await pool.query(`CREATE TABLE IF NOT EXISTS auth_rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0, reset_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await pool.query(`CREATE INDEX IF NOT EXISTS auth_rate_limits_reset_at_idx ON auth_rate_limits (reset_at)`);
  console.log('✅ Schema WebAuthn/rate-limit reconciliado');
}

async function reconcileMultiTenantSchema() {
  const accountsCheck = await pool.query(`SELECT to_regclass('public.accounts') AS table_name`);
  if (!accountsCheck.rows[0]?.table_name) return;
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_id INTEGER`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS account_id INTEGER`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_technician_ids INTEGER[]`);
  await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account_id INTEGER`);
  await pool.query(`ALTER TABLE attendances ADD COLUMN IF NOT EXISTS account_id INTEGER`);
  await pool.query(`ALTER TABLE attendance_photos ADD COLUMN IF NOT EXISTS account_id INTEGER`);
  await pool.query(`ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS account_id INTEGER`);

  await pool.query(`UPDATE clients c SET account_id = u.account_id FROM users u WHERE c.user_id = u.id AND c.account_id IS NULL`);
  await pool.query(`UPDATE orders o SET account_id = u.account_id FROM users u WHERE o.user_id = u.id AND o.account_id IS NULL`);
  await pool.query(`UPDATE orders SET assigned_technician_ids = ARRAY[assigned_technician_id] WHERE assigned_technician_id IS NOT NULL AND (assigned_technician_ids IS NULL OR cardinality(assigned_technician_ids)=0)`);
  await pool.query(`UPDATE expenses e SET account_id = o.account_id FROM orders o WHERE e.order_id = o.id AND e.account_id IS NULL`);
  await pool.query(`UPDATE attendances a SET account_id = o.account_id FROM orders o WHERE a.order_id = o.id AND a.account_id IS NULL`);
  await pool.query(`UPDATE order_payments p SET account_id = o.account_id FROM orders o WHERE p.order_id = o.id AND p.account_id IS NULL`);
  await pool.query(`UPDATE attendance_photos p SET account_id = a.account_id FROM attendances a WHERE p.attendance_id = a.id AND p.account_id IS NULL`);

  const orphaned = await pool.query(`SELECT (SELECT count(*) FROM clients WHERE account_id IS NULL) AS clients, (SELECT count(*) FROM orders WHERE account_id IS NULL) AS orders, (SELECT count(*) FROM expenses WHERE account_id IS NULL) AS expenses, (SELECT count(*) FROM attendances WHERE account_id IS NULL) AS attendances, (SELECT count(*) FROM order_payments WHERE account_id IS NULL) AS payments, (SELECT count(*) FROM attendance_photos WHERE account_id IS NULL) AS photos`);
  if (orphaned.rows[0] && Object.values(orphaned.rows[0]).some((v: any) => Number(v) > 0)) {
    console.warn(`Multiempresa: existem registros sem account_id: ${JSON.stringify(orphaned.rows[0])}`);
    return;
  }

  try {
    await pool.query(`ALTER TABLE clients ALTER COLUMN account_id SET NOT NULL`);
    await pool.query(`ALTER TABLE orders ALTER COLUMN account_id SET NOT NULL`);
    await pool.query(`ALTER TABLE expenses ALTER COLUMN account_id SET NOT NULL`);
    await pool.query(`ALTER TABLE attendances ALTER COLUMN account_id SET NOT NULL`);
    await pool.query(`ALTER TABLE attendance_photos ALTER COLUMN account_id SET NOT NULL`);
    await pool.query(`ALTER TABLE order_payments ALTER COLUMN account_id SET NOT NULL`);

    await pool.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_account_fk') THEN ALTER TABLE clients ADD CONSTRAINT clients_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_account_fk') THEN ALTER TABLE orders ADD CONSTRAINT orders_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_account_fk') THEN ALTER TABLE expenses ADD CONSTRAINT expenses_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendances_account_fk') THEN ALTER TABLE attendances ADD CONSTRAINT attendances_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_photos_account_fk') THEN ALTER TABLE attendance_photos ADD CONSTRAINT attendance_photos_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_payments_account_fk') THEN ALTER TABLE order_payments ADD CONSTRAINT order_payments_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE; END IF;
    END $$;`);

    await pool.query(`CREATE INDEX IF NOT EXISTS clients_account_idx ON clients(account_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS orders_account_idx ON orders(account_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS orders_assigned_technicians_idx ON orders USING GIN (assigned_technician_ids)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS expenses_account_idx ON expenses(account_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS attendances_account_idx ON attendances(account_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS attendance_photos_account_idx ON attendance_photos(account_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS order_payments_account_idx ON order_payments(account_id)`);
    await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='users_lower_email_unique_idx') THEN CREATE UNIQUE INDEX users_lower_email_unique_idx ON users (LOWER(email)); END IF; END $$;`);
  } catch (err: any) {
    console.warn('Notice multi-tenant constraint/index check:', err.message);
  }
  console.log('✅ Schema multiempresa reconciliado');
}

async function reconcilePlanCatalog() {
  const tableCheck = await pool.query(`SELECT to_regclass('public.saas_plans') AS table_name`);
  if (!tableCheck.rows[0]?.table_name) return;
  for (const [key,name,description,amount,features,limits] of INITIAL_PLAN_CATALOG) {
    await pool.query(`INSERT INTO saas_plans (plan_key,name,description,amount,currency,billing_interval,active,features,limits) VALUES ($1,$2,$3,$4,'BRL','month',TRUE,$5::jsonb,$6::jsonb) ON CONFLICT (plan_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,amount=EXCLUDED.amount,currency=EXCLUDED.currency,billing_interval=EXCLUDED.billing_interval,active=TRUE,features=EXCLUDED.features,limits=EXCLUDED.limits,updated_at=NOW()`,[key,name,description,amount,JSON.stringify(features),JSON.stringify(limits)]);
  }
  const legacyKeys = ['free','light','medium','power','professional','enterprise'];
  await pool.query(`UPDATE accounts SET plan_key='essential' WHERE plan_key = ANY($1::text[])`, [legacyKeys]);
  await pool.query(`UPDATE subscriptions SET plan_key='essential',updated_at=NOW() WHERE plan_key = ANY($1::text[])`, [legacyKeys]);
  await pool.query(`DELETE FROM saas_plans WHERE plan_key = ANY($1::text[])`, [legacyKeys]);
  console.log('✅ Catálogo de planos reconciliado: somente essential, pro e business');
}

export async function initDbSchema() {
  if (useMockDb) {
    console.warn('⚠️ USE_MOCK_DB=true — usando banco de dados em memória. Não usar em produção.');
  } else {
    if (!isConfigured || !realPoolInstance) {
      throw new Error('DATABASE_URL não configurada. O QTECNICO não pode iniciar em produção sem PostgreSQL.');
    }
    await realPoolInstance.query('SELECT 1');
    useRealDb = true;
    console.log('✅ Conectado ao PostgreSQL com sucesso');
  }

  await reconcileWebAuthnSchema();
  await reconcileMultiTenantSchema();
  await reconcilePlanCatalog();
}
