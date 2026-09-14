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

await reconcileWebAuthnSchema();
