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

// Reconcilia bancos existentes antes da inicialização das rotas.
// CREATE TABLE IF NOT EXISTS não altera tabelas já criadas, portanto uma
// instalação antiga pode não possuir a coluna `type` usada pelos desafios WebAuthn.
async function reconcileWebAuthnSchema() {
  const tableCheck = await pool.query(`
    SELECT to_regclass('public.webauthn_challenges') AS table_name
  `);

  if (!tableCheck.rows[0]?.table_name) return;

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

  console.log('✅ Schema WebAuthn reconciliado');
}

await reconcileWebAuthnSchema();
