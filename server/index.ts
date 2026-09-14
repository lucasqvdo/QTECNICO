import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';
import authRouter from './routes/auth.js';
import ordersRouter from './routes/orders.js';
import clientsRouter from './routes/clients.js';
import usersRouter from './routes/users.js';
import uploadsRouter from './routes/uploads.js';
import webauthnRouter from './routes/webauthn.js';

import { existsSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/auth', authRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/clients', clientsRouter);
app.use('/api/users', usersRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/auth/webauthn', webauthnRouter);
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith('/api')) {
    if (error?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'JSON inválido' });
    }
    return res.status(500).json({ error: 'Erro interno da API' });
  }
  next(error);
});

async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'Técnico',
        phone TEXT DEFAULT '',
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        photo_url TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS webauthn_credentials (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        public_key BYTEA NOT NULL,
        counter BIGINT NOT NULL DEFAULT 0,
        transports TEXT[] NOT NULL DEFAULT '{}',
        device_type TEXT,
        backed_up BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS webauthn_challenges (
        id BIGSERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('registration', 'authentication')),
        challenge TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS clients (
        id TEXT PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        name TEXT NOT NULL,
        document TEXT DEFAULT '',
        address TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        email TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        client_id TEXT REFERENCES clients(id),
        client_name TEXT NOT NULL,
        address TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        type TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        date DATE,
        priority TEXT DEFAULT 'medium',
        description TEXT DEFAULT '',
        client_value NUMERIC(14,2) DEFAULT 0,
        payment_status TEXT DEFAULT 'pending',
        paid_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        amount NUMERIC(14,2) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS attendances (
        id TEXT PRIMARY KEY,
        order_id TEXT REFERENCES orders(id) ON DELETE CASCADE,
        start_time TIMESTAMPTZ,
        end_time TIMESTAMPTZ,
        duration_seconds INTEGER DEFAULT 0,
        description TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS attendance_photos (
        id TEXT PRIMARY KEY,
        attendance_id TEXT REFERENCES attendances(id) ON DELETE CASCADE,
        storage_key TEXT NOT NULL,
        file_name TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
  } catch (error) {
    console.error('Erro ao inicializar banco:', error);
  }
}

async function start() {
  await initDb();
  const distPath = path.join(__dirname, '../dist');
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QTECNICO server running on port ${PORT}`);
  });
}

start();
