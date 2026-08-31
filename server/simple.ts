import 'dotenv/config';
import express from 'express';
import { pool } from './db.js';
import authRouter from './routes/auth.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '2mb' }));

// Health check simples
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routers
app.use('/api/auth', authRouter);

// Inicializar banco DE FORMA NÃO-BLOQUEANTE
async function startServer() {
  try {
    console.log('📝 Testando conexão com banco...');
    const result = await pool.query('SELECT NOW()');
    console.log('✅ Conexão OK:', result.rows[0]);
    
    // Criar tabelas opcionalmente
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        token TEXT NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      )
    `);
    
    console.log('✅ Tabelas OK');
  } catch (e) {
    console.error('❌ Erro ao inicializar banco:', e.message);
    process.exit(1);
  }
}

// Inicializar e depois escutar
await startServer();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
