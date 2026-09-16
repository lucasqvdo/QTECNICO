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
import dashboardRouter from './routes/dashboard.js';
import backofficeRouter from './routes/backoffice.js';

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
app.use('/api/dashboard', dashboardRouter);
app.use('/api/dashboard/backoffice', backofficeRouter);
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
        data_url TEXT NOT NULL,
        name TEXT DEFAULT ''
      );
    `);

    const userCheck = await pool.query("SELECT id FROM users WHERE email = 'lucas.qtech@gmail.com'");

    if (userCheck.rows.length === 0) {
      const hash = await bcrypt.hash('123456', 10);
      const userRes = await pool.query(
        `INSERT INTO users (name, role, phone, email, password_hash)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        ['Lucas Qtech', 'Técnico Eletricista — CREA/SP 123456', '(11) 99000-1234', 'lucas.qtech@gmail.com', hash]
      );
      const userId = userRes.rows[0].id;

      const clientsData = [
        { id: 'c1', name: 'Construtora Alpina Ltda',    document: '12.345.678/0001-90', address: 'Av. Paulista, 1374 — São Paulo, SP',       phone: '(11) 99832-4411', email: 'contato@alpina.com.br' },
        { id: 'c2', name: 'Residencial Parque Verde',   document: '98.765.432/0001-11', address: 'Rua das Flores, 88 — Campinas, SP',         phone: '(19) 98741-3300', email: 'admin@parqueverde.com.br' },
        { id: 'c3', name: 'Mercado Bom Preço',          document: '45.678.901/0001-23', address: 'Rua XV de Novembro, 220 — Santos, SP',      phone: '(13) 97654-8800', email: 'gerencia@bompreco.com.br' },
        { id: 'c4', name: 'Clínica São Lucas',          document: '78.901.234/0001-56', address: 'Av. Dom Pedro I, 450 — Ribeirão Preto, SP', phone: '(16) 99123-5566', email: 'recepcao@saolucas.com.br' },
        { id: 'c5', name: 'Escola Estadual Tiradentes', document: '11.222.333/0001-44', address: 'Rua Independência, 300 — Sorocaba, SP',     phone: '(15) 98900-1122', email: 'diretoria@eetiradentes.edu.br' },
      ];
      for (const c of clientsData) {
        await pool.query(
          'INSERT INTO clients (id, user_id, name, document, address, phone, email) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [c.id, userId, c.name, c.document, c.address, c.phone, c.email]
        );
      }
      console.log('✅ Dados iniciais inseridos');
    }

    await pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS client_signature TEXT`);
  } catch (error) {
    console.error('❌ Erro ao inicializar banco:', error);
  }
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const distPath = path.resolve(__dirname, '../dist');
if (existsSync(distPath)) app.use(express.static(distPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Endpoint não encontrado' });
  const indexPath = path.join(distPath, 'index.html');
  if (existsSync(indexPath)) return res.sendFile(indexPath);
  return res.status(404).send('Build não encontrado');
});

initDb().then(() => app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`)));
