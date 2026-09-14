import pkg from 'pg';
const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  // 30 s: conexões ociosas são devolvidas ao pool após esse intervalo.
  // Provedores gerenciados (Supabase, Neon, Render) encerram conexões inativas
  // após poucos minutos — manter 0 (infinito) enche o pool de conexões mortas.
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('❌ Pool error:', err.message);
});

// Reconcilia estruturas que precisam existir antes das rotas serem registradas.
// CREATE TABLE IF NOT EXISTS não altera tabelas já criadas, portanto instalações
// existentes também precisam ter suas colunas/constraints reconciliadas.
async function reconcileWebAuthnSchema() {
  const tableCheck = await pool.query(`
    SELECT to_regclass('public.webauthn_challenges') AS table_name
  `);

  if (tableCheck.rows[0]?.table_name) {
    await pool.query(`
      ALTER TABLE webauthn_challenges
        ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'authentication'
    `);

    await pool.query(`
      ALTER TABLE webauthn_challenges
        DROP CONSTRAINT IF EXISTS webauthn_challenges_type_check
    `);

    await pool.query(`
      ALTER TABLE webauthn_challenges
        ADD CONSTRAINT webauthn_challenges_type_check
        CHECK (type IN ('registration', 'authentication'))
    `);
  }

  // Discoverable passkeys (usernameless authentication) do not know the user
  // before the authenticator returns a credential. Keep those short-lived
  // challenges separate from the legacy user-keyed challenge table.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS webauthn_auth_challenges (
      challenge TEXT PRIMARY KEY,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS webauthn_auth_challenges_expires_at_idx
      ON webauthn_auth_challenges (expires_at)
  `);

  await pool.query(`
    DELETE FROM webauthn_auth_challenges
    WHERE expires_at <= NOW()
  `);

  // The rate limiter is persisted in Postgres so limits survive restarts and
  // are shared across multiple application instances.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      reset_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS auth_rate_limits_reset_at_idx
      ON auth_rate_limits (reset_at)
  `);

  console.log('✅ Schema WebAuthn/rate-limit reconciliado');
}

async function reconcileMultiTenantSchema() {
  const accountsCheck = await pool.query(`SELECT to_regclass('public.accounts') AS table_name`);
  if (!accountsCheck.rows[0]?.table_name) {
    console.warn('⚠️ Tabelas de contas ainda não existem; reconciliação multiempresa será feita na próxima inicialização.');
    return;
  }

  // Explicit tenant ownership is kept on every business table. This removes
  // the previous implicit dependency on users.account_id and lets every query
  // enforce the tenant boundary directly.
  await pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS account_id INTEGER`);
  await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS account_id INTEGER`);
  await pool.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account_id INTEGER`);
  await pool.query(`ALTER TABLE attendances ADD COLUMN IF NOT EXISTS account_id INTEGER`);
  await pool.query(`ALTER TABLE attendance_photos ADD COLUMN IF NOT EXISTS account_id INTEGER`);
  await pool.query(`ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS account_id INTEGER`);

  // Backfill existing production data without changing any business values.
  await pool.query(`UPDATE clients c SET account_id = u.account_id FROM users u WHERE c.user_id = u.id AND c.account_id IS NULL`);
  await pool.query(`UPDATE orders o SET account_id = u.account_id FROM users u WHERE o.user_id = u.id AND o.account_id IS NULL`);
  await pool.query(`UPDATE expenses e SET account_id = o.account_id FROM orders o WHERE e.order_id = o.id AND e.account_id IS NULL`);
  await pool.query(`UPDATE attendances a SET account_id = o.account_id FROM orders o WHERE a.order_id = o.id AND a.account_id IS NULL`);
  await pool.query(`UPDATE order_payments p SET account_id = o.account_id FROM orders o WHERE p.order_id = o.id AND p.account_id IS NULL`);
  await pool.query(`UPDATE attendance_photos p SET account_id = a.account_id FROM attendances a WHERE p.attendance_id = a.id AND p.account_id IS NULL`);

  const orphaned = await pool.query(`
    SELECT
      (SELECT count(*) FROM clients WHERE account_id IS NULL) AS clients,
      (SELECT count(*) FROM orders WHERE account_id IS NULL) AS orders,
      (SELECT count(*) FROM expenses WHERE account_id IS NULL) AS expenses,
      (SELECT count(*) FROM attendances WHERE account_id IS NULL) AS attendances,
      (SELECT count(*) FROM order_payments WHERE account_id IS NULL) AS payments,
      (SELECT count(*) FROM attendance_photos WHERE account_id IS NULL) AS photos
  `);
  const o = orphaned.rows[0];
  if (Object.values(o).some((v: any) => Number(v) > 0)) {
    throw new Error(`Multiempresa: existem registros sem account_id: ${JSON.stringify(o)}`);
  }

  await pool.query(`ALTER TABLE clients ALTER COLUMN account_id SET NOT NULL`);
  await pool.query(`ALTER TABLE orders ALTER COLUMN account_id SET NOT NULL`);
  await pool.query(`ALTER TABLE expenses ALTER COLUMN account_id SET NOT NULL`);
  await pool.query(`ALTER TABLE attendances ALTER COLUMN account_id SET NOT NULL`);
  await pool.query(`ALTER TABLE attendance_photos ALTER COLUMN account_id SET NOT NULL`);
  await pool.query(`ALTER TABLE order_payments ALTER COLUMN account_id SET NOT NULL`);

  // Constraints are created idempotently because this reconciliation runs on every boot.
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clients_account_fk') THEN
        ALTER TABLE clients ADD CONSTRAINT clients_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_account_fk') THEN
        ALTER TABLE orders ADD CONSTRAINT orders_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_account_fk') THEN
        ALTER TABLE expenses ADD CONSTRAINT expenses_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendances_account_fk') THEN
        ALTER TABLE attendances ADD CONSTRAINT attendances_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attendance_photos_account_fk') THEN
        ALTER TABLE attendance_photos ADD CONSTRAINT attendance_photos_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_payments_account_fk') THEN
        ALTER TABLE order_payments ADD CONSTRAINT order_payments_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;
      END IF;
    END $$;
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS clients_account_idx ON clients(account_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS orders_account_idx ON orders(account_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS expenses_account_idx ON expenses(account_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS attendances_account_idx ON attendances(account_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS attendance_photos_account_idx ON attendance_photos(account_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS order_payments_account_idx ON order_payments(account_id)`);

  console.log('✅ Schema multiempresa reconciliado');
}

await reconcileWebAuthnSchema();
await reconcileMultiTenantSchema();
