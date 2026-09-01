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
